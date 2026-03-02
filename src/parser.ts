import parse, { type ParsedNode } from './parsers/jestParser';
import {
  parseNodeTestFile,
  type ParseResult as NodeTestParseResult,
} from './parsers/nodeTestParser';
import { isNodeTestFile } from './testDetection/frameworkDetection';

export { parse, ParsedNode };

export function parseTestFile(
  filePath: string,
  content?: string,
): NodeTestParseResult | ReturnType<typeof parse> {
  if (isNodeTestFile(filePath)) {
    return parseNodeTestFile(filePath, content);
  }
  return parse(filePath, content);
}
