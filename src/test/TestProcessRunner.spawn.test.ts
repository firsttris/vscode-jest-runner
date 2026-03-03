import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as vscode from 'vscode';
import {
  executeTestCommand,
  executeTestCommandFast,
} from '../execution/TestProcessRunner';
import { WorkspaceConfiguration } from './__mocks__/vscode';

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: jest.Mock;
};

function createMockChildProcess(): MockChildProcess {
  const cp = new EventEmitter() as MockChildProcess;
  cp.stdout = new EventEmitter();
  cp.stderr = new EventEmitter();
  cp.kill = jest.fn();
  return cp;
}

function createToken(): vscode.CancellationToken {
  return {
    isCancellationRequested: false,
    onCancellationRequested: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  } as unknown as vscode.CancellationToken;
}

describe('TestProcessRunner spawn behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(vscode.workspace, 'getConfiguration')
      .mockReturnValue(new WorkspaceConfiguration({}) as any);
  });

  it('should parse command/env and use non-shell spawn in executeTestCommand', async () => {
    const childProcess = createMockChildProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(childProcess);

    const run = {
      appendOutput: jest.fn(),
      failed: jest.fn(),
      skipped: jest.fn(),
    } as unknown as vscode.TestRun;

    const promise = executeTestCommand(
      'NODE_OPTIONS=fromCommand npx --no-install jest',
      ['--json'],
      createToken(),
      [{ id: 'test-id' } as unknown as vscode.TestItem],
      run,
      '/workspace',
      { NODE_OPTIONS: 'fromAdditionalEnv', EXTRA: '1' },
    );

    childProcess.stdout.emit('data', '{"testResults":[]}\n');
    childProcess.stderr.emit('data', 'warn\n');
    childProcess.emit('close', 0);

    await promise;

    expect(spawn).toHaveBeenCalledWith(
      'npx',
      ['--no-install', 'jest', '--json'],
      expect.objectContaining({
        cwd: '/workspace',
        shell: false,
        env: expect.objectContaining({
          FORCE_COLOR: 'true',
          NODE_OPTIONS: 'fromAdditionalEnv',
          EXTRA: '1',
        }),
      }),
    );
    expect((run as any).appendOutput).toHaveBeenCalledWith(
      '{"testResults":[]}\r\n',
    );
    expect((run as any).appendOutput).toHaveBeenCalledWith('warn\r\n');
  });

  it('should parse command/env and use non-shell spawn in executeTestCommandFast', async () => {
    const childProcess = createMockChildProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(childProcess);

    const run = {
      appendOutput: jest.fn(),
      failed: jest.fn(),
      skipped: jest.fn(),
      passed: jest.fn(),
    } as unknown as vscode.TestRun;

    const promise = executeTestCommandFast(
      'FOO=bar node ./node_modules/jest/bin/jest.js',
      ['--runInBand'],
      createToken(),
      { id: 'test-id' } as unknown as vscode.TestItem,
      run,
      '/workspace',
      { BAR: 'baz' },
    );

    childProcess.emit('close', 0);

    await promise;

    expect(spawn).toHaveBeenCalledWith(
      'node',
      ['./node_modules/jest/bin/jest.js', '--runInBand'],
      expect.objectContaining({
        cwd: '/workspace',
        shell: false,
        env: expect.objectContaining({
          FORCE_COLOR: 'true',
          FOO: 'bar',
          BAR: 'baz',
        }),
      }),
    );
    expect((run as any).passed).toHaveBeenCalled();
  });
});
