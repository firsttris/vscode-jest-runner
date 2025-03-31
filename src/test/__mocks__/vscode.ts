// __mocks__/vscode.ts

class Uri {
  constructor(readonly fsPath: string) {}
}

class Document {
  constructor(public readonly uri: Uri) {}
}

class TextEditor {
  constructor(public readonly document: Document) {}
}

class WorkspaceFolder {
  constructor(public readonly uri: Uri) {}

  name: string;
  index: number;
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
  'jestrunner.checkRelativePathForJest'?: boolean;
};
class WorkspaceConfiguration {
  constructor(private dict: JestRunnerConfigProps) {}

  get<T extends keyof typeof this.dict>(key: T): (typeof this.dict)[T] {
    if (!(key in this.dict)) {
      throw new Error(`unrecognised config key ${key}`);
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
}

const workspace = new Workspace();
const window = new Window();

export { workspace, window, Uri, Document, TextEditor, WorkspaceFolder, WorkspaceConfiguration };
