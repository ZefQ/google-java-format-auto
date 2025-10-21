import { mockVscode, resetVscodeMock } from "../support/vscodeMock";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  ensureJar,
  calculateChecksum,
  setDownloadHandler,
  setConfigurationProvider,
} from "../../downloadJar";
import { createHash } from "crypto";

suite("downloadJar.ts", () => {
  const tmpDir = path.join(__dirname, ".tmp");
  const jarContent = Buffer.from("fake-binary-jar");
  const jarChecksum = createHash("sha256").update(jarContent).digest("hex");
  const fakeContext = {
    globalStorageUri: vscode.Uri.file(tmpDir),
  } as unknown as vscode.ExtensionContext;

  const configValues: {
    version: string;
    downloadUrl: string;
    checksum: string;
  } = {
    version: "1.30.0",
    downloadUrl:
      "https://github.com/google/google-java-format/releases/download/v${version}/google-java-format-${version}-all-deps.jar",
    checksum: "",
  };

  function installConfigurationProvider() {
    setConfigurationProvider(() => {
      const keys = Object.keys(configValues) as Array<keyof typeof configValues>;
      const config = {
        get<T>(section: string, defaultValue?: T): T {
          if (keys.includes(section as keyof typeof configValues)) {
            const key = section as keyof typeof configValues;
            return configValues[key] as unknown as T;
          }
          return defaultValue as T;
        },
      };
      return config as unknown as vscode.WorkspaceConfiguration;
    });
  }

  setup(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    configValues.version = "1.30.0";
    configValues.downloadUrl =
      "https://github.com/google/google-java-format/releases/download/v${version}/google-java-format-${version}-all-deps.jar";
    configValues.checksum = "";
    installConfigurationProvider();
    mockVscode.workspace.getConfiguration = (section?: string) => {
      if (section && section !== "googleJavaFormat") {
        return { get: () => undefined } as unknown as vscode.WorkspaceConfiguration;
      }
      const configInterface = {
        get<T>(key: string, defaultValue?: T) {
          if (Object.prototype.hasOwnProperty.call(configValues, key)) {
            const typedKey = key as keyof typeof configValues;
            return configValues[typedKey] as unknown as T;
          }
          return defaultValue as T;
        },
      };
      return configInterface as unknown as vscode.WorkspaceConfiguration;
    };
    setDownloadHandler(async (_url, dest) => {
      await fs.promises.writeFile(dest, jarContent);
    });
    resetVscodeMock();
  });

  teardown(async () => {
    setDownloadHandler(undefined);
    setConfigurationProvider(undefined);
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  test("should download the jar if not present", async () => {
    const jarPath = await ensureJar(fakeContext);
    assert.ok(fs.existsSync(jarPath), "Jar file should exist after ensureJar()");
    const jarBuffer = await fs.promises.readFile(jarPath);
    assert.ok(jarBuffer.equals(jarContent), "Jar content should match mocked download");
  });

  test("should reuse existing jar if already downloaded", async () => {
    const first = await ensureJar(fakeContext);
    const second = await ensureJar(fakeContext);
    assert.strictEqual(first, second, "Paths should match for cached jar");
  });

  test("should respect checksum configuration when provided", async () => {
    configValues.checksum = jarChecksum;
    const jarPath = await ensureJar(fakeContext);
    const manifestPath = `${jarPath}.json`;
    const manifestRaw = await fs.promises.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw) as { checksum?: string };
    assert.strictEqual(manifest.checksum, jarChecksum);
  });

  test("should persist manifest metadata for downloaded jar", async () => {
    const jarPath = await ensureJar(fakeContext);
    const manifestPath = `${jarPath}.json`;

    const manifestRaw = await fs.promises.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw) as {
      version: string;
      downloadUrl: string;
      checksum?: string;
      downloadedAt: string;
    };

    const expectedUrl = configValues.downloadUrl.replace(/\$\{version\}/g, configValues.version);

    assert.strictEqual(manifest.version, configValues.version, "Manifest should store jar version");
    assert.strictEqual(
      manifest.downloadUrl,
      expectedUrl,
      "Manifest should store resolved download URL",
    );
    assert.ok(manifest.downloadedAt, "Manifest should include download timestamp");
    assert.ok(
      manifest.checksum && manifest.checksum.length === 64,
      "Manifest should include a SHA-256 checksum",
    );
    assert.strictEqual(
      manifest.checksum,
      jarChecksum,
      "Manifest checksum should match mocked download",
    );
  });

  test("should redownload when version changes", async () => {
    let downloadCount = 0;
    setDownloadHandler(async (_url, dest) => {
      downloadCount += 1;
      await fs.promises.writeFile(dest, Buffer.from(`content-${downloadCount}`));
    });

    const firstJar = await ensureJar(fakeContext);
    const firstManifest = JSON.parse(await fs.promises.readFile(`${firstJar}.json`, "utf8")) as {
      version: string;
      downloadedAt: string;
    };
    assert.strictEqual(downloadCount, 1);
    assert.strictEqual(firstManifest.version, "1.30.0");

    const oldJarExists = await fs.promises
      .access(firstJar, fs.constants.F_OK)
      .then(() => true)
      .catch(() => false);
    assert.ok(oldJarExists, "First jar should exist after initial download");

    configValues.version = "2.0.0";

    const secondJar = await ensureJar(fakeContext);
    assert.strictEqual(downloadCount, 2, "Second download should occur for new version");
    assert.notStrictEqual(secondJar, firstJar, "Jar path should change with version");

    const oldJarStillExists = await fs.promises
      .access(firstJar, fs.constants.F_OK)
      .then(() => true)
      .catch(() => false);
    assert.strictEqual(
      oldJarStillExists,
      false,
      "Old version jar should be removed when new version is downloaded",
    );

    const secondManifest = JSON.parse(await fs.promises.readFile(`${secondJar}.json`, "utf8")) as {
      version: string;
      downloadedAt: string;
    };
    assert.strictEqual(secondManifest.version, "2.0.0");
    assert.notStrictEqual(
      secondManifest.downloadedAt,
      firstManifest.downloadedAt,
      "Manifest timestamp should update after new download",
    );
  });

  test("should regenerate manifest when checksum changes", async () => {
    const jarPath = await ensureJar(fakeContext);
    const manifestPath = `${jarPath}.json`;
    const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8")) as {
      checksum?: string;
    };
    assert.strictEqual(manifest?.checksum, jarChecksum);

    await fs.promises.writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, checksum: "0".repeat(64) }),
      "utf8",
    );

    configValues.checksum = jarChecksum;
    await ensureJar(fakeContext);

    const updatedManifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8")) as {
      checksum?: string;
    };
    assert.strictEqual(
      updatedManifest?.checksum,
      jarChecksum,
      "Manifest checksum should be updated to actual checksum during validation",
    );
  });

  test("should keep manifest stable when jar configuration is unchanged", async () => {
    const jarPath = await ensureJar(fakeContext);
    const manifestPath = `${jarPath}.json`;

    const firstManifestRaw = await fs.promises.readFile(manifestPath, "utf8");
    const firstManifest = JSON.parse(firstManifestRaw) as { downloadedAt: string };

    await new Promise((resolve) => setTimeout(resolve, 10));
    await ensureJar(fakeContext);

    const secondManifestRaw = await fs.promises.readFile(manifestPath, "utf8");
    const secondManifest = JSON.parse(secondManifestRaw) as { downloadedAt: string };

    assert.strictEqual(
      secondManifest.downloadedAt,
      firstManifest.downloadedAt,
      "Manifest timestamp should remain unchanged when cache is reused",
    );
  });

  test("should calculate sha256 checksum for a file", async () => {
    const tmpDir = path.join(__dirname, ".tmp");
    await fs.promises.mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, "checksum-fixture.txt");
    await fs.promises.writeFile(filePath, "hello checksum");

    const checksum = await calculateChecksum(filePath);
    assert.strictEqual(
      checksum,
      "2187766ebb93f57fbcb53b559a612bc2f95c4bc306abf35dfa13e7e7ead58ce0",
      "Checksum should match known SHA-256 hash",
    );
  });
});
