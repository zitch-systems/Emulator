// Small process helper for the native (local SDK) orchestrator. Server only.

import { spawn } from 'node:child_process';

export interface ExecResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

export function execCapture(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; input?: Buffer } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    const out: Buffer[] = [];
    let err = '';
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, opts.timeoutMs ?? 30000);

    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: Buffer.concat(out), stderr: err + String(e) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out), stderr: err });
    });
    if (opts.input) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

export async function toolAvailable(cmd: string, args: string[] = ['--version']): Promise<boolean> {
  try {
    const r = await execCapture(cmd, args, { timeoutMs: 5000 });
    return r.code === 0 || r.stdout.length > 0;
  } catch {
    return false;
  }
}

export async function text(cmd: string, args: string[], timeoutMs = 30000): Promise<string> {
  const r = await execCapture(cmd, args, { timeoutMs });
  return r.stdout.toString() + (r.stderr ? '\n' + r.stderr : '');
}
