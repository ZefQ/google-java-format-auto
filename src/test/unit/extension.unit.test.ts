import {
  mockVscode,
  registeredCommands,
  registeredProviders,
  resetVscodeMock,
} from "../support/vscodeMock";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { activate } from "../../extension";
import { setConfigurationProvider, setDownloadHandler } from "../../downloadJar";

suite("Extension activation (unit)", () => {
  const tmpDir = path.join(__dirname, ".tmp-extension");
  const jarContent = Buffer.from("extension-fake-jar");
  let fakeContext: vscode.ExtensionContext;

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
      const configInterface = {
        get<T>(key: string, defaultValue?: T): T {
          if (Object.prototype.hasOwnProperty.call(configValues, key)) {
            const typedKey = key as keyof typeof configValues;
            return configValues[typedKey] as unknown as T;
          }
          return defaultValue as T;
        },
      };
      return configInterface as unknown as vscode.WorkspaceConfiguration;
    });

    mockVscode.workspace.getConfiguration = (section?: string) => {
      if (section && section !== "googleJavaFormat") {
        return { get: () => undefined } as unknown as vscode.WorkspaceConfiguration;
      }
      const configInterface = {
        get<T>(key: string, defaultValue?: T): T {
          if (Object.prototype.hasOwnProperty.call(configValues, key)) {
            const typedKey = key as keyof typeof configValues;
            return configValues[typedKey] as unknown as T;
          }
          return defaultValue as T;
        },
      };
      return configInterface as unknown as vscode.WorkspaceConfiguration;
    };
  }

  setup(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    resetVscodeMock();
    fakeContext = {
      globalStorageUri: vscode.Uri.file(tmpDir),
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
    installConfigurationProvider();
    setDownloadHandler(async (_url, dest) => {
      await fs.promises.writeFile(dest, jarContent);
    });
  });

  teardown(async () => {
    if (fakeContext) {
      for (const disposable of fakeContext.subscriptions ?? []) {
        disposable?.dispose?.();
      }
    }
    setDownloadHandler(undefined);
    setConfigurationProvider(undefined);
    resetVscodeMock();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  test("should activate the extension and register integrations", async () => {
    await activate(fakeContext);

    assert.strictEqual(
      registeredProviders.length,
      1,
      "Document formatting provider should be registered",
    );
    assert.deepStrictEqual(
      registeredCommands.map((command) => command.id).sort(),
      ["google-java-format-auto.test", "google-java-format-auto.updateJar"].sort(),
      "Expected commands should be registered",
    );
    assert.ok(fakeContext.subscriptions.length >= 3, "Subscriptions should collect disposables");
  });
});
