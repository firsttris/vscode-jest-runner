import { parseTestFile } from './parser';
import {
  CodeLens,
  CodeLensProvider,
  Range,
  TextDocument,
  workspace,
} from 'vscode';
import { testFileCache } from './testDetection/testFileCache';
import { CodeLensOption } from './util';
import { escapeRegExp, findFullTestName, resolveTestNameStringInterpolation, TestNode } from './utils/TestNameUtils';
import { logError } from './utils/Logger';

const CODE_LENS_CONFIG: Record<
  CodeLensOption,
  { title: string; command: string }
> = {
  run: { title: 'Run', command: 'extension.runJest' },
  debug: { title: 'Debug', command: 'extension.debugJest' },
  watch: { title: 'Run --watch', command: 'extension.watchJest' },
  coverage: { title: 'Run --coverage', command: 'extension.runJestCoverage' },
  'current-test-coverage': {
    title: 'Run --collectCoverageFrom (target file/dir)',
    command: 'extension.runJestCurrentTestCoverage',
  },
};

function getCodeLensForOption(
  range: Range,
  codeLensOption: CodeLensOption,
  fullTestName: string,
  customTitle?: string,
): CodeLens {
  const config = CODE_LENS_CONFIG[codeLensOption];
  return new CodeLens(range, {
    arguments: [fullTestName],
    title: customTitle || config.title,
    command: config.command,
  });
}

function buildFullTestName(node: TestNode, parseResults: TestNode[]): string {
  const parents: string[] = [];

  function findParents(
    searchNode: TestNode,
    target: TestNode,
    currentPath: string[] = [],
  ): string[] | null {
    if (searchNode === target) {
      return currentPath;
    }
    if (searchNode.children) {
      for (const child of searchNode.children) {
        const path = searchNode.name
          ? [...currentPath, searchNode.name]
          : currentPath;
        const result = findParents(child, target, path);
        if (result) return result;
      }
    }
    return null;
  }

  for (const root of parseResults) {
    const parentPath = findParents(root, node);
    if (parentPath) {
      parents.push(...parentPath);
      break;
    }
  }

  const fullPath = [...parents, node.name || ''].filter(Boolean);
  return fullPath.join(' ');
}

function getTestsBlocks(
  parsedNode: TestNode,
  parseResults: TestNode[],
  codeLensOptions: CodeLensOption[],
  parent?: TestNode,
  processedGroups?: Set<string>,
): CodeLens[] {
  if (parsedNode.type === 'expect') {
    return [];
  }

  const codeLens: CodeLens[] = [];
  const groupsSet = processedGroups || new Set<string>();

  parsedNode.children?.forEach((subNode) => {
    codeLens.push(...getTestsBlocks(subNode, parseResults, codeLensOptions, parsedNode, groupsSet));
  });

  const range = new Range(
    parsedNode.start.line - 1,
    parsedNode.start.column,
    parsedNode.end.line - 1,
    parsedNode.end.column,
  );

  const fullTestName = escapeRegExp(buildFullTestName(parsedNode, parseResults));

  let testIndex: number | undefined;
  if (parsedNode.type === 'it' && parsedNode.start) {
    const siblings = parent?.children || parseResults;
    const sameLineTests = siblings.filter(
      (node) =>
        node.type === 'it' &&
        node.start?.line === parsedNode.start?.line,
    );

    if (sameLineTests.length > 1) {
      const groupKey = `${parsedNode.start.line}-${parent?.name || 'root'}`;

      const sortedTests = [...sameLineTests].sort(
        (a, b) => (a.start?.column || 0) - (b.start?.column || 0),
      );
      testIndex = sortedTests.indexOf(parsedNode) + 1;

      if (!groupsSet.has(groupKey)) {
        groupsSet.add(groupKey);

        let patternName: string | undefined;
        if ((parsedNode as any).eachTemplate) {
          const template = (parsedNode as any).eachTemplate;
          const parentNames = parent?.name ? [parent.name] : [];
          const fullTemplateName = [...parentNames, template].filter(Boolean).join(' ');
          patternName = escapeRegExp(resolveTestNameStringInterpolation(fullTemplateName));
        } else {
          patternName = escapeRegExp(
            findFullTestName(parsedNode.start.line, parseResults) || '',
          );
        }

        if (patternName) {
          codeLens.push(
            getCodeLensForOption(range, 'run', patternName, 'Run All'),
            getCodeLensForOption(range, 'debug', patternName, 'Debug All'),
          );
        }
      }
    }
  }

  codeLens.push(
    ...codeLensOptions.map((option) => {
      const config = CODE_LENS_CONFIG[option];
      const title = testIndex !== undefined ? `[${testIndex}] ${config.title}` : config.title;
      return getCodeLensForOption(range, option, fullTestName, title);
    }),
  );

  return codeLens;
}

export class TestRunnerCodeLensProvider implements CodeLensProvider {
  private lastSuccessfulCodeLens: Map<string, CodeLens[]> = new Map();

  constructor(private readonly codeLensOptions: CodeLensOption[]) { }

  public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    try {
      const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
      const workspaceFolderPath = workspaceFolder?.uri.fsPath;
      if (!workspaceFolderPath || !testFileCache.isTestFile(document.fileName)) {
        return [];
      }

      const parseResults = parseTestFile(document.fileName, document.getText()).root.children ?? [];

      const processedGroups = new Set<string>();

      const codeLenses = parseResults.flatMap((parseResult) =>
        getTestsBlocks(parseResult, parseResults, this.codeLensOptions, undefined, processedGroups),
      );
      this.lastSuccessfulCodeLens.set(document.fileName, codeLenses);
      return codeLenses;
    } catch (e) {
      logError('parser returned error', e);
    }
    return this.lastSuccessfulCodeLens.get(document.fileName) ?? [];
  }
}
