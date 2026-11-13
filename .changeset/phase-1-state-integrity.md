---
'@context-router/mcp-server': patch
---

Fix correctness defects in the state layer. Each was reproduced against a real
database before being fixed, and each is covered by a regression test.

**Owner isolation.** `state_snapshot`, `state_read` with `keys`, and all three
`handoff_*` tools read state without verifying workspace ownership.
`readStateFields` was missing the guard that `readState` already had, so a
caller could read another owner's state by supplying its workspace and workflow
ids. Single-key reads were never affected.

**Atomic batches now roll back.** `state_write_batch` with `atomic: true`
committed partial results, because the error handler ran _inside_ the
transaction callback and so never let the transaction reject.

**`onConflict` is honoured.** The option was accepted and documented but never
read, so `skip` and `fail` both silently upserted. The set of existing keys is
now also updated as the batch writes, so a key repeated within a single batch is
treated as existing by later entries rather than clobbering the earlier write.

**Batch writes validate `schemaName`.** It was previously passed through as a
provenance label, so a value that violated its named schema was stored anyway —
and stored wrapped in a provenance envelope rather than as the value given.

**Compare-and-set is atomic.** `expectedVersion` was checked in a separate
statement from the write, so two concurrent writers could both pass the check
and both commit. The check now rides in the same statement as the update, which
also removes a window where a CAS that had committed could report
`STATE_NOT_FOUND`, or return a version the call did not produce.

**Caveat:** `state_write_ttl` has its own write path that still performs the old
read-then-write version check. Use `state_write` if you depend on compare-and-set
being atomic. The two paths are merged in the next release.

Also: batch results now carry a `skipped` flag and a batch-level `error` for
failures that occur at commit time; `STATE_KEY_EXISTS`, `ROLLED_BACK` and
`NOT_ATTEMPTED` are registered as documented error codes.
