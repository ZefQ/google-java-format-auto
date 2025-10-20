import { execFile } from "child_process";
import * as vscode from "vscode";
import { ensureJar } from "./downloadJar";

export async function activate(context: vscode.ExtensionContext) {
  const channel = vscode.window.createOutputChannel("Google Java Format");
  channel.appendLine("🚀 Extension activated");

  try {
    const jarPath = await ensureJar(context);
    channel.appendLine(`Using jar at: ${jarPath}`);

    const provider = vscode.languages.registerDocumentFormattingEditProvider("java", {
      provideDocumentFormattingEdits(document: vscode.TextDocument): Thenable<vscode.TextEdit[]> {
        return new Promise((resolve, reject) => {
          const config = vscode.workspace.getConfiguration("googleJavaFormat");
          const useAosp = config.get<boolean>("aospStyle", false);

          const text = document.getText();
          const args = ["-jar", jarPath];
          if (useAosp) args.push("--aosp");
          args.push("-");

          const process = execFile(
            "java",
            args,
            { maxBuffer: 20 * 1024 * 1024 },
            (error, stdout, stderr) => {
              if (error) {
                channel.appendLine(`❌ Formatting failed: ${stderr || error.message}`);
                vscode.window.showErrorMessage(
                  `google-java-format failed: ${stderr || error.message}`,
                );
                reject(error);
                return;
              }

              const range = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length),
              );
              channel.appendLine("✅ Formatting succeeded");
              resolve([vscode.TextEdit.replace(range, stdout)]);
            },
          );

          process.stdin?.write(text);
          process.stdin?.end();
        });
      },
    });

    context.subscriptions.push(provider);

    context.subscriptions.push(
      vscode.commands.registerCommand("google-java-format-auto.test", () => {
        vscode.window.showInformationMessage("✅ google-java-format-auto is active!");
        channel.show(true);
        channel.appendLine("Test command executed");
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("google-java-format-auto.updateJar", async () => {
        channel.show(true);
        channel.appendLine("🔁 Manual JAR update requested...");
        try {
          const jarPath = await ensureJar(context);
          channel.appendLine(`✅ google-java-format updated successfully: ${jarPath}`);
          vscode.window.showInformationMessage("google-java-format JAR updated successfully!");
        } catch (err) {
          channel.appendLine(`❌ Update failed: ${(err as Error).message}`);
          vscode.window.showErrorMessage("Failed to update google-java-format JAR");
        }
      }),
    );

    channel.appendLine("Formatter registered successfully");
  } catch (e) {
    channel.appendLine(`❌ Failed to activate: ${(e as Error).message}`);
  }
}

export function deactivate() {}
