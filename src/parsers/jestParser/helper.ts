import type { ParserOptions, ParserPlugin } from '@babel/parser';
import * as t from '@babel/types';

const commonPlugins: ParserPlugin[] = [
	'asyncDoExpressions',
	'decoratorAutoAccessors',
	'destructuringPrivate',
	'doExpressions',
	'exportDefaultFrom',
	'flowComments',
	'functionBind',
	'functionSent',
	'moduleBlocks',
	['partialApplication', { version: '2018-07' }],
	'throwExpressions',
	'v8intrinsic',
	['pipelineOperator', { proposal: 'fsharp' }],
];

export const jsPlugins: ParserPlugin[] = [...commonPlugins, 'flow', 'jsx'];
export const tsPlugins: ParserPlugin[] = [...commonPlugins, 'typescript'];
export const tsxPlugins: ParserPlugin[] = [
	...commonPlugins,
	'typescript',
	'jsx',
];

export interface JESParserPluginOptions {
	decorators?: 'legacy';
}

export interface JESParserOptions {
	plugins?: JESParserPluginOptions;
	strictMode?: boolean;
}

const decoratorPlugins = (options?: JESParserOptions): ParserPlugin[] => {
	if (options?.plugins?.decorators === 'legacy') {
		return ['decorators-legacy'];
	}
	return ['decorators'];
};

export const parseOptions = (
	filePath: string,
	options?: JESParserOptions,
): ParserOptions => {
	const optionalPlugins = decoratorPlugins(options);

	if (/\.ts$/i.test(filePath)) {
		return { plugins: [...tsPlugins, ...optionalPlugins] };
	}

	if (/\.tsx$/i.test(filePath)) {
		return { plugins: [...tsxPlugins, ...optionalPlugins] };
	}

	if (!options?.strictMode || /\.m?jsx?$/i.test(filePath)) {
		return { plugins: [...jsPlugins, ...optionalPlugins] };
	}

	throw new TypeError(
		`unable to find parser options for unrecognized file extension: ${filePath}`,
	);
};

const getNodeAttribute = <T = t.Node>(
	node: t.Node | undefined | null,
	isDeep: boolean,
	...attributes: string[]
): T | undefined => {
	if (!node) {
		return;
	}

	const value: unknown = node;
	return attributes.reduce((cursor: unknown, attr: string) => {
		if (!cursor || typeof cursor !== 'object') {
			return undefined;
		}

		let walker: any = cursor;
		if (!(attr in walker)) {
			return undefined;
		}

		if (isDeep) {
			while (walker && walker[attr]) {
				walker = walker[attr];
			}
			return walker as T;
		}

		return (walker as any)[attr] as T;
	}, value) as T | undefined;
};

export const shallowAttr = <T = t.Node>(
	node: t.Node | undefined | null,
	...attributes: string[]
) => getNodeAttribute<T>(node, false, ...attributes);

const deepAttr = <T = t.Node>(
	node: t.Node | undefined | null,
	...attributes: string[]
) => getNodeAttribute<T>(node, true, ...attributes);

export const getCallExpression = (
	node: t.Node,
): t.CallExpression | undefined => {
	if (t.isExpressionStatement(node) && t.isCallExpression(node.expression)) {
		return node.expression;
	}
	if (t.isCallExpression(node)) {
		return node;
	}
	return undefined;
};

export const getNameForNode = (node: t.Node): [string?, string?] => {
	const expression = getCallExpression(node);
	const rootCallee = deepAttr(expression, 'callee');

	if (!rootCallee) {
		return [];
	}

	const attrs: [string, string] = ['property', 'name'];
	const lastProperty =
		shallowAttr<string>(rootCallee, ...attrs) ||
		shallowAttr<string>(deepAttr(rootCallee, 'tag'), ...attrs);

	let object = rootCallee;
	while (
		object &&
		typeof object === 'object' &&
		('object' in object || 'tag' in object)
	) {
		object = (object as any).object || (object as any).tag;
	}

	const name = shallowAttr<string>(object, 'name');

	return [name, lastProperty];
};
