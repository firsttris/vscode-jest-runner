import { parse as babelParser } from './babelParser';
import {
	type JESParserOptions,
	type JESParserPluginOptions,
	parseOptions,
} from './helper';
import type { ParseResult } from './parserNodes';

export { getASTfor } from './babelParser';
export {
	DescribeBlock,
	Expect,
	type IParseResults,
	ItBlock,
	NamedBlock,
	ParsedNode,
	ParsedNodeType,
	ParsedRange,
	ParseResult,
} from './parserNodes';
export type { CodeLocation } from './types';
export type { JESParserOptions, JESParserPluginOptions };

export default function parse(
	filePath: string,
	serializedData?: string,
	options?: JESParserOptions,
): ParseResult {
	return babelParser(filePath, serializedData, parseOptions(filePath, options));
}
