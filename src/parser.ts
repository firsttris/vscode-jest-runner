import parse, { type ParsedNode } from './parsers/jestParser';
import {
	type ParseResult as NodeTestParseResult,
	parseNodeTestFile,
} from './parsers/nodeTestParser';
import { isNodeTestFile } from './testDetection/frameworkDetection';

export { type ParsedNode, parse };

export function parseTestFile(
	filePath: string,
	content?: string,
): NodeTestParseResult | ReturnType<typeof parse> {
	if (isNodeTestFile(filePath)) {
		return parseNodeTestFile(filePath, content);
	}
	return parse(filePath, content);
}
