import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension activation (integration)", () => {
  test("should activate the extension", async () => {
    const extension = vscode.extensions.getExtension("zefq.google-java-format-auto");
    assert.ok(extension, "Extension should be discoverable by ID");

    await extension!.activate();
    assert.ok(extension!.isActive, "Extension should report active after activation");
  });
});
