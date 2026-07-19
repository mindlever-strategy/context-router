# Contributing

Thank you for helping improve Context Router.

## Development setup

1. Install Node.js 24+, npm, Docker, and Git.
2. Copy `.env.example` to `.env`.
3. Run `docker compose up -d`.
4. Run `npm ci`, `npm run db:generate`, and `npm run db:migrate`.
5. Run `npm run build && npm test && npm run test:integration`.

Use a focused branch from `main`. Add tests for behavior changes and update the
API documentation when a tool contract changes. Pull requests must pass CI and
must not include secrets, generated `dist` files, or unrelated changes.

Public contracts use camelCase identifiers and the standard result envelope
documented in `docs/api.md`. Breaking changes require a Changeset.

By contributing, you agree that your contribution is licensed under Apache-2.0
and that you will follow the Code of Conduct.
