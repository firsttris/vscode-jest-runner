import { readFileSync } from 'node:fs';
import { format } from 'node:util';
import { parse as babelParse, type ParserOptions } from '@babel/parser';
import * as t from '@babel/types';
import { getNameForNode, getCallExpression, parseOptions, shallowAttr, type JESParserOptions } from './helper';
import { NamedBlock, ParseResult, ParsedNode, ParsedNodeType, ParsedRange } from './parserNodes';

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

const astToValue = (node: t.Node): any => {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isBooleanLiteral(node)) return node.value;
  if (t.isNullLiteral(node)) return null;
  if (t.isIdentifier(node) && node.name === 'undefined') return undefined;
  if (t.isArrayExpression(node)) return node.elements.map((e) => (e ? astToValue(e) : null));
  if (t.isObjectExpression(node)) {
    return node.properties.reduce((acc, prop) => {
      if (t.isObjectProperty(prop)) {
        const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
        if (key) acc[key] = astToValue(prop.value as t.Node);
      }
      return acc;
    }, {} as any);
  }
  if (t.isTemplateLiteral(node)) {
    if (node.quasis.length === 1) return node.quasis[0].value.raw;
  }
  return undefined;
};

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

const applyNameInfo = (block: NamedBlock, statement: t.Node, source: string, lastProperty?: string) => {
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

  if (t.isStringLiteral(arg)) {
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
  lastProperty?: string,
) => {
  if (babelNode.loc) {
    node.start = { line: babelNode.loc.start.line, column: babelNode.loc.start.column + 1 };
    node.end = { line: babelNode.loc.end.line, column: babelNode.loc.end.column };
  }

  parseResult.addNode(node);

  if (node instanceof NamedBlock) {
    applyNameInfo(node, babelNode, source, lastProperty);
  }
};

const addNode = (
  type: ParsedNodeType,
  parent: ParsedNode,
  babelNode: t.Node,
  source: string,
  parseResult: ParseResult,
  lastProperty?: string,
): ParsedNode => {
  const child = parent.addChild(type);
  registerNode(child, babelNode, source, parseResult, lastProperty);
  return child;
};

export const parse = (file: string, data?: string, options?: ParserOptions): ParseResult => {
  const parseResult = new ParseResult(file);
  const { ast, source } = toAst(file, data, options);

  const walk = (babelNode: t.Node | undefined, parentParsed: ParsedNode) => {
    if (!babelNode) {
      return;
    }

    const body = shallowAttr<t.Node[]>(babelNode, 'body');
    if (!Array.isArray(body)) {
      return;
    }

    body.forEach((element) => {
      let child: ParsedNode | undefined;

      const [name, lastProperty] = getNameForNode(element);

      if (isDescribe(name)) {
        child = addNode(ParsedNodeType.describe, parentParsed, element, source, parseResult, lastProperty);
      } else if (isTestBlock(name)) {
        if (lastProperty === 'each') {
          const callExpr = getCallExpression(element);
          let expanded = false;
          if (callExpr && t.isCallExpression(callExpr.callee)) {
            const eachArgs = callExpr.callee.arguments;
            if (eachArgs.length > 0 && t.isArrayExpression(eachArgs[0])) {
              const table = astToValue(eachArgs[0]);
              if (Array.isArray(table)) {
                const titleArg = callExpr.arguments[0];
                let titleTemplate = '';
                if (t.isStringLiteral(titleArg)) {
                  titleTemplate = titleArg.value;
                } else if (t.isTemplateLiteral(titleArg)) {
                  if (titleArg.quasis.length === 1) titleTemplate = titleArg.quasis[0].value.raw;
                }

                if (titleTemplate) {
                  expanded = true;
                  table.forEach((row, i) => {
                    const expandedTitle = formatTitle(titleTemplate, row, i);
                    const newChild = addNode(ParsedNodeType.it, parentParsed, element, source, parseResult, lastProperty);
                    if (newChild instanceof NamedBlock) {
                      newChild.name = expandedTitle;
                      newChild.nameRange = undefined;
                    }
                    if (i === 0) child = newChild;
                  });
                }
              }
            }
          }

          if (!expanded) {
            child = addNode(ParsedNodeType.it, parentParsed, element, source, parseResult, lastProperty);
          }
        } else {
          child = addNode(ParsedNodeType.it, parentParsed, element, source, parseResult, lastProperty);
        }
      } else if (isExpectCall(element)) {
        child = addNode(ParsedNodeType.expect, parentParsed, element, source, parseResult);
      } else if (t.isVariableDeclaration(element)) {
        element.declarations
          .filter((declaration) => declaration.init && isFunctionExpression(declaration.init))
          .forEach((declaration) => {
            const target = shallowAttr<t.Node>(declaration, 'init', 'body');
            walk(target, parentParsed);
          });
      } else if (
        t.isExpressionStatement(element) &&
        t.isAssignmentExpression(element.expression) &&
        isFunctionExpression(element.expression.right)
      ) {
        const bodyNode = shallowAttr<t.Node>(element.expression, 'right', 'body');
        walk(bodyNode, parentParsed);
      } else if (t.isReturnStatement(element)) {
        const args = shallowAttr<t.Node[]>(element.argument, 'arguments');
        if (Array.isArray(args)) {
          args
            .filter((arg) => isFunctionExpression(arg))
            .forEach((argument) => {
              const target = shallowAttr<t.Node>(argument, 'body');
              walk(target, parentParsed);
            });
        }
      }

      const expression = getCallExpression(element);
      if (expression) {
        expression.arguments.forEach((argument) => {
          if (argument && typeof argument === 'object' && 'type' in (argument as t.Node)) {
            const bodyNode = shallowAttr<t.Node>(argument as t.Node, 'body');
            walk(bodyNode, child ?? parentParsed);
          }
        });
      }
    });
  };

  walk(ast.program, parseResult.root);
  return parseResult;
};
