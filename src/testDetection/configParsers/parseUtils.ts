import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
	parse,
	type ParserPlugin,
	type ParserPluginWithOptions,
} from '@babel/parser';
import * as t from '@babel/types';
import { astToValue } from '../../utils/AstUtils';

export const readConfigFile = (configPath: string): string =>
	readFileSync(configPath, 'utf8');

const parserPlugins: (ParserPlugin | ParserPluginWithOptions)[] = [
	'typescript',
	'jsx',
	'classProperties',
	'dynamicImport',
	'importMeta',
	'topLevelAwait',
];

const isRequireCall = (node: t.Node | undefined): node is t.CallExpression => {
	if (!node || !t.isCallExpression(node)) return false;
	if (!t.isIdentifier(node.callee, { name: 'require' })) return false;
	if (node.arguments.length !== 1) return false;
	return t.isStringLiteral(node.arguments[0]);
};

const resolveRequireFilePath = (
	requiredPath: string,
	configPath: string,
): string | undefined => {
	if (!requiredPath.startsWith('.')) return undefined;

	const basePath = resolve(dirname(configPath), requiredPath);
	const candidates = [
		basePath,
		`${basePath}.js`,
		`${basePath}.ts`,
		`${basePath}.cjs`,
		`${basePath}.mjs`,
		resolve(basePath, 'index.js'),
		resolve(basePath, 'index.ts'),
		resolve(basePath, 'index.cjs'),
		resolve(basePath, 'index.mjs'),
	];

	return candidates.find((candidate) => existsSync(candidate));
};

const getExportName = (node: t.MemberExpression): string | undefined => {
	if (node.computed) {
		return t.isStringLiteral(node.property) ? node.property.value : undefined;
	}
	return t.isIdentifier(node.property) ? node.property.name : undefined;
};

const isModuleExports = (node: t.MemberExpression): boolean => {
	return (
		t.isIdentifier(node.object, { name: 'module' }) &&
		((t.isIdentifier(node.property) && node.property.name === 'exports') ||
			(t.isStringLiteral(node.property) && node.property.value === 'exports'))
	);
};

const unwrapExpression = (
	node: t.Node | null | undefined,
): t.Node | undefined => {
	if (!node) return undefined;

	if (
		t.isTSAsExpression(node) ||
		t.isTSNonNullExpression(node) ||
		t.isTypeCastExpression(node)
	) {
		return unwrapExpression(node.expression);
	}

	if (t.isParenthesizedExpression(node)) {
		return unwrapExpression(node.expression);
	}

	return node;
};

const getReturnedObject = (
	fn: t.ArrowFunctionExpression | t.FunctionExpression,
): t.Node | undefined => {
	if (t.isObjectExpression(fn.body)) {
		return fn.body;
	}

	if (t.isBlockStatement(fn.body)) {
		for (const statement of fn.body.body) {
			if (t.isReturnStatement(statement)) {
				const argument = unwrapExpression(statement.argument);
				if (argument) {
					return argument;
				}
			}
		}
	}

	return undefined;
};

const getCommonJsExportsFromContent = (
	content: string,
	configPath: string,
	visited: Set<string>,
): Record<string, any> | undefined => {
	let ast: t.File;
	try {
		ast = parse(content, {
			sourceType: 'unambiguous',
			plugins: parserPlugins,
		});
	} catch {
		return undefined;
	}

	const bindings = collectBindings(ast, configPath, visited);
	const exportsObject: Record<string, any> = {};
	let hasExport = false;

	for (const statement of ast.program.body) {
		if (
			t.isExpressionStatement(statement) &&
			t.isAssignmentExpression(statement.expression)
		) {
			const { left, right } = statement.expression;
			if (!t.isMemberExpression(left)) continue;

			const value = astToValue(unwrapExpression(right), bindings);

			if (isModuleExports(left)) {
				if (value && typeof value === 'object') {
					Object.assign(exportsObject, value);
					hasExport = true;
				}
				continue;
			}

			if (
				t.isIdentifier(left.object, { name: 'exports' }) ||
				(t.isMemberExpression(left.object) && isModuleExports(left.object))
			) {
				const exportName = getExportName(left);
				if (exportName && value !== undefined) {
					exportsObject[exportName] = value;
					hasExport = true;
				}
			}
		}
	}

	return hasExport ? exportsObject : undefined;
};

const resolveRequireValue = (
	node: t.Node | undefined,
	configPath: string,
	visited: Set<string>,
): any => {
	if (!isRequireCall(node)) return undefined;

	const requiredArg = node.arguments[0];
	if (!t.isStringLiteral(requiredArg)) return undefined;

	const requiredPath = requiredArg.value;
	const resolvedPath = resolveRequireFilePath(requiredPath, configPath);
	if (!resolvedPath || visited.has(resolvedPath)) return undefined;

	try {
		const content = readConfigFile(resolvedPath);
		const nestedVisited = new Set(visited);
		nestedVisited.add(resolvedPath);
		return getCommonJsExportsFromContent(content, resolvedPath, nestedVisited);
	} catch {
		return undefined;
	}
};

const addObjectPatternBindings = (
	pattern: t.ObjectPattern,
	value: Record<string, any>,
	bindings: Record<string, any>,
): void => {
	for (const property of pattern.properties) {
		if (t.isRestElement(property)) {
			continue;
		}
		if (!t.isObjectProperty(property)) {
			continue;
		}

		const key = t.isIdentifier(property.key)
			? property.key.name
			: t.isStringLiteral(property.key)
				? property.key.value
				: undefined;
		if (!key) {
			continue;
		}

		if (t.isIdentifier(property.value)) {
			bindings[property.value.name] = value[key];
			continue;
		}

		if (
			t.isAssignmentPattern(property.value) &&
			t.isIdentifier(property.value.left)
		) {
			bindings[property.value.left.name] =
				value[key] !== undefined
					? value[key]
					: astToValue(property.value.right, bindings);
		}
	}
};

const collectBindings = (
	ast: t.File,
	configPath: string,
	visited: Set<string>,
): Record<string, any> => {
	const bindings: Record<string, any> = {
		__dirname: '__dirname',
		__filename: '__filename',
	};

	for (const statement of ast.program.body) {
		if (t.isVariableDeclaration(statement)) {
			for (const declarator of statement.declarations) {
				if (t.isIdentifier(declarator.id) && declarator.init) {
					const requiredValue = resolveRequireValue(
						declarator.init,
						configPath,
						visited,
					);
					bindings[declarator.id.name] =
						requiredValue !== undefined
							? requiredValue
							: astToValue(declarator.init, bindings);
				}

				if (t.isObjectPattern(declarator.id) && declarator.init) {
					const requiredValue = resolveRequireValue(
						declarator.init,
						configPath,
						visited,
					);
					const initValue =
						requiredValue !== undefined
							? requiredValue
							: astToValue(declarator.init, bindings);

					if (initValue && typeof initValue === 'object') {
						addObjectPatternBindings(declarator.id, initValue, bindings);
					}
				}
			}
		}

		if (
			t.isExportNamedDeclaration(statement) &&
			t.isVariableDeclaration(statement.declaration)
		) {
			for (const declarator of statement.declaration.declarations) {
				if (t.isIdentifier(declarator.id) && declarator.init) {
					const requiredValue = resolveRequireValue(
						declarator.init,
						configPath,
						visited,
					);
					bindings[declarator.id.name] =
						requiredValue !== undefined
							? requiredValue
							: astToValue(declarator.init, bindings);
				}

				if (t.isObjectPattern(declarator.id) && declarator.init) {
					const requiredValue = resolveRequireValue(
						declarator.init,
						configPath,
						visited,
					);
					const initValue =
						requiredValue !== undefined
							? requiredValue
							: astToValue(declarator.init, bindings);

					if (initValue && typeof initValue === 'object') {
						addObjectPatternBindings(declarator.id, initValue, bindings);
					}
				}
			}
		}
	}

	return bindings;
};

const resolveConfigNode = (
	node: t.Node | undefined,
	bindings: Record<string, any>,
): t.Node | undefined => {
	if (!node) return undefined;

	const unwrapped = unwrapExpression(node);

	if (t.isObjectExpression(unwrapped) || t.isArrayExpression(unwrapped)) {
		return unwrapped;
	}

	if (t.isIdentifier(unwrapped)) {
		return bindings[unwrapped.name] !== undefined ? unwrapped : undefined;
	}

	if (t.isCallExpression(unwrapped)) {
		for (const arg of unwrapped.arguments) {
			if (t.isSpreadElement(arg)) continue;

			const resolved = resolveConfigNode(arg as t.Node, bindings);
			if (resolved) return resolved;

			if (t.isArrowFunctionExpression(arg) || t.isFunctionExpression(arg)) {
				const returned = getReturnedObject(arg);
				if (returned) return returned;
			}
		}
	}

	if (
		t.isArrowFunctionExpression(unwrapped) ||
		t.isFunctionExpression(unwrapped)
	) {
		return getReturnedObject(unwrapped);
	}

	return undefined;
};

export const parseConfigObject = (
	content: string,
	configPath: string = '__inline__',
): any | undefined => {
	let ast: t.File;
	try {
		ast = parse(content, {
			sourceType: 'unambiguous',
			plugins: parserPlugins,
		});
	} catch {
		return undefined;
	}

	const visited = new Set<string>();
	if (configPath !== '__inline__') {
		visited.add(configPath);
	}

	const bindings = collectBindings(ast, configPath, visited);

	for (const statement of ast.program.body) {
		if (t.isExportDefaultDeclaration(statement)) {
			const resolvedNode = resolveConfigNode(
				statement.declaration as t.Node,
				bindings,
			);
			if (resolvedNode) {
				return astToValue(resolvedNode, bindings);
			}
		}

		if (
			t.isExpressionStatement(statement) &&
			t.isAssignmentExpression(statement.expression)
		) {
			const { left, right } = statement.expression;

			if (
				t.isMemberExpression(left) &&
				(isModuleExports(left) ||
					(t.isIdentifier(left.object, { name: 'exports' }) &&
						((t.isIdentifier(left.property) &&
							left.property.name === 'default') ||
							(t.isStringLiteral(left.property) &&
								left.property.value === 'default'))))
			) {
				const resolvedNode = resolveConfigNode(right as t.Node, bindings);
				if (resolvedNode) {
					return astToValue(resolvedNode, bindings);
				}
			}
		}
	}

	return undefined;
};

// Deprecated helpers - can be removed eventually but kept for now if I missed some update.
// Actually I will remove them to force me to update all consumers.
