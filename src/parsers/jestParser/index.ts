import { parse as babelParser } from './babelParser';
import { parseOptions, type JESParserOptions, type JESParserPluginOptions } from './helper';
import type { ParseResult } from './parserNodes';

export type { CodeLocation } from './types';
export {
  DescribeBlock,
  Expect,
  IParseResults,
  ItBlock,
  NamedBlock,
  ParseResult,
  ParsedNode,
  ParsedNodeType,
  ParsedRange,
} from './parserNodes';
export type { JESParserOptions, JESParserPluginOptions };
export { getASTfor } from './babelParser';

export default function parse(
  filePath: string,
  serializedData?: string,
  options?: JESParserOptions,
): ParseResult {
  return babelParser(filePath, serializedData, parseOptions(filePath, options));
}
