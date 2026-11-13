---
'@context-router/mcp-server': minor
---

Remove structural duplication in the state and journal layers.

**TTL is no longer a separate write path.** `writeStateWithTTL` and
`readStateWithTTL` were forks of the core read/write functions that skipped
agent-role ACLs, skipped journaling, and carried their own copy of the
compare-and-set logic — including the race fixed in the previous release.
`state_write` and `state_read` now accept `expiresIn`/`expiresAt` directly, and
`state_write_ttl` routes through them, so TTL writes are journaled for the first
time.

**Expired keys are hidden from every read path.** `state_snapshot`,
`state_read`, `state_read_batch` and checkpoint creation previously returned
keys whose TTL had passed; only `state_read_ttl` filtered them. A write with no
explicit TTL now clears any existing TTL, and both the single and batch write
paths agree on that.

**Checkpoints preserve version and expiry.** `checkpoint_restore` rebuilt rows
with `createMany`, resetting every `version` to 1 and discarding `expiresAt` —
silently rewriting the version history that compare-and-set depends on.

_Wire format change:_ `checkpoint_create`, `checkpoint_list` and
`step_run_start` return a `Checkpoint` whose `snapshot` is now
`{ __format: 2, entries: { key: { value, version, expiresAt } } }` rather than a
bare `key -> value` map. Snapshots written by earlier versions are still
restored and diffed correctly. Read them via the helpers in
`services/checkpoint-format.ts` rather than indexing the raw object.

**Known limitation:** restore still rewinds `version`, so a caller holding a
version from before a restore can pass compare-and-set against a value it never
observed once writes return the key to that number. Closing this needs
monotonic versions or a per-key epoch; it is recorded in the code as a
deliberate deferral.

**The journal no longer discards failures.** Every hook swallowed errors with
`.catch(() => {})`, so an audit log that silently lost entries still reported
success. Failures are now counted and surfaced through `router_status`.

**Journal sequence numbers no longer collide.** Appends are fire-and-forget, and
reading `max(sequence)` then inserting are two statements, so concurrent appends
to one workflow could share a sequence and break ordered replay. Appends are now
serialized per workflow within the process. This does not cover two server
processes sharing one PostgreSQL database; the durable fix needs a unique
constraint and retry, which requires a migration.
