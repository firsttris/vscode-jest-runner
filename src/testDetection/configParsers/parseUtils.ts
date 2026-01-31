import { readFileSync } from 'node:fs';

export const findMatchingDelimiter = (
  content: string,
  startIndex: number,
  open: string,
  close: string
): number | undefined => {
  const search = (index: number, depth: number): number | undefined => {
    if (index >= content.length) return undefined;
    if (depth === 0) return index;
    const char = content[index];
    const newDepth = char === open ? depth + 1 : char === close ? depth - 1 : depth;
    return search(index + 1, newDepth);
  };
  return search(startIndex + 1, 1);
};

export const findMatchingBracket = (content: string, startIndex: number): number | undefined =>
  findMatchingDelimiter(content, startIndex, '[', ']');

export const findMatchingBrace = (content: string, startIndex: number): number | undefined =>
  findMatchingDelimiter(content, startIndex, '{', '}');

export const extractStringsFromArray = (arrayContent: string): string[] =>
  [...arrayContent.matchAll(/['"`]((?:\\.|[^'"`\\])*?)['"`]/g)].map((m) => m[1]);

export const extractStringValue = (content: string, key: string): string | undefined => {
  const match = content.match(new RegExp(`['"]?${key}['"]?\\s*:\\s*['"]([^'"]+)['"]`));
  return match?.[1];
};

export const extractArrayFromText = (content: string, key: string): string[] | undefined => {
  const match = content.match(new RegExp(`${key}\\s*:\\s*\\[`));
  if (!match || match.index === undefined) return undefined;

  const arrayStart = content.indexOf('[', match.index);
  if (arrayStart === -1) return undefined;
  const arrayEnd = findMatchingBracket(content, arrayStart);
  if (!arrayEnd) return undefined;
  const arrayContent = content.substring(arrayStart + 1, arrayEnd - 1);
  const values = extractStringsFromArray(arrayContent);
  return values.length > 0 ? values : undefined;
};

export const extractArrayProperty = (config: any, key: string): string[] | undefined => {
  const value = config[key];
  return Array.isArray(value) ? value : undefined;
};

export const readConfigFile = (configPath: string): string => readFileSync(configPath, 'utf8');
