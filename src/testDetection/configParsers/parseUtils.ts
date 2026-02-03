import { readFileSync } from 'node:fs';
import { parse, type ParserPlugin, type ParserPluginWithOptions } from '@babel/parser';
import * as t from '@babel/types';

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

const getReturnedObject = (fn: t.ArrowFunctionExpression | t.FunctionExpression): t.ObjectExpression | undefined => {
  if (t.isObjectExpression(fn.body)) {
    return fn.body;
  }

  if (t.isBlockStatement(fn.body)) {
    for (const statement of fn.body.body) {
      if (t.isReturnStatement(statement)) {
        const argument = unwrapExpression(statement.argument);
        if (argument && t.isObjectExpression(argument)) {
          return argument;
        }
      }
    }
  }

  return undefined;
};

const resolveObjectExpression = (
  node: t.Node | undefined,
  objectDeclarations: Map<string, t.ObjectExpression>,
): t.ObjectExpression | undefined => {
  if (!node) return undefined;

  const unwrapped = unwrapExpression(node);

  if (t.isObjectExpression(unwrapped)) {
    return unwrapped;
  }

  if (t.isIdentifier(unwrapped)) {
    return objectDeclarations.get(unwrapped.name);
  }

  if (t.isCallExpression(unwrapped)) {
    for (const arg of unwrapped.arguments) {
      if (t.isSpreadElement(arg)) continue;

      const resolved = resolveObjectExpression(arg as t.Node, objectDeclarations);
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

const collectObjectDeclarations = (ast: t.File): Map<string, t.ObjectExpression> => {
  const declarations = new Map<string, t.ObjectExpression>();

  for (const statement of ast.program.body) {
    if (t.isVariableDeclaration(statement)) {
      for (const declarator of statement.declarations) {
        if (t.isIdentifier(declarator.id) && declarator.init && t.isObjectExpression(declarator.init)) {
          declarations.set(declarator.id.name, declarator.init);
        }
      }
    }

    if (t.isExportNamedDeclaration(statement) && t.isVariableDeclaration(statement.declaration)) {
      for (const declarator of statement.declaration.declarations) {
        if (t.isIdentifier(declarator.id) && declarator.init && t.isObjectExpression(declarator.init)) {
          declarations.set(declarator.id.name, declarator.init);
        }
      }
    }
  }

  return declarations;
};

export const parseConfigObject = (content: string): t.ObjectExpression | undefined => {
  let ast: t.File;
  try {
    ast = parse(content, {
      sourceType: 'unambiguous',
      plugins: parserPlugins,
    });
  } catch {
    return undefined;
  }

  const objectDeclarations = collectObjectDeclarations(ast);

  for (const statement of ast.program.body) {
    if (t.isExportDefaultDeclaration(statement)) {
      const resolved = resolveObjectExpression(statement.declaration as t.Node, objectDeclarations);
      if (resolved) return resolved;
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
        const resolved = resolveObjectExpression(right as t.Node, objectDeclarations);
        if (resolved) return resolved;
      }
    }
  }

  return undefined;
};

const isStringLike = (node: t.Node | null | undefined): node is t.StringLiteral | t.TemplateLiteral | t.Identifier => {
  if (!node) return false;
  return t.isStringLiteral(node) || t.isTemplateLiteral(node) || t.isIdentifier(node);
};

export const stringFromNode = (node: t.Node | null | undefined): string | undefined => {
  if (!node) return undefined;
  const unwrapped = unwrapExpression(node);

  if (t.isStringLiteral(unwrapped)) return unwrapped.value;

  if (t.isTemplateLiteral(unwrapped) && unwrapped.expressions.length === 0) {
    return unwrapped.quasis.map((q) => q.value.cooked ?? '').join('');
  }

  if (t.isIdentifier(unwrapped) && unwrapped.name === '__dirname') {
    return '__dirname';
  }

  return undefined;
};

export const stringArrayFromNode = (node: t.Node | null | undefined): string[] | undefined => {
  if (!node) return undefined;
  const unwrapped = unwrapExpression(node);

  if (t.isStringLiteral(unwrapped) || t.isTemplateLiteral(unwrapped) || t.isIdentifier(unwrapped)) {
    const value = stringFromNode(unwrapped);
    return value ? [value] : undefined;
  }

  if (t.isArrayExpression(unwrapped)) {
    const values: string[] = [];
    for (const element of unwrapped.elements) {
      if (!element || t.isSpreadElement(element)) return undefined;
      if (!isStringLike(element)) return undefined;
      const value = stringFromNode(element);
      if (!value) return undefined;
      values.push(value);
    }
    return values.length > 0 ? values : undefined;
  }

  return undefined;
};

const findProperty = (object: t.ObjectExpression, key: string): t.Node | undefined => {
  for (const prop of object.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) continue;

    if (
      (t.isIdentifier(prop.key) && prop.key.name === key) ||
      (t.isStringLiteral(prop.key) && prop.key.value === key)
    ) {
      return prop.value as t.Node;
    }
  }

  return undefined;
};

export const getStringFromProperty = (object: t.ObjectExpression, key: string): string | undefined => {
  const value = findProperty(object, key);
  return stringFromNode(value);
};

export const getStringArrayFromProperty = (object: t.ObjectExpression, key: string): string[] | undefined => {
  const value = findProperty(object, key);
  return stringArrayFromNode(value);
};

export const getObjectFromProperty = (object: t.ObjectExpression, key: string): t.ObjectExpression | undefined => {
  const value = findProperty(object, key);
  const unwrapped = unwrapExpression(value);
  return t.isObjectExpression(unwrapped) ? unwrapped : undefined;
};

export const hasProperty = (object: t.ObjectExpression, key: string): boolean => findProperty(object, key) !== undefined;
