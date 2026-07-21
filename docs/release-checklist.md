# Release Checklist

Full step-by-step instructions: **[release-npm-and-pypi.md](./release-npm-and-pypi.md)**

## One-time owner setup

### GitHub

- [ ] Repo `mindlever-strategy/context-router` is public
- [ ] Protect `main` — require **CI** status check
- [ ] Create GitHub environment **`npm`** (trusted publishing or `NPM_TOKEN`)
- [ ] Create GitHub environment **`pypi`** (PyPI trusted publisher)
- [ ] (Optional) Add org secret `GITLEAKS_LICENSE` for secret-scan workflow

### npm (@context-router)

- [ ] Create npm organization **@context-router**
- [ ] Configure trusted publishing for `release.yml` / `publish-npm-manual.yml`, **or** add `NPM_TOKEN` to `npm` environment
- [ ] Verify: `npm whoami` and org membership

### PyPI (ctxrouter)

- [ ] Create PyPI account
- [ ] Confirm package name `ctxrouter` is available on PyPI
- [ ] Add trusted publisher: PyPI project name `ctxrouter`, owner `mindlever-strategy`, repo `context-router`, workflow `release-python.yml`, environment `pypi`

## First release (current versions on main)

### npm v0.3.1 (if not already on registry)

- [ ] Run **Actions → Publish npm (manual)** on `main`, **or** local `npm publish` (see full guide)
- [ ] Tag `v0.3.1` and draft GitHub Release from CHANGELOG

### Python v0.4.0

- [ ] Run `node scripts/release-python-check.mjs` locally (optional)
- [ ] Run **Actions → Release Python SDK** on `main`
- [ ] Verify https://pypi.org/project/ctxrouter/
- [ ] (Optional) Tag `python-v0.4.0`

## Every npm release (Changesets)

- [ ] `npm run changeset` when changing publishable packages
- [ ] Merge PR → merge **Version Packages** bot PR
- [ ] Confirm **Release** workflow publishes both `@context-router/mcp-server` and `@context-router/sdk`

## Every Python release

- [ ] Bump `version` in `packages/sdk-python/pyproject.toml`
- [ ] Update CHANGELOG
- [ ] Merge to `main`
- [ ] Run **Release Python SDK** workflow or push tag `python-vX.Y.Z`

## Pre-publish gates

- [ ] `npm test` and `npm run build` pass
- [ ] `npm run pack:check` looks correct
- [ ] `pytest packages/sdk-python` passes
- [ ] `npm audit --omit=dev` acceptable for your policy
