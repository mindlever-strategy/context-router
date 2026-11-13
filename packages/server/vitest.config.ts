import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Several suites import the generated Prisma client, which is large enough
    // that a cold import exceeds Vitest's 5s default when the runner is under
    // parallel load. That made tool-surface and state tests fail intermittently
    // with "Test timed out in 5000ms" while passing on a quiet machine.
    testTimeout: 30_000,
    // Database-backed suites run SQLite migrations in beforeAll, which is
    // slower still than the client import alone.
    hookTimeout: 60_000,
  },
});
