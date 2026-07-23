#!/usr/bin/env node
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ContextRouter, type RouterStatus } from './client.js';

export interface CliIo {
  out(message: string): void;
  error(message: string): void;
}

interface ParsedArguments {
  command: 'doctor' | 'status';
  json: boolean;
  dataDir?: string;
}

interface DiagnosticCheck {
  name: string;
  ok: boolean;
  message: string;
}

interface DiagnosticRouter {
  status(): Promise<RouterStatus>;
  discoverTools(): Promise<string[]>;
  close(): Promise<void>;
}

type RouterFactory = (options: {
  dataDir?: string;
}) => Promise<DiagnosticRouter>;

const defaultIo: CliIo = {
  out: (message) => console.log(message),
  error: (message) => console.error(message),
};

export async function runCli(
  args: string[],
  io: CliIo = defaultIo,
  createRouter: RouterFactory = (options) => ContextRouter.local(options),
): Promise<number> {
  let parsed: ParsedArguments;
  try {
    parsed = parseArguments(args);
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    io.error(usage());
    return 2;
  }

  if (parsed.command === 'doctor') return runDoctor(parsed, io, createRouter);
  return runStatus(parsed, io, createRouter);
}

async function runDoctor(
  options: ParsedArguments,
  io: CliIo,
  createRouter: RouterFactory,
): Promise<number> {
  const checks: DiagnosticCheck[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({
    name: 'node',
    ok: major >= 20,
    message: `Node ${process.versions.node}${major >= 20 ? '' : ' (Node 20+ required)'}`,
  });

  let router: DiagnosticRouter | undefined;
  let status: RouterStatus | undefined;
  try {
    router = await createRouter({ dataDir: options.dataDir });
    checks.push({
      name: 'server',
      ok: true,
      message: 'Packaged MCP server started successfully',
    });
    status = await router.status();
    checks.push({
      name: 'database',
      ok: true,
      message: `${status.storage.engine}${status.storage.location ? ` at ${status.storage.location}` : ''}`,
    });
    if (status.storage.location) {
      await mkdir(dirname(status.storage.location), { recursive: true });
      await access(dirname(status.storage.location), constants.W_OK);
    }
    checks.push({
      name: 'data-directory',
      ok: true,
      message: 'Storage directory is writable',
    });
    const tools = await router.discoverTools();
    checks.push({
      name: 'mcp-tools',
      ok: tools.length === 30,
      message: `Discovered ${tools.length} tools${tools.length === 30 ? '' : '; expected 30'}`,
    });
  } catch (error) {
    checks.push({
      name: 'startup',
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await router?.close().catch(() => undefined);
  }

  const ok = checks.every((check) => check.ok);
  if (options.json) {
    io.out(JSON.stringify({ ok, checks, ...(status ? { status } : {}) }));
  } else {
    io.out(`Context Router doctor: ${ok ? 'healthy' : 'failed'}`);
    for (const check of checks) {
      io.out(`${check.ok ? '✓' : '✗'} ${check.name}: ${check.message}`);
    }
  }
  return ok ? 0 : 1;
}

async function runStatus(
  options: ParsedArguments,
  io: CliIo,
  createRouter: RouterFactory,
): Promise<number> {
  let router: DiagnosticRouter | undefined;
  try {
    router = await createRouter({ dataDir: options.dataDir });
    const status = await router.status();
    if (options.json) {
      io.out(JSON.stringify(status));
    } else {
      io.out(`Context Router ${status.version}`);
      io.out(
        `Storage: ${status.storage.engine}${status.storage.location ? ` (${status.storage.location})` : ''}`,
      );
      io.out(
        `Workspaces: ${status.totals.workspaces}  Workflows: ${status.totals.workflows}  Running: ${status.totals.runningWorkflows}  Checkpoints: ${status.totals.checkpoints}`,
      );
      if (status.recentWorkflows.length > 0) {
        io.out('Recent workflows:');
        for (const workflow of status.recentWorkflows) {
          io.out(`- ${workflow.id} ${workflow.status} ${workflow.createdAt}`);
        }
      }
    }
    return 0;
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await router?.close().catch(() => undefined);
  }
}

function parseArguments(args: string[]): ParsedArguments {
  const command = args[0];
  if (command !== 'doctor' && command !== 'status') {
    throw new Error('Expected command "doctor" or "status"');
  }
  let json = false;
  let dataDir: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument === '--data-dir') {
      dataDir = args[index + 1];
      if (!dataDir) throw new Error('--data-dir requires a path');
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  return { command, json, dataDir };
}

function usage(): string {
  return 'Usage: context-router <doctor|status> [--json] [--data-dir <path>]';
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
