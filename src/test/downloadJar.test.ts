import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ensureJar } from "../downloadJar";

suite("downloadJar.ts", () => {
  const fakeContext = {
    globalStorageUri: vscode.Uri.file(path.join(__dirname, ".tmp")),
  } as unknown as vscode.ExtensionContext;

  test("should download the jar if not present", async () => {
    const jarPath = await ensureJar(fakeContext);
    assert.ok(fs.existsSync(jarPath), "Jar file should exist after ensureJar()");
  });

  test("should reuse existing jar if already downloaded", async () => {
    const first = await ensureJar(fakeContext);
    const second = await ensureJar(fakeContext);
    assert.strictEqual(first, second, "Paths should match for cached jar");
  });
});
