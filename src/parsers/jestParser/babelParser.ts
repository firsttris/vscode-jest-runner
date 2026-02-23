import { readFileSync } from 'node:fs';
import { format } from 'node:util';
import { parse as babelParse, type ParserOptions } from '@babel/parser';
import * as t from '@babel/types';
import {
  getNameForNode,
  getCallExpression,
  parseOptions,
  shallowAttr,
  type JESParserOptions,
} from './helper';
import {
  NamedBlock,
  ParseResult,
  ParsedNode,
  ParsedNodeType,
  ParsedRange,
} from './parserNodes';
import { astToValue } from '../../utils/AstUtils';

const DESCRIBE_EACH_INNER_TEST_FLAG = '__JTR_DESCRIBE_EACH_INNER_TEST' as const;
type ScopeBindings = Record<string, any>;
type EachCallbackFn = t.ArrowFunctionExpression | t.FunctionExpression;

const isFunctionExpression = (
  node: t.Node,
): node is t.ArrowFunctionExpression | t.FunctionExpression =>
  t.isArrowFunctionExpression(node) || t.isFunctionExpression(node);

const toAst = (
  file: string,
  data?: string,
  options?: ParserOptions,
): { ast: t.File; source: string } => {
  const source = data ?? readFileSync(file, 'utf8');
  const parserOptions: ParserOptions = {
    ...(options ?? {}),
    sourceType: 'module',
  };
  return { ast: babelParse(source, parserOptions), source };
};

export const getASTfor = (
  file: string,
  data?: string,
  options?: JESParserOptions,
): t.File => {
  const { ast } = toAst(file, data, parseOptions(file, options));
  return ast;
};

const isDescribe = (name?: string) => name === 'describe';

const isTestBlock = (name?: string) =>
  name === 'it' || name === 'fit' || name === 'test';

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

const getTitleTemplate = (titleArg: t.Node | undefined): string => {
  if (!titleArg) {
    return '';
  }

  if (t.isStringLiteral(titleArg)) {
    return titleArg.value;
  }

  if (t.isTemplateLiteral(titleArg) && titleArg.quasis.length === 1) {
    return titleArg.quasis[0].value.raw;
  }

  return '';
};

const getEachCallbackFunction = (
  callExpr: t.CallExpression,
): EachCallbackFn | undefined => {
  const callbackArg = callExpr.arguments[1];
  if (
    t.isArrowFunctionExpression(callbackArg) ||
    t.isFunctionExpression(callbackArg)
  ) {
    return callbackArg;
  }
  return undefined;
};

const getInlineEachTable = (
  callExpr: t.CallExpression,
  scopeBindings: ScopeBindings,
): unknown[] | undefined => {
  if (!t.isCallExpression(callExpr.callee)) {
    return undefined;
  }

  const eachArgs = callExpr.callee.arguments;
  if (eachArgs.length === 0 || !t.isArrayExpression(eachArgs[0])) {
    return undefined;
  }

  const table = astToValue(eachArgs[0], scopeBindings);
  return Array.isArray(table) ? table : undefined;
};

const getResolvableEachTable = (
  callExpr: t.CallExpression,
  scopeBindings: ScopeBindings,
): unknown[] | undefined => {
  if (!t.isCallExpression(callExpr.callee)) {
    return undefined;
  }

  const eachArgs = callExpr.callee.arguments;
  if (eachArgs.length === 0) {
    return undefined;
  }

  const table = astToValue(eachArgs[0] as t.Node, scopeBindings);
  return Array.isArray(table) ? table : undefined;
};

const applyExpandedEachMetadata = (
  node: ParsedNode,
  expandedTitle: string,
  titleTemplate: string,
): void => {
  if (node instanceof NamedBlock) {
    node.name = expandedTitle;
    node.nameRange = undefined;
    node.eachTemplate = titleTemplate;
  }
};

const bindObjectPatternParams = (
  pattern: t.ObjectPattern,
  row: Record<string, unknown>,
  rowBindings: ScopeBindings,
): void => {
  pattern.properties.forEach((prop) => {
    if (
      t.isObjectProperty(prop) &&
      t.isIdentifier(prop.key) &&
      t.isIdentifier(prop.value)
    ) {
      if (prop.key.name in row) {
        rowBindings[prop.value.name] = row[prop.key.name];
      }
    }
  });
};

const createRowBindings = (
  callbackFn: EachCallbackFn,
  row: unknown,
  scopeBindings: ScopeBindings,
): ScopeBindings => {
  const rowBindings: ScopeBindings = { ...scopeBindings };
  const params = callbackFn.params;

  if (params.length === 1) {
    const param = params[0];

    if (t.isIdentifier(param)) {
      rowBindings[param.name] = row;
    } else if (
      t.isObjectPattern(param) &&
      row &&
      typeof row === 'object' &&
      !Array.isArray(row)
    ) {
      bindObjectPatternParams(
        param,
        row as Record<string, unknown>,
        rowBindings,
      );
    }
  } else if (Array.isArray(row)) {
    params.forEach((param, idx) => {
      if (t.isIdentifier(param)) {
        rowBindings[param.name] = row[idx];
      }
    });
  }

  rowBindings[DESCRIBE_EACH_INNER_TEST_FLAG] = true;
  return rowBindings;
};

const isExpectCall = (node: t.Node): boolean => {
  const expression = getCallExpression(node);
  if (!expression) {
    return false;
  }

  let callee: unknown = expression.callee;
  while (callee) {
    if (
      typeof callee === 'object' &&
      callee &&
      'name' in (callee as t.Identifier)
    ) {
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
  bindings: ScopeBindings = {},
  lastProperty?: string,
) => {
  if (
    !t.isExpressionStatement(statement) ||
    !t.isCallExpression(statement.expression)
  ) {
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

  if (t.isTemplateLiteral(arg) && bindings[DESCRIBE_EACH_INNER_TEST_FLAG]) {
    block.eachTemplate = source.substring(arg.start + 1, arg.end - 1);
  }

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
  bindings: ScopeBindings,
  lastProperty?: string,
) => {
  if (babelNode.loc) {
    node.start = {
      line: babelNode.loc.start.line,
      column: babelNode.loc.start.column + 1,
    };
    node.end = {
      line: babelNode.loc.end.line,
      column: babelNode.loc.end.column,
    };
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
  bindings: ScopeBindings,
  lastProperty?: string,
): ParsedNode => {
  const child = parent.addChild(type);
  registerNode(child, babelNode, source, parseResult, bindings, lastProperty);
  return child;
};

interface ParseContext {
  source: string;
  parseResult: ParseResult;
  scopeBindings: ScopeBindings;
  addNode: typeof addNode;
  walk: (
    babelNode: t.Node | undefined,
    parentParsed: ParsedNode,
    parentBindings: ScopeBindings,
  ) => void;
}

const updateScopeBindings = (element: t.Node, scopeBindings: ScopeBindings) => {
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
            if (
              t.isObjectProperty(prop) &&
              t.isIdentifier(prop.key) &&
              t.isIdentifier(prop.value)
            ) {
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
  callExpr?: t.CallExpression,
): ParsedNode | undefined => {
  const { source, parseResult, scopeBindings, addNode } = context;
  let child: ParsedNode | undefined;

  if (callExpr) {
    const table = getResolvableEachTable(callExpr, scopeBindings);
    const titleTemplate = getTitleTemplate(
      callExpr.arguments[0] as t.Node | undefined,
    );

    if (table && titleTemplate) {
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

        applyExpandedEachMetadata(newChild, expandedTitle, titleTemplate);

        if (i === 0) {
          child = newChild;
        }
      });

      return child;
    }
  }
  return undefined;
};

const handleDescribe = (
  element: t.Node,
  parentParsed: ParsedNode,
  context: ParseContext,
  lastProperty?: string,
): { child: ParsedNode; expandedEach: boolean } => {
  const { source, parseResult, scopeBindings, addNode, walk } = context;

  if (lastProperty === 'each') {
    const callExpr = getCallExpression(element);
    if (callExpr) {
      const callbackFn = getEachCallbackFunction(callExpr);
      const table = getResolvableEachTable(callExpr, scopeBindings);
      const titleTemplate = getTitleTemplate(
        callExpr.arguments[0] as t.Node | undefined,
      );

      if (table && titleTemplate && callbackFn) {
        let firstChild: ParsedNode | undefined;

        table.forEach((row, i) => {
          const expandedTitle = formatTitle(titleTemplate, row, i);
          const describeChild = addNode(
            ParsedNodeType.describe,
            parentParsed,
            element,
            source,
            parseResult,
            scopeBindings,
            lastProperty,
          );

          applyExpandedEachMetadata(
            describeChild,
            expandedTitle,
            titleTemplate,
          );

          if (!firstChild) {
            firstChild = describeChild;
          }

          const rowBindings = createRowBindings(callbackFn, row, scopeBindings);

          walk(callbackFn.body, describeChild, rowBindings);
        });

        if (firstChild) {
          return { child: firstChild, expandedEach: true };
        }
      }
    }
  }

  const child = addNode(
    ParsedNodeType.describe,
    parentParsed,
    element,
    source,
    parseResult,
    scopeBindings,
    lastProperty,
  );
  return { child, expandedEach: false };
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
      return addNode(
        ParsedNodeType.it,
        parentParsed,
        element,
        source,
        parseResult,
        scopeBindings,
        lastProperty,
      );
    }
    const expandedChild = handleTestEach(
      element,
      parentParsed,
      context,
      lastProperty,
      callExpr,
    );
    if (expandedChild) return expandedChild;
  }

  return addNode(
    ParsedNodeType.it,
    parentParsed,
    element,
    source,
    parseResult,
    scopeBindings,
    lastProperty,
  );
};

const handleExpect = (
  element: t.Node,
  parentParsed: ParsedNode,
  context: ParseContext,
): ParsedNode => {
  const { source, parseResult, scopeBindings, addNode } = context;
  return addNode(
    ParsedNodeType.expect,
    parentParsed,
    element,
    source,
    parseResult,
    scopeBindings,
  );
};

const isTestDescribe = (node: t.Node): boolean => {
  const call = getCallExpression(node);
  if (!call) return false;
  let callee = call.callee;
  while (t.isMemberExpression(callee)) {
    if (
      t.isIdentifier(callee.property) &&
      callee.property.name === 'describe'
    ) {
      return true;
    }
    callee = callee.object;
  }
  return false;
};

export const parse = (
  file: string,
  data?: string,
  options?: ParserOptions,
): ParseResult => {
  const parseResult = new ParseResult(file);
  const { ast, source } = toAst(file, data, options);
  const bindings: ScopeBindings = {};

  const walk = (
    babelNode: t.Node | undefined,
    parentParsed: ParsedNode,
    parentBindings: ScopeBindings,
  ) => {
    if (!babelNode) return;

    const body = shallowAttr<t.Node[]>(babelNode, 'body');
    if (!Array.isArray(body)) return;

    // Create a new scope inheriting from parent
    const scopeBindings = { ...parentBindings };
    const context: ParseContext = {
      source,
      parseResult,
      scopeBindings,
      addNode,
      walk,
    };

    body.forEach((element) => {
      updateScopeBindings(element, scopeBindings);

      let child: ParsedNode | undefined;
      let skipArgumentWalk = false;
      const [name, lastProperty] = getNameForNode(element);

      if (
        isDescribe(name) ||
        (name === 'test' &&
          (lastProperty === 'describe' ||
            (['parallel', 'serial', 'only', 'skip', 'fixme', 'fail'].includes(
              lastProperty!,
            ) &&
              isTestDescribe(element))))
      ) {
        const describeResult = handleDescribe(
          element,
          parentParsed,
          context,
          lastProperty,
        );
        child = describeResult.child;
        skipArgumentWalk = describeResult.expandedEach;
      } else if (
        isTestBlock(name) ||
        (name === 'Deno' && lastProperty === 'test')
      ) {
        if (name === 'test' && lastProperty === 'step') {
          // ignore test.step
        } else {
          child = handleIt(element, parentParsed, context, lastProperty);
        }
      } else if (isExpectCall(element)) {
        child = handleExpect(element, parentParsed, context);
      } else if (t.isVariableDeclaration(element)) {
        element.declarations
          .filter(
            (declaration) =>
              declaration.init && isFunctionExpression(declaration.init),
          )
          .forEach((declaration) => {
            const target = shallowAttr<t.Node>(declaration, 'init', 'body');
            walk(target, parentParsed, scopeBindings);
          });
      } else if (
        t.isExpressionStatement(element) &&
        t.isAssignmentExpression(element.expression) &&
        isFunctionExpression(element.expression.right)
      ) {
        const bodyNode = shallowAttr<t.Node>(
          element.expression,
          'right',
          'body',
        );
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
      if (expression && !skipArgumentWalk) {
        expression.arguments.forEach((argument) => {
          if (
            argument &&
            typeof argument === 'object' &&
            'type' in (argument as t.Node)
          ) {
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
