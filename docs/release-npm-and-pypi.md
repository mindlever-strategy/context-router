# Release Guide: npm + PyPI

This repo publishes **two npm packages** and **one Python package** with
independent version numbers:

| Package | Registry | Current version | Path |
|---------|----------|-----------------|------|
| `@context-router/mcp-server` | npm | see `packages/server/package.json` | `packages/server` |
| `@context-router/sdk` | npm | see `packages/sdk-typescript/package.json` | `packages/sdk-typescript` |
| `ctxrouter` | PyPI | see `packages/sdk-python/pyproject.toml` | `packages/sdk-python` |

---

## One-time setup (do this once)

### 1. GitHub repository

1. Confirm the repo is public: `https://github.com/mindlever-strategy/context-router`
2. Go to **Settings → Branches** and protect `main`:
   - Require PR before merging (recommended)
   - Require status checks: **CI**, **CodeQL** (optional: **Secret scan**)
3. Go to **Settings → Environments** and create two environments:

#### Environment: `npm`

Used by `.github/workflows/release.yml` and `publish-npm-manual.yml`.

**Option A — npm Trusted Publishing (recommended, no long-lived token)**

1. Create the npm org (see npm section below).
2. On npm: **Account → Access Tokens → Granular Access Token** is **not** needed for OIDC.
3. On npm org settings: enable **Trusted Publishers** for each package:
   - Publisher: GitHub Actions
   - Organization: `mindlever-strategy`
   - Repository: `context-router`
   - Workflow: `release.yml` (and `publish-npm-manual.yml` if you use manual retry)
   - Environment: `npm` (if npm UI supports environment filter; otherwise repo-only is fine)
4. In GitHub `npm` environment: no secret required when using OIDC + provenance
   (`publishConfig.provenance: true` is already set in both package.json files).

**Option B — NPM_TOKEN fallback**

1. On npm: create an **Automation** token with publish access to `@context-router/*`.
2. In GitHub **Settings → Environments → npm → Environment secrets**:
   - Add `NPM_TOKEN` = your npm automation token.

#### Environment: `pypi`

Used by `.github/workflows/release-python.yml`.

1. Create a PyPI account: https://pypi.org/account/register/
2. Check name availability: https://pypi.org/project/ctxrouter/
   - If taken, rename in `packages/sdk-python/pyproject.toml` before first publish.
3. On PyPI: **Account settings → Publishing → Add a new pending publisher** (Trusted Publisher):
   - PyPI project name: `ctxrouter`
   - Owner: `mindlever-strategy`
   - Repository: `context-router`
   - Workflow name: `release-python.yml`
   - Environment name: `pypi`
4. In GitHub: create environment **`pypi`** (no secret needed for trusted publishing).

#### Secret scan (optional fix)

The **Secret scan** workflow fails if your org has no Gitleaks license.

- Add org secret `GITLEAKS_LICENSE`, **or**
- Disable/remove `.github/workflows/secret-scan.yml` if you do not use Gitleaks.

---

### 2. npm organization

The Release workflow failed with **404** because the `@context-router` scope does not exist yet.

1. Log in at https://www.npmjs.com/
2. Create organization: **@context-router**
   - Free plan is fine for public packages.
3. Add your GitHub user (and any teammates) as owners.
4. Ensure both packages can be published under the scope (first publish creates them).

Verify locally (after setup):

```bash
npm whoami
npm org ls context-router
```

---

### 3. PyPI project (first publish)

Trusted publishing creates the PyPI project on **first successful upload** if the
pending publisher is configured. You do **not** need a separate “create project” step.

For the very first upload without CI, you can use an API token manually (see Manual PyPI below).

---

## npm release workflow (Changesets — normal path)

Day-to-day releases use [Changesets](https://github.com/changesets/changesets).

### Step 1 — Add a changeset when you change publishable code

From repo root:

```bash
npm run changeset
```

- Select `@context-router/mcp-server` and/or `@context-router/sdk`.
- Choose patch / minor / major and write a short summary.

Commit the new file under `.changeset/*.md`.

### Step 2 — Merge to `main`

When changesets exist on `main`, the **Release** workflow (`.github/workflows/release.yml`):

1. Runs tests and build
2. Opens or updates a **Version Packages** PR (bumps versions + CHANGELOG)
3. After that PR merges, on the next `main` push it publishes to npm and creates a GitHub release

### Step 3 — Review the Version Packages PR

Check:

- Version numbers in `packages/server/package.json` and `packages/sdk-typescript/package.json`
- Root `CHANGELOG.md` section for the new version
- No accidental major bumps

Merge the PR.

### Step 4 — Confirm publish

After merge, watch **Actions → Release**.

Success means:

- `@context-router/mcp-server@x.y.z` on https://www.npmjs.com/package/@context-router/mcp-server
- `@context-router/sdk@x.y.z` on https://www.npmjs.com/package/@context-router/sdk
- GitHub Release with tag `vX.Y.Z` (created by changesets action)

Install smoke test:

```bash
mkdir /tmp/cr-test && cd /tmp/cr-test
npm init -y
npm install @context-router/mcp-server @context-router/sdk
node -e "import('@context-router/sdk').then(m => console.log('sdk ok', Object.keys(m)))"
```

---

## npm manual publish (retry / first-time without Changesets PR)

Use this when `@context-router` org was missing and **v0.3.1** never reached npm.

### Option A — GitHub Actions (recommended)

1. Complete **one-time npm setup** above (`npm` environment + org + token or trusted publishing).
2. Go to **Actions → Publish npm (manual) → Run workflow** on `main`.
3. Workflow runs tests, build, then:

   ```bash
   npm publish --workspace=@context-router/mcp-server --access public
   npm publish --workspace=@context-router/sdk --access public
   ```

4. Create GitHub release manually if needed:

   ```bash
   git tag v0.3.1
   git push origin v0.3.1
   ```

   Then **Releases → Draft new release** from tag `v0.3.1`, paste CHANGELOG section.

### Option B — Local machine

```bash
cd context-router
npm ci
npm run db:generate
npm test
npm run build
npm pack --dry-run --workspace=@context-router/mcp-server
npm pack --dry-run --workspace=@context-router/sdk

npm login   # or export NPM_TOKEN
npm publish --workspace=@context-router/mcp-server --access public
npm publish --workspace=@context-router/sdk --access public
```

**Important:** Do not bump versions again if `0.3.1` is already on `main` — just publish that version.

---

## Python (PyPI) release workflow

Python SDK version lives in `packages/sdk-python/pyproject.toml` (currently **0.4.0**,
intentionally ahead of npm server semver).

### Pre-flight check (local or CI)

```bash
cd context-router
node scripts/release-python-check.mjs
```

This builds the wheel/sdist and runs pytest.

### Option A — GitHub Actions (recommended)

1. Complete **pypi** environment + PyPI trusted publisher setup.
2. Ensure `packages/sdk-python/pyproject.toml` has the version you want to ship.
3. Commit and push to `main` if you changed the version.
4. Go to **Actions → Release Python SDK → Run workflow**:
   - Branch: `main`
   - Optional: set **version** to double-check (must match `pyproject.toml`).
5. On success, verify: https://pypi.org/project/ctxrouter/

Optional git tag (for traceability):

```bash
git tag python-v0.4.0
git push origin python-v0.4.0
```

Pushing tags matching `python-v*` also triggers the workflow automatically.

### Option B — Manual upload from your machine

```bash
cd context-router/packages/sdk-python
python -m pip install --upgrade build twine
python -m build
twine check dist/*
# First time only: create API token on PyPI → paste when prompted
twine upload dist/*
```

---

## Full first-time release checklist (v0.3.1 npm + v0.4.0 Python)

Use this order:

| # | Task | Owner |
|---|------|--------|
| 1 | Create npm org `@context-router` | You |
| 2 | Configure GitHub environment `npm` (trusted publishing or `NPM_TOKEN`) | You |
| 3 | Run **Publish npm (manual)** workflow OR local `npm publish` for 0.3.1 | You |
| 4 | Tag `v0.3.1` and create GitHub Release with CHANGELOG | You |
| 5 | Register PyPI trusted publisher for `ctxrouter` | You |
| 6 | Create GitHub environment `pypi` | You |
| 7 | Run **Release Python SDK** workflow for 0.4.0 | You |
| 8 | Tag `python-v0.4.0` (optional) | You |
| 9 | Update README install snippets if needed | Optional |
| 10 | Fix `GITLEAKS_LICENSE` or disable secret-scan | Optional |

---

## Future releases (steady state)

### npm (server + TypeScript SDK)

1. Implement feature/fix
2. `npm run changeset` → commit → PR → merge
3. Merge **Version Packages** PR when bot opens it
4. Release workflow publishes automatically

Keep npm server and TS SDK versions aligned via Changesets (they are linked in `.changeset/config.json`).

### Python SDK

1. Bump `version` in `packages/sdk-python/pyproject.toml`
2. Add entry to root `CHANGELOG.md` under Python SDK (or maintain `packages/sdk-python/CHANGELOG.md`)
3. PR → merge → **Release Python SDK** workflow (manual dispatch or `python-v*` tag)

Python does **not** use Changesets today; version is manual in `pyproject.toml`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| npm **404** on publish | `@context-router` org missing | Create org; retry manual publish workflow |
| npm **403** | Token lacks publish rights | Regenerate automation token; check org membership |
| npm **EOTP** | Token requires 2FA in browser | Use **Classic → Automation** token, not Granular Publish |
| npm publish skipped | No pending changesets / already published | Use manual publish workflow for retry |
| PyPI **403** | Trusted publisher mismatch | Match owner/repo/workflow/environment exactly on PyPI |
| PyPI **400** file already exists | Version already on PyPI | Bump version in pyproject.toml |
| Release workflow green but no npm packages | Version Packages PR not merged yet | Merge changesets version PR first |

---

## Files reference

| File | Purpose |
|------|---------|
| `.github/workflows/release.yml` | Changesets npm publish on `main` |
| `.github/workflows/publish-npm-manual.yml` | Manual npm retry / first publish |
| `.github/workflows/release-python.yml` | PyPI publish via trusted publishing |
| `scripts/release-python-check.mjs` | Local Python build + test gate |
| `.changeset/config.json` | Changesets monorepo config |
| `docs/release-checklist.md` | Short owner checklist |
