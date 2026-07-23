# Publishing Context Router

This document covers publishing the various packages to their respective package managers.

## Python SDK → PyPI

### Prerequisites

1. Create a PyPI account at https://pypi.org
2. Generate an API token at https://pypi.org/manage/account/#api-tokens
3. Create a TestPyPI account at https://test.pypi.org (optional, for testing)

### Setup

1. Create `~/.pypirc`:
```ini
[pypi]
username = __token__
password = pypi-XXXXXXXXXXXXXXXXXXXX

[testpypi]
repository = https://test.pypi.org/legacy/
username = __token__
password = tpypi-XXXXXXXXXXXXXXXXXXXX
```

2. Or use environment variables:
```bash
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-XXXXXXXXXXXXXXXXXXXX
```

### Publish

```bash
cd packages/sdk-python

# Build
pip install build
python -m build

# Test on TestPyPI first
twine upload --repository testpypi dist/*

# Install from TestPyPI to verify
pip install --index-url https://test.pypi.org/simple/ ctxrouter

# Publish to PyPI
twine upload dist/*
```

### GitHub Actions (Recommended)

1. Add secrets to your GitHub repository:
   - `PYPI_API_TOKEN` - Your PyPI API token
   - `TEST_PYPI_API_TOKEN` - Your TestPyPI API token

2. The workflow `.github/workflows/publish-python.yml` will:
   - Build the package on Ubuntu with Python 3.12
   - Run tests (if included)
   - Publish to PyPI on release

3. To trigger:
   - Create a GitHub release, OR
   - Run the workflow manually from the Actions tab

## npm Packages

### Packages to Publish

| Package | Location | Command |
|---------|----------|---------|
| `@context-router/mcp-server` | `packages/server/` | `npm publish` |
| `@context-router/sdk` | `packages/sdk-typescript/` | `npm publish` |
| `@context-router/langgraph-adapter` | `packages/langgraph-adapter/` | `npm publish` |
| `@context-router/crewai-adapter` | `packages/crewai-adapter/` | `npm publish` |

Publish order (also used by `.github/workflows/publish-npm-manual.yml`): `mcp-server` → `sdk` → adapters.

### Prerequisites

1. npm account at https://www.npmjs.com
2. Organization: `mindlever-strategy` (or personal scope)
3. 2FA enabled for publishing

### Setup

```bash
# Login to npm
npm login

# Verify access
npm whoami
```

### Publish

```bash
cd packages/sdk-typescript
npm version patch  # or minor, major
npm publish

cd ../server
npm version patch
npm publish
```

### GitHub Actions

The repository includes `.github/workflows/release.yml` (if present) for automated npm publishing on release.

## Version Management

### Semantic Versioning

- **patch** (0.3.0 → 0.3.1): Bug fixes, small improvements
- **minor** (0.3.0 → 0.4.0): New features, backward compatible
- **major** (0.3.0 → 1.0.0): Breaking changes

### Release Checklist

- [ ] Run full test suite: `npm test`
- [ ] Update CHANGELOG.md
- [ ] Update version in package.json
- [ ] Build all packages: `npm run build`
- [ ] Test examples: `node scripts/run-example.mjs simple-pipeline`
- [ ] Create git tag: `git tag v0.3.1 && git push --tags`
- [ ] Create GitHub release
- [ ] Publish packages
- [ ] Verify installations

## Package Registry URLs

- PyPI: https://pypi.org/project/ctxrouter
- npm: https://www.npmjs.com/package/@context-router/mcp-server
