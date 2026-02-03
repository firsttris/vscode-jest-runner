import type { CodeLocation } from './types';

export class ParsedRange {
  start: CodeLocation;

  end: CodeLocation;

  constructor(startLine: number, startCol: number, endLine: number, endCol: number) {
    this.start = { column: startCol, line: startLine };
    this.end = { column: endCol, line: endLine };
  }
}

export enum ParsedNodeType {
  describe = 'describe',
  expect = 'expect',
  it = 'it',
  root = 'root',
}

export class ParsedNode {
  type: ParsedNodeType;

  start?: CodeLocation;

  end?: CodeLocation;

  file: string;

  children?: ParsedNode[];

  constructor(type: ParsedNodeType, file: string) {
    this.type = type;
    this.file = file;
  }

  addChild(type: ParsedNodeType): ParsedNode {
    let child: ParsedNode;

    switch (type) {
      case ParsedNodeType.describe:
        child = new DescribeBlock(this.file);
        break;
      case ParsedNodeType.it:
        child = new ItBlock(this.file);
        break;
      case ParsedNodeType.expect:
        child = new Expect(this.file);
        break;
      default:
        throw TypeError(`unexpected child node type: ${type}`);
    }

    if (!this.children) {
      this.children = [child];
    } else {
      this.children.push(child);
    }

    return child;
  }

  filter(f: (node: ParsedNode) => boolean, filterSelf = false): ParsedNode[] {
    const filtered: ParsedNode[] = [];

    const deepFilter = (node: ParsedNode, shouldFilter: boolean) => {
      if (shouldFilter && f(node)) {
        filtered.push(node);
      }

      if (node.children) {
        node.children.forEach((child) => deepFilter(child, true));
      }
    };

    deepFilter(this, filterSelf);
    return filtered;
  }
}

export class Expect extends ParsedNode {
  constructor(file: string) {
    super(ParsedNodeType.expect, file);
  }
}

export class NamedBlock extends ParsedNode {
  name: string;

  nameRange?: ParsedRange;

  lastProperty?: string;

  nameType?: string;

  eachTemplate?: string;  // Original template for it.each/describe.each tests

  constructor(type: ParsedNodeType, file: string, name?: string) {
    super(type, file);
    this.name = name ?? '';
  }
}

export class ItBlock extends NamedBlock {
  constructor(file: string, name?: string) {
    super(ParsedNodeType.it, file, name);
  }
}

export class DescribeBlock extends NamedBlock {
  constructor(file: string, name?: string) {
    super(ParsedNodeType.describe, file, name);
  }
}

export interface IParseResults {
  describeBlocks: DescribeBlock[];

  expects: Expect[];

  itBlocks: ItBlock[];

  root: ParsedNode;

  file: string;
}

export class ParseResult implements IParseResults {
  describeBlocks: DescribeBlock[];

  expects: Expect[];

  itBlocks: ItBlock[];

  root: ParsedNode;

  file: string;

  constructor(file: string) {
    this.file = file;
    this.root = new ParsedNode(ParsedNodeType.root, file);
    this.describeBlocks = [];
    this.expects = [];
    this.itBlocks = [];
  }

  addNode(node: ParsedNode, dedup = false): void {
    if (node instanceof DescribeBlock) {
      this.describeBlocks.push(node);
      return;
    }

    if (node instanceof ItBlock) {
      this.itBlocks.push(node);
      return;
    }

    if (node instanceof Expect) {
      if (
        dedup &&
        this.expects.some((existing) => existing.start?.line === node.start?.line && existing.start?.column === node.start?.column)
      ) {
        return;
      }
      this.expects.push(node);
      return;
    }

    throw new TypeError(`unexpected node class '${typeof node}': ${JSON.stringify(node)}`);
  }
}
