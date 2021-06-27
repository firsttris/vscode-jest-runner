/* eslint-disable no-underscore-dangle */
/* eslint-disable no-param-reassign */
/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import { readFileSync } from 'fs';
import * as parser from '@babel/parser';
import { parseOptions } from './helper';
import { escapeRegExp } from './util';

export class TestCode {
  prefix: string;
  type: string;
  name: string;
  fullname: string;
  start: {
    line: number;
    column: number;
  };
  end: {
    line: number;
    column: number;
  };
}

export const parse = (filepath: string, data?: string): TestCode[] => {
  const _data = data || readFileSync(filepath).toString();
  const fileOption = parseOptions(filepath);
  const ast = parser.parse(_data, fileOption);
  const { program } = ast;
  return findTestMethods(program);
};

export const isPlaywrightTest = (filepath: string, data?: string): boolean => {
  const _data = data || readFileSync(filepath).toString();
  const fileOption = parseOptions(filepath);
  const ast = parser.parse(_data, fileOption);
  const { program } = ast;

  const require = ['@playwright/test', 'playwright/test'];
  const items = [];
  node2path(program, (path, value) => items.push([path, value]));
  // check playwright mode
  const is_playwright = items.find((i) => -1 < i[0].indexOf('/init/arguments[0]/') && -1 < require.indexOf(i[1]));
  return !!is_playwright;
};

function findTestMethods(program: unknown): TestCode[] {
  const ptnName1 = new RegExp(`${escapeRegExp('expression/callee/name')}$`);
  const ptnName2 = new RegExp(`${escapeRegExp('expression/callee/object/name')}$`);
  const ptnName3 = new RegExp(`${escapeRegExp('expression/callee/tag/object/name')}$`);
  const ptnName4 = new RegExp(`${escapeRegExp('expression/callee/callee/object/name')}$`);
  const funcNames1 = ['it', 'test', 'describe'];
  const funcNames2 = ['describe', 'only'];
  const funcNames3 = ['each'];
  const funcNames4 = ['each'];

  // convert
  const items = [];
  node2path(program, (path, value) => items.push([path, value]));

  const names = items.filter((i) => /\/name$/.test(i[0]) && -1 < funcNames1.indexOf(i[1]));
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

  // match test.each(...)
  const pathPrefix3 = names
    .filter((i) => ptnName3.test(i[0]))
    .map((i) => {
      const prefix = i[0].replace(ptnName3, 'expression/');
      const type = items.find((i) => `${prefix}callee/tag/property/name` == i[0] && -1 < funcNames3.indexOf(i[1]));
      return [prefix, type ? type[1] : null];
    })
    .filter((f) => f[1]);

  // match test.each(...)
  const pathPrefix4 = names
    .filter((i) => ptnName4.test(i[0]))
    .map((i) => {
      const prefix = i[0].replace(ptnName4, 'expression/');
      const type = items.find((i) => `${prefix}callee/callee/property/name` == i[0] && -1 < funcNames4.indexOf(i[1]));
      return [prefix, type ? type[1] : null];
    })
    .filter((f) => f[1]);

  const all: string[][] = pathPrefix1.concat(pathPrefix2, pathPrefix3, pathPrefix4);
  all.sort((a, b) => (a[0] > b[0] ? 1 : -1));

  const elements: TestCode[] = all.map((prefix) => {
    const ptnPosition = new RegExp(`^${escapeRegExp(prefix[0])}loc/(start|end)/`);
    const ptnTestName = new RegExp(`^${escapeRegExp(prefix[0] + 'arguments[0]/')}(value|quasis\\[\\d+\\]/value/raw)$`);
    const element: TestCode = new TestCode();
    element.prefix = prefix[0];
    element.type = prefix[1];
    items
      .filter((i) => ptnPosition.test(i[0]))
      .forEach((i) => {
        const key = /[^/]+\/[^/]+$/.exec(i[0])[0].split('/');
        if (!element[key[0]]) element[key[0]] = {};
        element[key[0]][key[1]] = i[1];
      });
    element.name = items
      .filter((i) => ptnTestName.test(i[0]))
      .map((i) => i[1])
      .join('${i}');
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
