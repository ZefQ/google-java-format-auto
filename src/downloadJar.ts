import { createHash } from "crypto";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import * as vscode from "vscode";

const channel = vscode.window.createOutputChannel("Google Java Format");

export type DownloadHandler = (url: string, dest: string) => Promise<void>;

let customDownloadHandler: DownloadHandler | undefined;
let configurationProvider: (() => vscode.WorkspaceConfiguration) | undefined;

export function setDownloadHandler(handler?: DownloadHandler) {
  customDownloadHandler = handler;
}

export function setConfigurationProvider(provider?: () => vscode.WorkspaceConfiguration): void {
  configurationProvider = provider;
}

function getDownloadHandler(): DownloadHandler {
  return customDownloadHandler ?? downloadFile;
}

function getConfiguration(): vscode.WorkspaceConfiguration {
  return configurationProvider?.() ?? vscode.workspace.getConfiguration("googleJavaFormat");
}

export async function ensureJar(context: vscode.ExtensionContext): Promise<string> {
  const config = getConfiguration();
  const version = config.get<string>("version", "1.30.0");
  const urlTemplate = config.get<string>(
    "downloadUrl",
    "https://github.com/google/google-java-format/releases/download/v${version}/google-java-format-${version}-all-deps.jar",
  );

  const jarFilename = `google-java-format-${version}-all-deps.jar`;
  const jarUrl = urlTemplate.replace(/\$\{version\}/g, version);
  const jarDir = context.globalStorageUri.fsPath;
  const jarPath = path.join(jarDir, jarFilename);
  const checksumSetting = config.get<string>("checksum", "").trim();
  const checksum = checksumSetting ? checksumSetting.toLowerCase() : undefined;
  const manifestPath = `${jarPath}.json`;

  await fs.promises.mkdir(jarDir, { recursive: true });

  channel.appendLine(`Using google-java-format version ${version}`);
  channel.appendLine(`Resolved URL: ${jarUrl}`);
  channel.appendLine(`Storage dir: ${jarDir}`);
  if (checksum) {
    channel.appendLine(`Expected SHA-256 checksum: ${checksum}`);
  } else {
    channel.appendLine("No checksum configured; skipping integrity verification");
  }

  try {
    const files = await fs.promises.readdir(jarDir);
    for (const file of files) {
      if (file.startsWith("google-java-format-") && file.endsWith(".jar") && file !== jarFilename) {
        channel.appendLine(`Removing old JAR: ${file}`);
        const oldJarPath = path.join(jarDir, file);
        await fs.promises
          .unlink(oldJarPath)
          .catch((e) => channel.appendLine(`Failed to delete ${file}: ${e}`));
        const oldManifestPath = `${oldJarPath}.json`;
        await fs.promises.unlink(oldManifestPath).catch((e) => {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
            channel.appendLine(`Failed to delete manifest for ${file}: ${e}`);
          }
        });
      }
    }
  } catch (e) {
    channel.appendLine(`Cleanup failed: ${e}`);
  }

  let jarExists = false;
  try {
    await fs.promises.access(jarPath, fs.constants.F_OK);
    jarExists = true;
    channel.appendLine(`JAR already exists: ${jarFilename}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      channel.appendLine(`JAR access failed: ${err}`);
    }
  }

  if (jarExists) {
    const manifest = await readManifest(manifestPath);
    if (manifest) {
      const manifestChecksum = manifest.checksum ? manifest.checksum.toLowerCase() : undefined;
      const versionMatches = manifest.version === version;
      const urlMatches = manifest.downloadUrl === jarUrl;

      if (versionMatches && urlMatches) {
        if (checksum) {
          if (manifestChecksum === checksum) {
            channel.appendLine("Using cached JAR metadata from manifest");
            return jarPath;
          }

          channel.appendLine("Manifest checksum mismatch; revalidating cached JAR");
          let existingChecksum: string | undefined;
          try {
            existingChecksum = await calculateChecksum(jarPath);
          } catch (err) {
            channel.appendLine(`Checksum calculation failed: ${err}`);
          }

          if (existingChecksum === checksum) {
            await writeManifest(manifestPath, {
              version,
              downloadUrl: jarUrl,
              checksum: existingChecksum,
              downloadedAt: new Date().toISOString(),
            });
            channel.appendLine("Updated manifest after checksum validation");
            return jarPath;
          }

          channel.appendLine(
            `Checksum mismatch for cached JAR (expected: ${checksum}, actual: ${existingChecksum ?? "unknown"}). Re-downloading...`,
          );
          await removeStaleJar(jarPath, manifestPath);
          jarExists = false;
        } else {
          channel.appendLine("Using cached JAR metadata from manifest");
          return jarPath;
        }
      } else {
        channel.appendLine("Manifest mismatch with current configuration; re-downloading JAR");
        await removeStaleJar(jarPath, manifestPath);
        jarExists = false;
      }
    } else {
      channel.appendLine("No manifest found for cached JAR; validating existing file");
      let existingChecksum: string | undefined;
      try {
        existingChecksum = await calculateChecksum(jarPath);
      } catch (err) {
        channel.appendLine(`Checksum calculation failed: ${err}`);
      }

      if (!existingChecksum) {
        channel.appendLine("Unable to validate cached JAR. Re-downloading...");
        await removeStaleJar(jarPath, manifestPath);
        jarExists = false;
      } else if (checksum && existingChecksum !== checksum) {
        channel.appendLine(
          `Checksum mismatch for cached JAR (expected: ${checksum}, actual: ${existingChecksum}). Re-downloading...`,
        );
        await removeStaleJar(jarPath, manifestPath);
        jarExists = false;
      } else {
        await writeManifest(manifestPath, {
          version,
          downloadUrl: jarUrl,
          checksum: existingChecksum,
          downloadedAt: new Date().toISOString(),
        });
        channel.appendLine("Generated manifest for existing JAR");
        return jarPath;
      }
    }
  }

  channel.appendLine(`Downloading google-java-format ${version}...`);
  try {
    const downloader = getDownloadHandler();
    await downloader(jarUrl, jarPath);
    channel.appendLine(`✅ Download complete: ${jarPath}`);

    let downloadedChecksum: string | undefined;
    try {
      downloadedChecksum = await calculateChecksum(jarPath);
    } catch (err) {
      channel.appendLine(`Checksum calculation failed: ${err}`);
    }

    if (!downloadedChecksum) {
      await removeStaleJar(jarPath, manifestPath);
      vscode.window.showErrorMessage(`Failed to verify google-java-format ${version}`);
      throw new Error("Checksum calculation failed");
    }

    if (checksum && downloadedChecksum !== checksum) {
      channel.appendLine(
        `❌ Checksum mismatch after download (expected: ${checksum}, actual: ${downloadedChecksum})`,
      );
      await removeStaleJar(jarPath, manifestPath);
      vscode.window.showErrorMessage(
        `Checksum verification failed for google-java-format ${version}`,
      );
      throw new Error("Checksum verification failed");
    }

    if (checksum) {
      channel.appendLine("Checksum verified after download");
    } else {
      channel.appendLine("Recorded checksum for downloaded JAR");
    }

    await writeManifest(manifestPath, {
      version,
      downloadUrl: jarUrl,
      checksum: downloadedChecksum,
      downloadedAt: new Date().toISOString(),
    });

    return jarPath;
  } catch (err) {
    channel.appendLine(`❌ Download failed: ${(err as Error).message}`);
    vscode.window.showErrorMessage(`Failed to download google-java-format ${version}`);
    throw err;
  }
}

interface JarManifest {
  version: string;
  downloadUrl: string;
  checksum?: string;
  downloadedAt: string;
}

async function readManifest(manifestPath: string): Promise<JarManifest | undefined> {
  try {
    const raw = await fs.promises.readFile(manifestPath, "utf8");
    return JSON.parse(raw) as JarManifest;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    channel.appendLine(`Failed to read manifest ${manifestPath}: ${err}`);
    return undefined;
  }
}

async function writeManifest(manifestPath: string, manifest: JarManifest): Promise<void> {
  try {
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  } catch (err) {
    channel.appendLine(`Failed to write manifest ${manifestPath}: ${err}`);
  }
}

async function removeStaleJar(jarPath: string, manifestPath: string): Promise<void> {
  await fs.promises.unlink(jarPath).catch((err) => {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      channel.appendLine(`Failed to delete JAR ${path.basename(jarPath)}: ${err}`);
    }
  });

  await fs.promises.unlink(manifestPath).catch((err) => {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      channel.appendLine(`Failed to delete manifest ${path.basename(manifestPath)}: ${err}`);
    }
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        file.close(() =>
          fs.promises.unlink(dest).finally(() => {
            downloadFile(response.headers.location!, dest).then(resolve, reject);
          }),
        );
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on("finish", () => file.close((err) => (err ? reject(err) : resolve())));
    });

    request.setTimeout(15000, () => {
      request.destroy(new Error("Download timeout"));
    });

    request.on("error", (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

export function calculateChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
