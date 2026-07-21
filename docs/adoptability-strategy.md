# Adoptability Strategy — Making Context Router Accessible

**Status:** v0.3 golden path implemented; broader-reach work remains  
**Last Updated:** 2026-07-21

---

## Executive Summary

Context Router solves a real problem in multi-agent workflows — state management, selective context sharing, and durable checkpoints. The v0.3 local path removes the former PostgreSQL, Docker, migration, and Node.js 24 setup requirements while retaining PostgreSQL as an explicit production option.

**Goal:** Reduce time-to-first-success from ~30 minutes to under 5 minutes for TypeScript developers already building multi-agent or multi-step AI workflows.

---

## The Adoptability Gap

### Previous Onboarding Flow (v0.2)

```
1. Check Node version (must be 24+)          ~2 min
2. Install Docker (if not installed)          ~10 min
3. Install PostgreSQL 16 via Docker           ~5 min
4. Clone repository                          ~1 min
5. npm install + build                       ~3 min
6. Configure .env file                       ~2 min
7. Run database migrations                   ~1 min
8. Read 22-tool documentation                ~10 min
9. Write first workflow (mentally)           ~5 min
```

**Total:** ~30-40 minutes before seeing a single value.

### Target Onboarding Flow

```
1. npm install @context-router/sdk             ~30 sec
2. Use the local workflow API                ~2 min
3. See it work                              ~10 sec
```

**Target:** Under 5 minutes.

---

## Barrier Analysis & Solutions

### 1. PostgreSQL Requirement 🔴 HIGH PRIORITY

**Problem:** Requiring PostgreSQL 16 + Docker is a dealbreaker for:

- Developers on restricted corporate machines
- Quick experimentation / prototyping
- Windows users unfamiliar with Docker
- Anyone who just wants to "try it out"

**Solution: SQLite as Default, Postgres as Optional**

```typescript
// Current: Requires DATABASE_URL to be PostgreSQL
DATABASE_URL=postgresql://...

// Proposed: Works out of the box
// SQLite auto-created on first run

// Optional: Opt into PostgreSQL for production
DATABASE_URL=postgresql://...
STORAGE_ENGINE=postgresql
```

**Action Items:**

- [x] Implement separate SQLite and PostgreSQL storage adapters
- [x] Auto-detect storage from `DATABASE_URL`, defaulting to OS app-data SQLite
- [x] Package and apply transactional SQLite migrations automatically
- [x] Add `STORAGE_ENGINE` validation for explicit override
- [x] Update README to show the SQLite-first local API

---

### 2. Node.js 24+ Requirement 🟡 MEDIUM PRIORITY

**Problem:** Node.js 24 is bleeding edge. Most developers are on Node 20 LTS or 22.

**Solution: Support Node.js 20+ LTS**

| Version     | Support Status   |
| ----------- | ---------------- |
| Node 20 LTS | ✅ Make it work  |
| Node 22     | ✅ Make it work  |
| Node 24+    | ✅ Already works |

**Action Items:**

- [x] Update `engines` field in package.json from `>=24` to `>=20`
- [ ] Run test suite against Node 20, 22, 24 (CI matrix configured)
- [x] Update README badge from "Node.js 24+" to "Node.js 20+"

---

### 3. 29 MCP Tools — Too Many to Learn 🟡 MEDIUM PRIORITY

**Problem:** Users see the full 29-tool surface and feel overwhelmed. They don't know where to start.

**Solution: Curated Workflows, Not Raw Tools**

Create 3 "first-class" workflows that cover 80% of use cases:

#### Workflow 1: Simple Pipeline

```
Agent A → Agent B → Agent C
```

**Use when:** You have a linear sequence of agents.
**Tools used:** `workflow_create`, `state_write`, `handoff_generate`

```typescript
// The user's code — only 4 calls
const workflow = await router.workflow.create(workspace);
await router.state.write(workspace, workflow, 'step1', agentA());
const handoff = await router.handoff.generate(workspace, workflow, {
  keys: ['step1'],
});
await router.workflow.complete(workspace, workflow);
```

#### Workflow 2: Parallel + Merge

```
       → Agent B ─┐
Agent A ─┤        ├→ Agent D
       → Agent C ─┘
```

**Use when:** You fan out to multiple agents, then merge results.
**Tools used:** `state_write` (multiple), `state_read` (multiple), `checkpoint_create`

#### Workflow 3: Retry / Recovery

```
Agent A → Agent B → [FAIL] → restore checkpoint → Agent B
```

**Use when:** An agent fails and you need to resume from a known good state.
**Tools used:** `checkpoint_create`, `checkpoint_restore`

**Action Items:**

- [x] Create `docs/workflows/` directory with 3 workflow templates
- [x] Write runnable examples for each workflow pattern
- [x] Add "Start Here" section to README pointing to the right workflow
- [x] Document `WorkflowSession` as the recommended SDK entry point (no separate wrapper package)

---

### 4. Schema Definition is Friction 🟢 LOW PRIORITY

**Problem:** Before writing state, you must define a schema. This is correct architecture but adds cognitive overhead.

**Solution: Schemas are Optional for First Use**

```typescript
// Current: Schema required
await router.state.write(workspace, workflow, 'lead', data, 'LeadSchema');

// Proposed: Schema optional, validated if present
await router.state.write(workspace, workflow, 'lead', data);
// → Validates against schema if one exists
// → Accepts raw data if no schema defined
```

**Action Items:**

- [x] Make `schemaName` parameter optional in `state_write`
- [x] Add runtime warning when writing unvalidated state (`UNVALIDATED_STATE`)
- [x] Update docs to show "schema-free first, schema-later" pattern

---

### 5. No Visual Feedback 🟡 MEDIUM PRIORITY

**Problem:** State is just JSON. Users can't _see_ their workflow progressing.

**Solution: CLI Dashboard + Visual Playground**

#### CLI Dashboard

```bash
npx @context-router/cli status

Workspace: my-project
├── Workflow wf_123abc          [RUNNING]
│   ├── step1: { status: ✓, tokens: 234 }
│   ├── step2: { status: ✓, tokens: 567 }
│   └── step3: { status: ⟳, started: 2m ago }
└── Checkpoints: 2 saved
```

#### Web Playground (future)

- Visualize workflow state tree
- See handoff summaries before they happen
- One-click checkpoint restore

**Action Items:**

- [x] Ship doctor/status on the TypeScript SDK (`context-router` binary)
- [x] Add `router.status()` to SDK for workflow inspection
- [ ] Plan web playground (v0.4+)

---

## Python SDK Priority

**Current:** Experimental, unpublished  
**Target:** First-class, same-day release as TypeScript SDK

**Why it matters:**

- Python is the dominant language for AI/ML developers
- LangChain, LlamaIndex, CrewAI users are Python-first
- Largest potential audience

**Action Items:**

- [x] Complete Python SDK connection method (in-repo v0.4.0)
- [ ] Publish to PyPI as `context-router`
- [x] Match TypeScript SDK API surface (in-repo)
- [x] Add Python examples to docs

---

## Onboarding Funnel Optimization

### Where Users Drop Off

```
Awareness → Install → First Run → First Success → Regular Use
    ↓
[Where we lose people]
    ↓
- Don't understand why they need it (awareness)
- Can't get past setup (install)
- Don't see value quickly (first run)
```

### Activation Hypotheses

These are hypotheses to validate through clean-machine onboarding sessions, not
forecasted percentage improvements.

| Change              | Expected signal                 | Effort |
| ------------------- | ------------------------------- | ------ |
| SQLite default      | Higher install completion       | Medium |
| Workflow-scoped SDK | Faster first successful handoff | Medium |
| Doctor/status CLI   | Fewer unresolved setup failures | Low    |
| Python SDK          | More qualified Python adopters  | Medium |

---

## Proposed Roadmap

### Phase 1: Zero-to-Working in 5 Minutes (v0.3) ✅ COMPLETE

- [x] SQLite adapter as default
- [x] Node 20+ package support
- [x] Workflow-scoped TypeScript SDK
- [x] Optional schemas
- [x] Doctor and status CLI commands
- [x] Three runnable examples:
  - [x] `examples/simple-pipeline.ts` — Linear agent chain
  - [x] `examples/parallel-merge.ts` — Fan-out to multiple agents, merge results
  - [x] `examples/retry-recovery.ts` — Checkpoint-based retry with state restoration

**Success metric:** A clean-machine evaluator installs the SDK and produces a persisted handoff in under 5 minutes without Docker, environment configuration, or MCP setup. ✅ ACHIEVED

### Phase 2: Broad Reach (v0.4 candidate)

- [x] Python SDK implementation in monorepo (v0.4.0)
  - [x] `packages/sdk-python/` with client, session, types, exceptions
  - [x] `pyproject.toml` for PyPI packaging
  - [x] Integration tests against local MCP server
- [ ] Python SDK published to PyPI
- [ ] Web playground / visual debugger
- [ ] Import adapters (LangGraph, CrewAI)
- [ ] 1-click deploy templates (Railway, Vercel)

**Success metric:** 50% of new users come from Python ecosystem.

### Phase 3: Production Ready (later)

- [x] PostgreSQL adapter retained for production-oriented deployments
- [ ] Remote MCP transport
- [ ] Authentication / multi-tenancy
- [ ] Observability / metrics

**Success metric:** Teams using it in production, not just experiments.

---

## Success Metrics

### Activation Indicators

- Median and p90 time to first successful handoff (target: median <5 min)
- Clean-machine quickstart completion rate without assistance
- Setup failure rate by operating system and Node version
- Percentage of evaluators who create a second workflow within seven days
- Documentation detours or manual configuration required before first success

### Lagging Indicators

- Production use cases documented
- Integration examples (LangChain, CrewAI, etc.)
- Active Discord/Slack community

---

## Appendix: Current vs. Target Comparison

| Aspect               | Current                                    | Target                                      |
| -------------------- | ------------------------------------------ | ------------------------------------------- |
| Storage              | SQLite default, Postgres optional          | Same, validated through onboarding          |
| Node version         | 20+                                        | CI-verified on 20, 22, and 24               |
| Learning curve       | Workflow-scoped SDK plus 29 advanced tools | More first-class workflow examples          |
| Python support       | In-repo SDK (v0.4.0)                       | Published to PyPI                           |
| First-run experience | Zero-config local path implemented         | <5 min validated with users                 |
| Visual feedback      | Doctor and summary status                  | Full dashboard later                        |
| Schema requirement   | Optional                                   | Optional, recommended for durable contracts |
| Deployment           | Manual Docker                              | 1-click deploy                              |

---

## Open Questions

1. **SQLite limitations:** Document practical concurrency limits; never auto-migrate user data based on a threshold.

2. **Python SDK priority:** Port the proven TypeScript contract in the next broad-reach milestone.

3. **Web playground:** Build in-house or community/contributor driven?

4. **LangChain integration:** Should we build native LangChain tools or wait for community adapters?

---

_This document is a living strategy. Update as we learn from user feedback and usage patterns._
