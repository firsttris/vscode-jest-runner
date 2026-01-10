// __mocks__/vscode.ts

class Uri {
  constructor(readonly fsPath: string) {}
  
  static file(path: string): Uri {
    return new Uri(path);
  }
}

class Document {
  constructor(public readonly uri: Uri) {}
  fileName: string = '';
  getText: (range?: any) => string = () => '';
  save: () => Promise<boolean> = () => Promise.resolve(true);
}

class TextEditor {
  constructor(public readonly document: Document) {}
  selection: any;
}

class WorkspaceFolder {
  constructor(public readonly uri: Uri) {}

  name: string;
  index: number;
}

class Range {
  constructor(
    public readonly startLine: number,
    public readonly startColumn: number,
    public readonly endLine: number,
    public readonly endColumn: number,
  ) {}
}

class CodeLens {
  constructor(
    public readonly range: Range,
    public readonly command?: any,
  ) {}
}

class Workspace {
  getWorkspaceFolder(uri: Uri): { uri: Uri } {
    return { uri };
  }

  getConfiguration() {
    throw new WorkspaceConfiguration({});
  }
}

type JestRunnerConfigProps = {
  'jestrunner.projectPath'?: string;
  'jestrunner.configPath'?: string | Record<string, string>;
  'jestrunner.useNearestConfig'?: boolean;
  'jestrunner.checkRelativePathForJest'?: boolean;
  'jestrunner.include'?: string[];
  'jestrunner.exclude'?: string[];
};
class WorkspaceConfiguration {
  constructor(private dict: JestRunnerConfigProps) {}

  get<T extends keyof typeof this.dict>(key: T, defaultValue?: any): (typeof this.dict)[T] {
    if (!(key in this.dict)) {
      return defaultValue;
    }
    return this.dict[key];
  }

  has(key: string) {
    return key in this.dict;
  }
  inspect(section: string): undefined {
    throw new Error('not implemented');
  }
  update(key: string, value: string): Thenable<void> {
    throw new Error('not implemented');
  }
}

class Window {
  get activeTextEditor(): TextEditor {
    return new TextEditor(new Document(new Uri('hi')));
  }
  showWarningMessage<T extends string>(message: string, ...items: T[]): Thenable<T | undefined> {
    return Promise.resolve(undefined);
  }
  createTerminal(name: string): any {
    return {
      show: jest.fn(),
      sendText: jest.fn(),
      dispose: jest.fn(),
    };
  }
  onDidCloseTerminal: jest.Mock = jest.fn((callback: (terminal: any) => void) => {
    return { dispose: jest.fn() };
  });
}

class Commands {
  executeCommand(command: string, ...args: any[]): Promise<any> {
    return Promise.resolve(undefined);
  }
}

class Debug {
  startDebugging(folder: any, nameOrConfig: any): Promise<boolean> {
    return Promise.resolve(true);
  }
}

const workspace = new Workspace();
const window = new Window();
const commands = new Commands();
const debug = new Debug();

export {
  workspace,
  window,
  commands,
  debug,
  Uri,
  Document,
  TextEditor,
  WorkspaceFolder,
  WorkspaceConfiguration,
  Range,
  CodeLens,
};
