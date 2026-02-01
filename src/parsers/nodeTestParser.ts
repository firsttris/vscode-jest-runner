import { parse as babelParse } from '@babel/parser';
import traverse from '@babel/traverse';
import { readFileSync } from 'node:fs';

export interface TestNode {
  name: string;
  type: 'describe' | 'test';
  start: { line: number; column: number };
  end: { line: number; column: number };
  children: TestNode[];
  file: string;
}

export interface ParseResult {
  root: {
    children: TestNode[];
  };
  file: string;
}

interface RawTestNode {
  name: string;
  type: 'describe' | 'test';
  start: { line: number; column: number };
  end: { line: number; column: number };
  parentStart?: { line: number; column: number };
}

/**
 * Parse a Node.js test file (node:test) and extract test structure
 */
export function parseNodeTestFile(filePath: string, content?: string): ParseResult {
  const fileContent = content || readFileSync(filePath, 'utf-8');

  const ast = babelParse(fileContent, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    errorRecovery: true,
  });

  const rawTests: RawTestNode[] = [];
  const describeStack: Array<{ start: { line: number; column: number } }> = [];

  traverse(ast, {
    CallExpression: {
      enter(path) {
        const node = path.node;
        const callee = node.callee;
        const testInfo = getTestCallInfo(callee);

        if (!testInfo) return;

        const nameArg = node.arguments[0];
        const name = extractTestName(nameArg);
        if (!name) return;

        const loc = node.loc;
        if (!loc) return;

        // Get parent from stack
        const parentStart = describeStack.length > 0 ? describeStack[describeStack.length - 1].start : undefined;

        const testNode: RawTestNode = {
          name,
          type: testInfo.type,
          start: { line: loc.start.line, column: loc.start.column },
          end: { line: loc.end.line, column: loc.end.column },
          parentStart,
        };

        rawTests.push(testNode);

        // If it's a describe block, push to stack
        if (testInfo.type === 'describe') {
          describeStack.push({ start: testNode.start });
        }
      },
      exit(path) {
        const node = path.node;
        const callee = node.callee;
        const testInfo = getTestCallInfo(callee);

        if (testInfo?.type === 'describe') {
          describeStack.pop();
        }
      }
    }
  });

  // Remove duplicates (from nested traversal)
  const uniqueTests = removeDuplicates(rawTests);

  // Build tree structure
  const tree = buildTestTree(uniqueTests, filePath);

  return {
    root: { children: tree },
    file: filePath,
  };
}

function getTestCallInfo(callee: any): { type: 'describe' | 'test'; modifier?: string } | null {
  // Direct call: test(), it(), describe()
  if (callee.type === 'Identifier') {
    const name = callee.name;
    if (name === 'describe') return { type: 'describe' };
    if (name === 'test' || name === 'it') return { type: 'test' };
    return null;
  }

  // Member expression: test.only(), test.skip(), test.todo(), describe.only(), etc.
  if (callee.type === 'MemberExpression') {
    const obj = callee.object;
    const prop = callee.property;

    if (obj.type !== 'Identifier' || prop.type !== 'Identifier') return null;

    const objName = obj.name;
    const propName = prop.name;

    if (!['only', 'skip', 'todo'].includes(propName)) return null;

    if (objName === 'describe') return { type: 'describe', modifier: propName };
    if (objName === 'test' || objName === 'it') return { type: 'test', modifier: propName };
    return null;
  }

  return null;
}

function extractTestName(arg: any): string | null {
  if (!arg) return null;

  // String literal: 'test name'
  if (arg.type === 'StringLiteral') {
    return arg.value;
  }

  // Template literal: `test name`
  if (arg.type === 'TemplateLiteral') {
    // For simple template literals without expressions
    if (arg.quasis.length === 1 && arg.expressions.length === 0) {
      return arg.quasis[0].value.cooked || arg.quasis[0].value.raw;
    }
    // For template literals with expressions, use raw representation
    return arg.quasis.map((q: any) => q.value.raw).join('${...}');
  }

  return null;
}

function removeDuplicates(tests: RawTestNode[]): RawTestNode[] {
  const seen = new Set<string>();
  return tests.filter((test) => {
    const key = `${test.start.line}:${test.start.column}:${test.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildTestTree(tests: RawTestNode[], filePath: string): TestNode[] {
  // Sort by line number
  tests.sort((a, b) => a.start.line - b.start.line);

  // Build parent-child relationships
  const testMap = new Map<string, TestNode>();
  const rootTests: TestNode[] = [];

  for (const test of tests) {
    const key = `${test.start.line}:${test.start.column}`;
    const node: TestNode = {
      name: test.name,
      type: test.type,
      start: test.start,
      end: test.end,
      children: [],
      file: filePath,
    };
    testMap.set(key, node);

    if (test.parentStart) {
      const parentKey = `${test.parentStart.line}:${test.parentStart.column}`;
      const parent = testMap.get(parentKey);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }

    rootTests.push(node);
  }

  return rootTests;
}
