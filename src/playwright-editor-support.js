import * as parser from '@babel/parser';
import { parseOptions } from './helper';
import { escapeRegExp } from './util';

export const parse = (filepath, text) => {
  const fileOption = parseOptions(filepath);
  const ast = parser.parse(text, fileOption);
  const { program } = ast;
  return findTestMethods(program);
};

export const isPlaywrightTest = (filepath, text) => {
  const fileOption = parseOptions(filepath);
  const ast = parser.parse(text, fileOption);
  const { program } = ast;

  const require = ['@playwright/test', 'playwright/test'];
  const items = [];
  node2path(program, (path, value) => items.push([path, value]));
  // check playwright mode
  const is_playwright = items.find((i) => -1 < i[0].indexOf('/init/arguments[0]/') && -1 < require.indexOf(i[1]));
  return !!is_playwright;
};

function findTestMethods(program) {
  const ptnName1 = new RegExp(`${escapeRegExp('expression/callee/name')}$`);
  const ptnName2 = new RegExp(`${escapeRegExp('expression/callee/object/name')}$`);
  const funcNames1 = ['it', 'test', 'describe'];
  const funcNames2 = ['describe', 'only'];

  // convert
  const items = [];
  node2path(program, (path, value) => items.push([path, value]));

  const names = items.filter((i) => -1 < funcNames1.indexOf(i[1]));
  // match test(...)
  const pathPrefix1 = names
    .filter((i) => ptnName1.test(i[0]))
    .map((i) => [i[0].replace(ptnName1, 'expression/'), i[1]]);

  // match test.xxx(...)
  const pathPrefix2 = names
    .filter((i) => ptnName2.test(i[0]))
    .map((i) => {
      const prefix = i[0].replace(ptnName2, 'expression/');
      const type = items.find((i) => `${prefix}callee/property/name` == i[0] && -1 < funcNames2.indexOf(i[1]));
      return [prefix, type ? type[1] : null];
    })
    .filter((f) => f[1]);

  const all = pathPrefix1.concat(pathPrefix2);
  all.sort((a, b) => (a[0] > b[0] ? 1 : -1));

  const elements = all.map((prefix) => {
    const ptnPosition = `${prefix[0]}callee/loc`;
    const ptnTestName = `${prefix[0]}arguments[0]/value`;
    const element = { prefix: prefix[0], type: prefix[1] };
    items
      .filter((i) => 0 == i[0].indexOf(ptnPosition))
      .forEach((i) => {
        const key = /[^/]+\/[^/]+$/.exec(i[0])[0].split('/');
        if (!element[key[0]]) element[key[0]] = {};
        element[key[0]][key[1]] = i[1];
      });
    const name = items.find((i) => ptnTestName == i[0]);
    element.name = name ? name[1] : null;
    element.fullname = element.name;
    return element;
  });
  elements.forEach((element) => {
    const head = [''];
    element.fullname = element.prefix
      .split('/expression/')
      .filter((f) => 0 < f.length)
      .map((p) => {
        head[0] += `${p}/expression/`;
        const el = elements.find((e) => e.prefix == head[0]);
        return el ? el.name : null;
      })
      .filter((f) => f)
      .join(' ');
  });
  elements.forEach((element) => delete element.prefix);
  return elements;
}

function node2path(node, fn, path = '') {
  if (node == null || typeof node == 'undefined') return;
  if (Array.isArray(node)) {
    node.forEach((child, idx) => node2path(child, fn, `${path}[${idx}]`));
    return;
  }
  if (typeof node == 'object') {
    Object.keys(node).forEach((key) => node2path(node[key], fn, `${path}/${key}`));
    return;
  }
  fn.call(this, path, node);
}
