import { Config } from '@jest/types';
import { runCLI } from 'jest';
import * as path from 'path';

const projectRootPath = path.resolve(__dirname, '../../../');
const jestConfig: Partial<Config.ProjectConfig> = {
  roots: ['./out/test/suite'],
  testRegex: ['\\.test\\.js$'],
};

export async function run(): Promise<void> {
  try {
    const result = await runCLI(jestConfig as any, [projectRootPath]);

    if (result.results.success) {
      console.log('Tests completed');
    } else {
      console.error('Tests failed', result.results);
      throw new Error('Tests failed');
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}
