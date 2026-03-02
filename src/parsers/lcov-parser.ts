import { existsSync, promises as fs } from 'node:fs';

export interface LcovLineDetail {
  line: number;
  hit: number;
}

export interface LcovFunctionDetail {
  name: string;
  line: number;
  hit?: number;
}

export interface LcovBranchDetail {
  line: number;
  block: number;
  branch: number;
  taken: number;
}

export interface LcovCoverageData {
  title?: string;
  file?: string;
  lines: {
    found: number;
    hit: number;
    details: LcovLineDetail[];
  };
  functions: {
    found: number;
    hit: number;
    details: LcovFunctionDetail[];
  };
  branches: {
    found: number;
    hit: number;
    details: LcovBranchDetail[];
  };
}

function createEmptyItem(): LcovCoverageData {
  return {
    lines: {
      found: 0,
      hit: 0,
      details: [],
    },
    functions: {
      found: 0,
      hit: 0,
      details: [],
    },
    branches: {
      found: 0,
      hit: 0,
      details: [],
    },
  };
}

function parseSource(content: string): LcovCoverageData[] {
  const data: LcovCoverageData[] = [];
  let item = createEmptyItem();

  const lines = ['end_of_record', ...content.split('\n')];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.includes('end_of_record')) {
      data.push(item);
      item = createEmptyItem();
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = line.substring(0, colonIndex).toUpperCase();
    const value = line.substring(colonIndex + 1);

    switch (key) {
      case 'TN':
        item.title = value.trim();
        break;

      case 'SF':
        item.file = value.trim();
        break;

      case 'FNF':
        item.functions.found = Number(value.trim());
        break;

      case 'FNH':
        item.functions.hit = Number(value.trim());
        break;

      case 'LF':
        item.lines.found = Number(value.trim());
        break;

      case 'LH':
        item.lines.hit = Number(value.trim());
        break;

      case 'DA': {
        const [lineNum, hitCount] = value.split(',');
        item.lines.details.push({
          line: Number(lineNum),
          hit: Number(hitCount),
        });
        break;
      }

      case 'FN': {
        const [lineNum, funcName] = value.split(',');
        item.functions.details.push({
          name: funcName,
          line: Number(lineNum),
        });
        break;
      }

      case 'FNDA': {
        const [hitCount, funcName] = value.split(',');
        const func = item.functions.details.find(
          (f) => f.name === funcName && f.hit === undefined,
        );
        if (func) {
          func.hit = Number(hitCount);
        }
        break;
      }

      case 'BRDA': {
        const [lineNum, blockNum, branchNum, taken] = value.split(',');
        item.branches.details.push({
          line: Number(lineNum),
          block: Number(blockNum),
          branch: Number(branchNum),
          taken: taken === '-' ? 0 : Number(taken),
        });
        break;
      }

      case 'BRF':
        item.branches.found = Number(value);
        break;

      case 'BRH':
        item.branches.hit = Number(value);
        break;
    }
  }

  data.shift();

  if (data.length === 0) {
    throw new Error('Failed to parse LCOV data: no records found');
  }

  return data;
}

export async function parseLcov(
  filePathOrContent: string,
): Promise<LcovCoverageData[]> {
  if (existsSync(filePathOrContent)) {
    const content = await fs.readFile(filePathOrContent, 'utf8');
    return parseSource(content);
  }

  return parseSource(filePathOrContent);
}
