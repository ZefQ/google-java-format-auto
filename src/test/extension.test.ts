import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension activation", () => {
  test("should activate the extension", async () => {
    const ext = vscode.extensions.getExtension("zefq.google-java-format-auto");
    assert.ok(ext, "Extension should be found by ID");

    await ext!.activate();
    assert.ok(ext!.isActive, "Extension should be active after activation");
  });
});
