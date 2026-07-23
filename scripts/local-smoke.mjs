import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextRouter } from '../packages/sdk-typescript/dist/index.js';

const dataDirectory = await mkdtemp(join(tmpdir(), 'context-router-local-'));

try {
  const first = await ContextRouter.local({
    dataDir: dataDirectory,
    ownerId: 'local-smoke',
  });
  const flow = await first.start('Local smoke');
  await flow.set('result', { persisted: true });
  const handoff = await flow.handoff({ keys: ['result'] });
  if (!handoff.summary.includes('Persisted')) {
    throw new Error(`Unexpected handoff: ${handoff.summary}`);
  }
  await flow.complete();
  await first.close();

  const second = await ContextRouter.local({
    dataDir: dataDirectory,
    ownerId: 'local-smoke',
  });
  const status = await second.status();
  await second.close();
  if (
    status.totals.workspaces !== 1 ||
    status.totals.workflows !== 1 ||
    status.totals.runningWorkflows !== 0
  ) {
    throw new Error(
      `Persistence check failed: ${JSON.stringify(status.totals)}`,
    );
  }

  const doctor = spawnSync(
    process.execPath,
    [
      'packages/sdk-typescript/dist/cli.js',
      'doctor',
      '--json',
      '--data-dir',
      dataDirectory,
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  if (doctor.status !== 0) {
    throw new Error(`Doctor failed: ${doctor.stderr || doctor.stdout}`);
  }
  const diagnosis = JSON.parse(doctor.stdout.trim());
  if (!diagnosis.ok) throw new Error('Doctor reported an unhealthy runtime');
  console.log('LOCAL_SMOKE_OK persisted=true tools=30');
} finally {
  await rm(dataDirectory, { recursive: true, force: true });
}
