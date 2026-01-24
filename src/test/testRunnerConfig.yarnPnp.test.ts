import { detectYarnPnp } from '../testRunnerConfig';
import * as fs from 'fs';

describe('detectYarnPnp', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return enabled false when .yarn/releases does not exist', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = detectYarnPnp('/home/user/project');

    expect(result).toEqual({ enabled: false });
  });

  it('should return enabled true with yarn binary when found', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readdirSync').mockReturnValue([
      'yarn-3.2.0.cjs',
      'other-file.txt',
    ] as any);

    const result = detectYarnPnp('/home/user/project');

    expect(result).toEqual({
      enabled: true,
      yarnBinary: 'yarn-3.2.0.cjs',
    });
  });

  it('should find the first yarn binary when multiple exist', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readdirSync').mockReturnValue([
      'yarn-3.2.0.cjs',
      'yarn-4.0.0.cjs',
    ] as any);

    const result = detectYarnPnp('/home/user/project');

    expect(result).toEqual({
      enabled: true,
      yarnBinary: 'yarn-3.2.0.cjs',
    });
  });

  it('should return enabled false when no yarn binary found', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readdirSync').mockReturnValue([
      'some-other-file.js',
      'readme.md',
    ] as any);

    const result = detectYarnPnp('/home/user/project');

    expect(result).toEqual({ enabled: false });
  });

  it('should return enabled false when readdirSync throws error', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = detectYarnPnp('/home/user/project');

    expect(result).toEqual({ enabled: false });
  });

  it('should only match files starting with yarn- and ending with .cjs', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readdirSync').mockReturnValue([
      'yarn.cjs',           // missing version
      'yarn-3.2.0.js',      // wrong extension
      'my-yarn-3.2.0.cjs',  // not starting with yarn-
      'yarn-4.0.0.cjs',     // correct
    ] as any);

    const result = detectYarnPnp('/home/user/project');

    expect(result).toEqual({
      enabled: true,
      yarnBinary: 'yarn-4.0.0.cjs',
    });
  });
});
