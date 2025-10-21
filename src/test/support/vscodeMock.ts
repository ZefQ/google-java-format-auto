import Module from "module";

type OutputChannel = {
  appendLine: (value: string) => void;
  show: (preserveFocus?: boolean) => void;
};

const mockOutputChannel: OutputChannel = {
  appendLine: () => undefined,
  show: () => undefined,
};

const registeredCommands: Array<{ id: string; callback: (...args: unknown[]) => unknown }> = [];
const registeredProviders: Array<{
  languageId: string | { language: string };
  provider: unknown;
}> = [];

const mockVscode = {
  window: {
    createOutputChannel: () => mockOutputChannel,
    showErrorMessage: () => undefined,
    showInformationMessage: () => undefined,
  },
  workspace: {
    getConfiguration: (..._args: unknown[]) =>
      ({
        get: () => undefined,
      }) as unknown,
  } as Record<string, unknown>,
  commands: {
    registerCommand: (id: string, callback: (...args: unknown[]) => unknown) => {
      registeredCommands.push({ id, callback });
      return { dispose: () => undefined };
    },
    _registered: registeredCommands,
  },
  languages: {
    registerDocumentFormattingEditProvider: (
      languageId: string | { language: string },
      provider: unknown,
    ) => {
      registeredProviders.push({ languageId, provider });
      return { dispose: () => undefined };
    },
    _registered: registeredProviders,
  },
  Range: class Range {
    constructor(
      public start: unknown,
      public end: unknown,
    ) {}
  },
  TextEdit: {
    replace: (range: unknown, newText: string) => ({ range, newText }),
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
  },
  ConfigurationTarget: {
    Global: "GLOBAL",
    Workspace: "WORKSPACE",
    WorkspaceFolder: "WORKSPACE_FOLDER",
  },
};

const originalRequire = Module.prototype.require;

Module.prototype.require = function patchedRequire(id: string) {
  if (id === "vscode") {
    return mockVscode;
  }
  return originalRequire.call(this, id);
};

export function resetVscodeMock(): void {
  registeredCommands.splice(0, registeredCommands.length);
  registeredProviders.splice(0, registeredProviders.length);
}

export { mockVscode, registeredCommands, registeredProviders };
