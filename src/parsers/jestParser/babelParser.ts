import { readFileSync } from 'node:fs';
import { format } from 'node:util';
import { parse as babelParse, type ParserOptions } from '@babel/parser';
import * as t from '@babel/types';
import { getNameForNode, getCallExpression, parseOptions, shallowAttr, type JESParserOptions } from './helper';
import { NamedBlock, ParseResult, ParsedNode, ParsedNodeType, ParsedRange } from './parserNodes';
import { astToValue } from '../../utils/AstUtils';

const isFunctionExpression = (
  node: t.Node,
): node is t.ArrowFunctionExpression | t.FunctionExpression =>
  t.isArrowFunctionExpression(node) || t.isFunctionExpression(node);

const toAst = (file: string, data?: string, options?: ParserOptions): { ast: t.File; source: string } => {
  const source = data ?? readFileSync(file, 'utf8');
  const parserOptions: ParserOptions = { ...(options ?? {}), sourceType: 'module' };
  return { ast: babelParse(source, parserOptions), source };
};

export const getASTfor = (file: string, data?: string, options?: JESParserOptions): t.File => {
  const { ast } = toAst(file, data, parseOptions(file, options));
  return ast;
};

const isDescribe = (name?: string) => name === 'describe';

const isTestBlock = (name?: string) => name === 'it' || name === 'fit' || name === 'test';



const formatTitle = (title: string, args: any, index: number): string => {
  let formatted = title;

  if (/%[sdifjoOc]/.test(title)) {
    if (Array.isArray(args)) {
      formatted = format(formatted, ...args);
    } else {
      formatted = format(formatted, args);
    }
  }

  if (typeof args === 'object' && args !== null) {
    formatted = formatted.replace(/\$(\w+)/g, (match, key) => {
      if (key === '#') return index.toString();
      return key in args ? String(args[key]) : match;
    });
  }

  formatted = formatted.replace(/%#/g, index.toString());

  return formatted;
};


const isExpectCall = (node: t.Node): boolean => {
  const expression = getCallExpression(node);
  if (!expression) {
    return false;
  }

  let callee: unknown = expression.callee;
  while (callee) {
    if (typeof callee === 'object' && callee && 'name' in (callee as t.Identifier)) {
      const identifier = callee as t.Identifier;
      if (identifier.name === 'expect') {
        return true;
      }
    }

    if (typeof callee === 'object' && callee) {
      const next = (callee as any).object ?? (callee as any).callee;
      callee = next;
    } else {
      callee = undefined;
    }
  }

  return false;
};

const applyNameInfo = (
  block: NamedBlock,
  statement: t.Node,
  source: string,
  bindings: Record<string, any> = {},
  lastProperty?: string,
) => {
  if (!t.isExpressionStatement(statement) || !t.isCallExpression(statement.expression)) {
    throw new Error(
      `Expected an ExpressionStatement with CallExpression but got: ${JSON.stringify(statement)}`,
    );
  }

  const arg = statement.expression.arguments[0];
  if (!arg) {
    block.name = '';
    block.lastProperty = lastProperty;
    return;
  }

  const resolvedName = astToValue(arg, bindings);
  if (resolvedName !== undefined && typeof resolvedName === 'string') {
    block.name = resolvedName;
  } else if (t.isStringLiteral(arg)) {
    block.name = arg.value;
  } else if (arg.start != null && arg.end != null) {
    if (t.isTemplateLiteral(arg)) {
      block.name = source.substring(arg.start + 1, arg.end - 1);
    } else {
      block.name = source.substring(arg.start, arg.end);
    }
  } else {
    block.name = '';
  }

  block.nameType = arg.type;
  block.lastProperty = lastProperty;

  if (arg.loc) {
    block.nameRange = new ParsedRange(
      arg.loc.start.line,
      arg.loc.start.column + 2,
      arg.loc.end.line,
      arg.loc.end.column - 1,
    );
  }
};

const registerNode = (
  node: ParsedNode,
  babelNode: t.Node,
  source: string,
  parseResult: ParseResult,
  bindings: Record<string, any>,
  lastProperty?: string,
) => {
  if (babelNode.loc) {
    node.start = { line: babelNode.loc.start.line, column: babelNode.loc.start.column + 1 };
    node.end = { line: babelNode.loc.end.line, column: babelNode.loc.end.column };
  }

  parseResult.addNode(node);

  if (node instanceof NamedBlock) {
    applyNameInfo(node, babelNode, source, bindings, lastProperty);
  }
};

const addNode = (
  type: ParsedNodeType,
  parent: ParsedNode,
  babelNode: t.Node,
  source: string,
  parseResult: ParseResult,
  bindings: Record<string, any>,
  lastProperty?: string,
): ParsedNode => {
  const child = parent.addChild(type);
  registerNode(child, babelNode, source, parseResult, bindings, lastProperty);
  return child;
};


interface ParseContext {
  source: string;
  parseResult: ParseResult;
  scopeBindings: Record<string, any>;
  addNode: typeof addNode;
}

const updateScopeBindings = (element: t.Node, scopeBindings: Record<string, any>) => {
  if (t.isClassDeclaration(element) && element.id) {
    scopeBindings[element.id.name] = element.id.name;
  } else if (t.isVariableDeclaration(element)) {
    element.declarations.forEach((decl) => {
      if (t.isIdentifier(decl.id) && decl.init) {
        const val = astToValue(decl.init, scopeBindings);
        if (val !== undefined) {
          scopeBindings[decl.id.name] = val;
        }
      } else if (t.isObjectPattern(decl.id) && decl.init) {
        const initVal = astToValue(decl.init, scopeBindings);
        if (initVal && typeof initVal === 'object') {
          decl.id.properties.forEach((prop) => {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && t.isIdentifier(prop.value)) {
              const key = prop.key.name;
              const varName = prop.value.name;
              if (key in initVal) {
                scopeBindings[varName] = initVal[key];
              }
            }
          });
        }
      }
    });
  }
};

const handleTestEach = (
  element: t.Node,
  parentParsed: ParsedNode,
  context: ParseContext,
  lastProperty?: string,
  callExpr?: t.CallExpression
): ParsedNode | undefined => {
  const { source, parseResult, scopeBindings, addNode } = context;
  let child: ParsedNode | undefined;

  if (callExpr && t.isCallExpression(callExpr.callee)) {
    const eachArgs = callExpr.callee.arguments;
    if (eachArgs.length > 0 && t.isArrayExpression(eachArgs[0])) {
      const table = astToValue(eachArgs[0], scopeBindings);
      if (Array.isArray(table)) {
        const titleArg = callExpr.arguments[0];
        let titleTemplate = '';
        if (t.isStringLiteral(titleArg)) {
          titleTemplate = titleArg.value;
        } else if (t.isTemplateLiteral(titleArg)) {
          if (titleArg.quasis.length === 1) titleTemplate = titleArg.quasis[0].value.raw;
        }

        if (titleTemplate) {
          table.forEach((row, i) => {
            const expandedTitle = formatTitle(titleTemplate, row, i);
            const newChild = addNode(
              ParsedNodeType.it,
              parentParsed,
              element,
              source,
              parseResult,
              scopeBindings,
              lastProperty,
            );
            if (newChild instanceof NamedBlock) {
              newChild.name = expandedTitle;
              newChild.nameRange = undefined;
              newChild.eachTemplate = titleTemplate;
            }
            if (i === 0) child = newChild;
          });
          return child;
        }
      }
    }
  }
  return undefined;
};

const handleDescribe = (
  element: t.Node,
  parentParsed: ParsedNode,
  context: ParseContext,
  lastProperty?: string
): ParsedNode => {
  const { source, parseResult, scopeBindings, addNode } = context;
  return addNode(ParsedNodeType.describe, parentParsed, element, source, parseResult, scopeBindings, lastProperty);
};

const handleIt = (
  element: t.Node,
  parentParsed: ParsedNode,
  context: ParseContext,
  lastProperty?: string,
): ParsedNode | undefined => {
  const { source, parseResult, scopeBindings, addNode } = context;

  if (lastProperty === 'each') {
    const callExpr = getCallExpression(element);
    if (!callExpr) {
      return addNode(ParsedNodeType.it, parentParsed, element, source, parseResult, scopeBindings, lastProperty);
    }
    const expandedChild = handleTestEach(element, parentParsed, context, lastProperty, callExpr);
    if (expandedChild) return expandedChild;
  }

  return addNode(ParsedNodeType.it, parentParsed, element, source, parseResult, scopeBindings, lastProperty);
};

const handleExpect = (
  element: t.Node,
  parentParsed: ParsedNode,
  context: ParseContext
): ParsedNode => {
  const { source, parseResult, scopeBindings, addNode } = context;
  return addNode(ParsedNodeType.expect, parentParsed, element, source, parseResult, scopeBindings);
};

export const parse = (file: string, data?: string, options?: ParserOptions): ParseResult => {
  const parseResult = new ParseResult(file);
  const { ast, source } = toAst(file, data, options);
  const bindings: Record<string, any> = {};

  const walk = (babelNode: t.Node | undefined, parentParsed: ParsedNode, parentBindings: Record<string, any>) => {
    if (!babelNode) return;

    const body = shallowAttr<t.Node[]>(babelNode, 'body');
    if (!Array.isArray(body)) return;

    // Create a new scope inheriting from parent
    const scopeBindings = { ...parentBindings };
    const context: ParseContext = { source, parseResult, scopeBindings, addNode };

    body.forEach((element) => {
      updateScopeBindings(element, scopeBindings);

      let child: ParsedNode | undefined;
      const [name, lastProperty] = getNameForNode(element);

      if (isDescribe(name)) {
        child = handleDescribe(element, parentParsed, context, lastProperty);
      } else if (isTestBlock(name) || (name === 'Deno' && lastProperty === 'test')) {
        child = handleIt(element, parentParsed, context, lastProperty);
      } else if (isExpectCall(element)) {
        child = handleExpect(element, parentParsed, context);
      } else if (t.isVariableDeclaration(element)) {
        element.declarations
          .filter((declaration) => declaration.init && isFunctionExpression(declaration.init))
          .forEach((declaration) => {
            const target = shallowAttr<t.Node>(declaration, 'init', 'body');
            walk(target, parentParsed, scopeBindings);
          });
      } else if (
        t.isExpressionStatement(element) &&
        t.isAssignmentExpression(element.expression) &&
        isFunctionExpression(element.expression.right)
      ) {
        const bodyNode = shallowAttr<t.Node>(element.expression, 'right', 'body');
        walk(bodyNode, parentParsed, scopeBindings);
      } else if (t.isReturnStatement(element)) {
        const args = shallowAttr<t.Node[]>(element.argument, 'arguments');
        if (Array.isArray(args)) {
          args
            .filter((arg) => isFunctionExpression(arg))
            .forEach((argument) => {
              const target = shallowAttr<t.Node>(argument, 'body');
              walk(target, parentParsed, scopeBindings);
            });
        }
      }

      const expression = getCallExpression(element);
      if (expression) {
        expression.arguments.forEach((argument) => {
          if (argument && typeof argument === 'object' && 'type' in (argument as t.Node)) {
            const bodyNode = shallowAttr<t.Node>(argument as t.Node, 'body');
            walk(bodyNode, child ?? parentParsed, scopeBindings);
          }
        });
      }
    });
  };

  walk(ast.program, parseResult.root, bindings);
  return parseResult;
};
