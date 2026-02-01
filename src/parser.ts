import parse, { type ParsedNode } from './parsers/jestParser';
import { parseNodeTestFile, type ParseResult as NodeTestParseResult } from './parsers/nodeTestParser';
import { isNodeTestFile } from './testDetection/frameworkDetection';

export { parse, ParsedNode };

/**
 * Parse a test file using the appropriate parser based on the framework
 * Returns jest-editor-support format for Jest/Vitest, or NodeTestParseResult for node:test
 */
export function parseTestFile(filePath: string, content?: string): NodeTestParseResult | ReturnType<typeof parse> {
  if (isNodeTestFile(filePath)) {
    return parseNodeTestFile(filePath, content);
  }
  return parse(filePath, content);
}
