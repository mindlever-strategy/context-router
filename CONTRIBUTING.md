# Contributing

Thank you for helping improve Context Router.

## Development setup

1. Install Node.js 20+, npm, and Git. Docker is only needed for PostgreSQL integration tests.
2. Run `npm ci`, `npm run db:generate`, `npm run build`, and `npm test`.
3. Run `npm run test:local` for the zero-configuration SQLite path.
4. For PostgreSQL integration work, copy `.env.example` to `.env`, start
   PostgreSQL with Docker, apply `npm run db:migrate`, and run
   `npm run test:integration`.

Use a focused branch from `main`. Add tests for behavior changes and update the
API documentation when a tool contract changes. Pull requests must pass CI and
must not include secrets, generated `dist` files, or unrelated changes.

Public contracts use camelCase identifiers and the standard result envelope
documented in `docs/api.md`. Breaking changes require a Changeset.

By contributing, you agree that your contribution is licensed under Apache-2.0
and that you will follow the Code of Conduct.
