# v0.1.0 Release Checklist

## Repository owner setup

- Confirm `mindlever-strategy/context-router` is public.
- Protect `main` and require the CI, CodeQL, and secret-scan checks.
- Enable private vulnerability reporting and Dependabot alerts.
- Create the `bug`, `enhancement`, `good first issue`, and `help wanted` labels.

## npm owner setup

- Create or claim the `@context-router` npm organization.
- Grant the release workflow permission to publish
  `@context-router/mcp-server` and `@context-router/sdk`.
- Configure the protected GitHub `npm` environment and npm trusted publishing
  or the `NPM_TOKEN` fallback used by the release workflow.

## Release gates

- Run CI against PostgreSQL 16 and confirm the integration job passes.
- Confirm `npm audit --omit=dev` reports zero vulnerabilities.
- Confirm `npm run pack:check` includes licenses, runtime code, generated Prisma
  client, and migrations but excludes tests, source secrets, and local artifacts.
- Install both tarballs in an empty temporary project and import their public
  entry points.
- Merge the Changesets release pull request.
- Create the signed `v0.1.0` tag and GitHub release only after every required
  check passes.
