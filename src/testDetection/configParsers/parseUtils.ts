import { readFileSync } from 'node:fs';
import { parse, type ParserPlugin, type ParserPluginWithOptions } from '@babel/parser';
import * as t from '@babel/types';
import { astToValue } from '../../utils/AstUtils';

export const readConfigFile = (configPath: string): string => readFileSync(configPath, 'utf8');

const parserPlugins: (ParserPlugin | ParserPluginWithOptions)[] = [
  'typescript',
  'jsx',
  'classProperties',
  'dynamicImport',
  'importMeta',
  'topLevelAwait',
];

const isModuleExports = (node: t.MemberExpression): boolean => {
  return (
    t.isIdentifier(node.object, { name: 'module' }) &&
    ((t.isIdentifier(node.property) && node.property.name === 'exports') ||
      (t.isStringLiteral(node.property) && node.property.value === 'exports'))
  );
};

const unwrapExpression = (node: t.Node | null | undefined): t.Node | undefined => {
  if (!node) return undefined;

  if (t.isTSAsExpression(node) || t.isTSNonNullExpression(node) || t.isTypeCastExpression(node)) {
    return unwrapExpression(node.expression);
  }

  if (t.isParenthesizedExpression(node)) {
    return unwrapExpression(node.expression);
  }

  return node;
};

const getReturnedObject = (fn: t.ArrowFunctionExpression | t.FunctionExpression): t.Node | undefined => {
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

const collectBindings = (ast: t.File): Record<string, any> => {
  const bindings: Record<string, any> = {
    __dirname: '__dirname',
    __filename: '__filename',
  };

  for (const statement of ast.program.body) {
    if (t.isVariableDeclaration(statement)) {
      for (const declarator of statement.declarations) {
        if (t.isIdentifier(declarator.id) && declarator.init) {
          bindings[declarator.id.name] = astToValue(declarator.init, bindings);
        }
      }
    }

    if (t.isExportNamedDeclaration(statement) && t.isVariableDeclaration(statement.declaration)) {
      for (const declarator of statement.declaration.declarations) {
        if (t.isIdentifier(declarator.id) && declarator.init) {
          bindings[declarator.id.name] = astToValue(declarator.init, bindings);
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

  if (t.isArrowFunctionExpression(unwrapped) || t.isFunctionExpression(unwrapped)) {
    return getReturnedObject(unwrapped);
  }

  return undefined;
};

export const parseConfigObject = (content: string): any | undefined => {
  let ast: t.File;
  try {
    ast = parse(content, {
      sourceType: 'unambiguous',
      plugins: parserPlugins,
    });
  } catch {
    return undefined;
  }

  const bindings = collectBindings(ast);

  for (const statement of ast.program.body) {
    if (t.isExportDefaultDeclaration(statement)) {
      const resolvedNode = resolveConfigNode(statement.declaration as t.Node, bindings);
      if (resolvedNode) {
        return astToValue(resolvedNode, bindings);
      }
    }

    if (t.isExpressionStatement(statement) && t.isAssignmentExpression(statement.expression)) {
      const { left, right } = statement.expression;

      if (
        t.isMemberExpression(left) &&
        (isModuleExports(left) ||
          (t.isIdentifier(left.object, { name: 'exports' }) &&
            ((t.isIdentifier(left.property) && left.property.name === 'default') ||
              (t.isStringLiteral(left.property) && left.property.value === 'default'))))
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

