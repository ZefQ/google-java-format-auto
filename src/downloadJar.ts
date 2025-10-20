import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import * as vscode from "vscode";

const channel = vscode.window.createOutputChannel("Google Java Format");

export async function ensureJar(context: vscode.ExtensionContext): Promise<string> {
  const config = vscode.workspace.getConfiguration("googleJavaFormat");
  const version = config.get<string>("version", "1.30.0");
  const urlTemplate = config.get<string>(
    "downloadUrl",
    "https://github.com/google/google-java-format/releases/download/v${version}/google-java-format-${version}-all-deps.jar",
  );

  const jarFilename = `google-java-format-${version}-all-deps.jar`;
  const jarUrl = urlTemplate.replace(/\$\{version\}/g, version);
  const jarDir = context.globalStorageUri.fsPath;
  const jarPath = path.join(jarDir, jarFilename);

  await fs.promises.mkdir(jarDir, { recursive: true });

  channel.appendLine(`Using google-java-format version ${version}`);
  channel.appendLine(`Resolved URL: ${jarUrl}`);
  channel.appendLine(`Storage dir: ${jarDir}`);

  try {
    const files = await fs.promises.readdir(jarDir);
    for (const file of files) {
      if (file.startsWith("google-java-format-") && file.endsWith(".jar") && file !== jarFilename) {
        channel.appendLine(`Removing old JAR: ${file}`);
        await fs.promises
          .unlink(path.join(jarDir, file))
          .catch((e) => channel.appendLine(`Failed to delete ${file}: ${e}`));
      }
    }
  } catch (e) {
    channel.appendLine(`Cleanup failed: ${e}`);
  }

  try {
    await fs.promises.access(jarPath, fs.constants.F_OK);
    channel.appendLine(`JAR already exists: ${jarFilename}`);
    return jarPath;
  } catch {
    channel.appendLine(`Downloading google-java-format ${version}...`);
    try {
      await downloadFile(jarUrl, jarPath);
      channel.appendLine(`✅ Download complete: ${jarPath}`);
      return jarPath;
    } catch (err) {
      channel.appendLine(`❌ Download failed: ${(err as Error).message}`);
      vscode.window.showErrorMessage(`Failed to download google-java-format ${version}`);
      throw err;
    }
  }
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
