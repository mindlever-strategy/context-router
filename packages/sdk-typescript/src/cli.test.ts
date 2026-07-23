import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from './cli.js';
import type { RouterStatus } from './client.js';

const status: RouterStatus = {
  version: '0.3.1',
  storage: { engine: 'sqlite' },
  totals: {
    workspaces: 0,
    workflows: 0,
    runningWorkflows: 0,
    checkpoints: 0,
  },
  recentWorkflows: [],
};

function capture() {
  const output: string[] = [];
  const errors: string[] = [];
  const io: CliIo = {
    out: (message) => output.push(message),
    error: (message) => errors.push(message),
  };
  return { output, errors, io };
}

function healthyRouter() {
  return Promise.resolve({
    status: () => Promise.resolve(status),
    discoverTools: () =>
      Promise.resolve(Array.from({ length: 30 }, (_, i) => `tool-${i}`)),
    close: () => Promise.resolve(),
  });
}

describe('Context Router CLI', () => {
  it('returns usage exit code 2 for invalid input', async () => {
    const result = capture();
    expect(await runCli([], result.io, healthyRouter)).toBe(2);
    expect(result.errors.join('\n')).toContain('Usage:');
  });

  it('returns exit code 0 and stable JSON for healthy diagnostics', async () => {
    const result = capture();
    expect(await runCli(['doctor', '--json'], result.io, healthyRouter)).toBe(
      0,
    );
    expect(JSON.parse(result.output[0])).toMatchObject({ ok: true, status });
  });

  it('returns exit code 1 when startup fails', async () => {
    const result = capture();
    expect(
      await runCli(['doctor'], result.io, async () => {
        throw new Error('database unavailable');
      }),
    ).toBe(1);
    expect(result.output.join('\n')).toContain('database unavailable');
  });

  it('prints status in JSON mode', async () => {
    const result = capture();
    expect(await runCli(['status', '--json'], result.io, healthyRouter)).toBe(
      0,
    );
    expect(JSON.parse(result.output[0])).toEqual(status);
  });
});
