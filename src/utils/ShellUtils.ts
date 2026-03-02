import { parse } from 'shell-quote';

export function stripAnsi(str: string): string {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

export function parseShellCommand(command: string): string[] {
  const entries = parse(command);
  const args: string[] = [];

  for (const entry of entries) {
    if (typeof entry === 'string') {
      args.push(entry);
    } else if ('op' in entry) {
      if (entry.op === 'glob') {
        args.push(entry.pattern);
      } else {
        args.push(entry.op);
      }
    }
  }
  return args;
}

export function parseCommandAndEnv(command: string): {
  env: Record<string, string>;
  executable: string;
  args: string[];
} {
  const parts = parseShellCommand(command);
  const env: Record<string, string> = {};
  let executable = '';
  const args: string[] = [];

  let i = 0;
  // Consume leading env vars
  for (; i < parts.length; i++) {
    const part = parts[i];
    const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/);
    if (match) {
      env[match[1]] = match[2];
    } else {
      break;
    }
  }

  if (i < parts.length) {
    executable = parts[i];
    i++;
  }

  // Remaining parts are args
  for (; i < parts.length; i++) {
    args.push(parts[i]);
  }

  return { env, executable, args };
}
