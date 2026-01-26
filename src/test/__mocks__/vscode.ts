class Uri {
  constructor(readonly fsPath: string) { }

  static file(path: string): Uri {
    return new Uri(path);
  }
}

class Document {
  constructor(public readonly uri: Uri) { }
  fileName: string = '';
  getText: (range?: any) => string = () => '';
  save: () => Promise<boolean> = () => Promise.resolve(true);
}

class TextEditor {
  constructor(public readonly document: Document) { }
  selection: any;
}

class WorkspaceFolder {
  constructor(public readonly uri: Uri) { }

  name: string;
  index: number;
}

class Range {
  constructor(
    public readonly startLine: number,
    public readonly startColumn: number,
    public readonly endLine: number,
    public readonly endColumn: number,
  ) { }
}

class CodeLens {
  constructor(
    public readonly range: Range,
    public readonly command?: any,
  ) { }
}

class Workspace {
  getWorkspaceFolder(uri: Uri): { uri: Uri } {
    return { uri };
  }

  getConfiguration() {
    return new WorkspaceConfiguration({});
  }

  findFiles = jest.fn();
  createFileSystemWatcher = jest.fn();
  onDidChangeConfiguration = jest.fn(() => ({ dispose: jest.fn() }));
}

type JestRunnerConfigProps = {
  'jestrunner.configPath'?: string | Record<string, string>;
  'jestrunner.enableESM'?: boolean;
  'jestrunner.useNearestConfig'?: boolean;
  'jestrunner.runOptions'?: string[];
  'jestrunner.debugOptions'?: any;
  'jestrunner.jestCommand'?: string;
  'jestrunner.vitestCommand'?: string;
  'jestrunner.vitestConfigPath'?: string | Record<string, string>;
  'jestrunner.vitestRunOptions'?: string[];
  'jestrunner.enableCodeLens'?: boolean;
  'jestrunner.changeDirectoryToWorkspaceRoot'?: boolean;
};
class WorkspaceConfiguration {
  constructor(private dict: JestRunnerConfigProps) { }

  get<T extends keyof typeof this.dict>(
    key: T,
    defaultValue?: any,
  ): (typeof this.dict)[T] {
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

class OutputChannel {
  appendLine = jest.fn();
  append = jest.fn();
  clear = jest.fn();
  show = jest.fn();
  hide = jest.fn();
  dispose = jest.fn();
  name = 'Jest Runner';
  replace = jest.fn();
}

class Window {
  get activeTextEditor(): TextEditor {
    return new TextEditor(new Document(new Uri('hi')));
  }
  showWarningMessage<T extends string>(
    message: string,
    ...items: T[]
  ): Thenable<T | undefined> {
    return Promise.resolve(undefined);
  }
  showErrorMessage<T extends string>(
    message: string,
    ...items: T[]
  ): Thenable<T | undefined> {
    return Promise.resolve(undefined);
  }
  createTerminal(name: string): any {
    return {
      show: jest.fn(),
      sendText: jest.fn(),
      dispose: jest.fn(),
    };
  }
  createOutputChannel(name: string): OutputChannel {
    return new OutputChannel();
  }
  onDidCloseTerminal: jest.Mock = jest.fn(
    (callback: (terminal: any) => void) => {
      return { dispose: jest.fn() };
    },
  );
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

class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) { }
}

class VscodeRange {
  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) { }
}

class TestTag {
  constructor(public readonly id: string) { }
}

class TestMessage {
  constructor(public readonly message: string) { }
}

class TestItemCollection {
  private items = new Map<string, TestItem>();

  add(item: TestItem): void {
    this.items.set(item.id, item);
  }

  delete(id: string): void {
    this.items.delete(id);
  }

  get(id: string): TestItem | undefined {
    return this.items.get(id);
  }

  replace(items: TestItem[]): void {
    this.items.clear();
    items.forEach((item) => this.add(item));
  }

  forEach(callback: (item: TestItem) => void): void {
    this.items.forEach(callback);
  }

  get size(): number {
    return this.items.size;
  }
}

class TestItem {
  children: TestItemCollection = new TestItemCollection();
  tags: TestTag[] = [];
  range?: VscodeRange;
  canResolveChildren = false;
  busy = false;
  error?: string;
  parent?: TestItem;

  constructor(
    public id: string,
    public label: string,
    public uri?: Uri,
  ) { }
}

class TestRun {
  started = jest.fn();
  passed = jest.fn();
  failed = jest.fn();
  skipped = jest.fn();
  errored = jest.fn();
  enqueued = jest.fn();
  end = jest.fn();
  addCoverage = jest.fn();
}

class TestCoverageCount {
  constructor(
    public covered: number,
    public total: number,
  ) { }
}

class FileCoverage {
  constructor(
    public uri: Uri,
    public statementCoverage: TestCoverageCount,
    public branchCoverage?: TestCoverageCount,
    public declarationCoverage?: TestCoverageCount,
  ) { }
}

class StatementCoverage {
  constructor(
    public executed: number,
    public location: VscodeRange,
    public branches?: BranchCoverage[],
  ) { }
}

class BranchCoverage {
  constructor(
    public executed: number,
    public location: VscodeRange,
    public label?: string,
  ) { }
}

class DeclarationCoverage {
  constructor(
    public name: string,
    public executed: number,
    public location: VscodeRange,
  ) { }
}

class TestRunProfile {
  loadDetailedCoverage?: (
    testRun: TestRun,
    fileCoverage: FileCoverage,
    token: CancellationToken,
  ) => Promise<any[]>;

  constructor(
    public label: string,
    public kind: TestRunProfileKind,
    public runHandler: any,
    public isDefault: boolean,
  ) { }
}

class TestController {
  items: TestItemCollection = new TestItemCollection();
  createRunProfile = jest.fn(
    (
      label: string,
      kind: TestRunProfileKind,
      runHandler: any,
      isDefault: boolean,
    ) => {
      return new TestRunProfile(label, kind, runHandler, isDefault);
    },
  );
  createTestRun = jest.fn().mockReturnValue(new TestRun());
  createTestItem = jest.fn(
    (id: string, label: string, uri?: Uri) => new TestItem(id, label, uri),
  );
  dispose = jest.fn();

  constructor(
    public id: string,
    public label: string,
  ) { }
}

enum TestRunProfileKind {
  Run = 1,
  Debug = 2,
  Coverage = 3,
}

class CancellationTokenSource {
  token: CancellationToken;

  constructor() {
    this.token = new CancellationToken();
  }

  cancel(): void {
    this.token.cancel();
  }

  dispose(): void { }
}

class CancellationToken {
  private cancelled = false;
  private listeners: Array<() => void> = [];

  get isCancellationRequested(): boolean {
    return this.cancelled;
  }

  onCancellationRequested(listener: () => void): { dispose: () => void } {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) {
          this.listeners.splice(index, 1);
        }
      },
    };
  }

  cancel(): void {
    this.cancelled = true;
    this.listeners.forEach((listener) => listener());
  }
}

class RelativePattern {
  constructor(
    public base: string,
    public pattern: string,
  ) { }
}

const tests = {
  createTestController: jest.fn(
    (id: string, label: string) => new TestController(id, label),
  ),
};

const workspace = new Workspace();
const window = new Window();
const commands = new Commands();
const debug = new Debug();

export {
  workspace,
  window,
  commands,
  debug,
  tests,
  Uri,
  Document,
  TextEditor,
  WorkspaceFolder,
  WorkspaceConfiguration,
  Range,
  CodeLens,
  Position,
  VscodeRange,
  TestTag,
  TestMessage,
  TestItem,
  TestItemCollection,
  TestRun,
  TestController,
  TestRunProfile,
  TestRunProfileKind,
  CancellationToken,
  CancellationTokenSource,
  RelativePattern,
  OutputChannel,
  TestCoverageCount,
  FileCoverage,
  StatementCoverage,
  BranchCoverage,
  DeclarationCoverage,
};
