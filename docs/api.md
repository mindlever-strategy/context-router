# MCP Tool API

All IDs are UUID strings. All tools return one JSON text content block.

## Router

| Tool            | Required input | Behavior                                                                                  |
| --------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `router_status` | none           | Returns version, safe storage information, owner-scoped totals, and ten recent workflows. |

```json
{ "success": true, "data": {} }
```

```json
{
  "success": false,
  "error": { "code": "WORKFLOW_NOT_FOUND", "message": "..." }
}
```

## Workspace

| Tool               | Required input | Behavior                                          |
| ------------------ | -------------- | ------------------------------------------------- |
| `workspace_create` | `name`         | Creates a workspace for the local owner.          |
| `workspace_ensure` | `name`         | Gets or creates one workspace by normalized name. |
| `workspace_list`   | none           | Lists the local owner's workspaces.               |
| `workspace_get`    | `workspaceId`  | Gets an owned workspace.                          |
| `workspace_delete` | `workspaceId`  | Cascades deletion of all workspace data.          |

## Schema

| Tool              | Required input                                            | Optional input | Behavior                                              |
| ----------------- | -------------------------------------------------------- | -------------- | ----------------------------------------------------- |
| `schema_create`   | `workspaceId`, `name`, `fields`                          | `rules`        | Creates the next schema version with optional rules. |
| `schema_get`      | `workspaceId`, `name`                                    | —              | Gets the latest version.                              |
| `schema_list`     | `workspaceId`                                           | —              | Lists all versions.                                   |
| `schema_validate` | `workspaceId`, `schemaName`, `data`                     | —              | Returns validity and field errors.                    |
| `schema_diff`     | `workspaceId`, `schemaName`, `versionA`, `versionB`     | —              | Compares two schema versions.                         |
| `schema_migrate`  | `workspaceId`, `schemaName`, `fromVersion`, `toVersion`, `transforms` | `dryRun`, `batchSize` | Migrates state data between versions. Set `dryRun: true` to preview without applying. |

Field types are `string`, `integer`, `number`, `boolean`, `enum`, `object`, and
`array`. Definitions may use `required`, enum `values`, nested `fields`, and
array `itemType`.

## Workflow

| Tool                | Required input                        | Behavior                              |
| ------------------- | ------------------------------------- | ------------------------------------- |
| `workflow_create`   | `workspaceId`                         | Creates a `RUNNING` workflow.         |
| `workflow_status`   | `workspaceId`, `workflowId`           | Gets workflow status.                 |
| `workflow_complete` | `workspaceId`, `workflowId`           | Transitions `RUNNING` to `COMPLETED`. |
| `workflow_fail`     | `workspaceId`, `workflowId`, `reason` | Transitions `RUNNING` to `FAILED`.    |

Terminal workflows cannot transition again or mutate state.

## State

| Tool                | Required input                                                                 | Optional input                                                                                                                                     | Behavior                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state_write`       | `workspaceId`, `workflowId`, and exactly one of `key`+`value` or `entries`    | `schemaName`, `expectedVersion`, `expiresIn`, `expiresAt`, `agentRole`, `provenance`, `provenanceMode`, `atomic`, `onConflict`                        | Single or batch write. Batch mode (`entries` array) commits with `atomic: true` for all-or-nothing semantics. `onConflict` controls existing-key behaviour (`upsert`, `skip`, `fail`). `expiresIn`/`expiresAt` set TTL. Omitting `schemaName` returns `warning: UNVALIDATED_STATE`. |
| `state_read`        | `workspaceId`, `workflowId`, exactly one of `key` or `keys`                     | `agentRole`, `unwrap`                                                                                                                               | Expired keys are never returned. Multi-key reads return a `missing` array for keys not found.                                                                                                                                               |
| `state_delete`      | `workspaceId`, `workflowId`, `key`                                             | —                                                                                                                                                  | Deletes state from a running workflow                                                                                                                                                                                                       |
| `state_snapshot`    | `workspaceId`, `workflowId`                                                    | `agentRole`, `unwrap`                                                                                                                               | Returns all live state keys and values                                                                                                                                                                                                     |
| `state_delete_expired` | —                                                                          | `batchSize`                                                                                                                                        | Forces an expiry sweep. The background cleanup service runs this automatically.                                                                                                                                                           |

## State Diff

| Tool         | Required input | Optional input                                                                                             | Behavior                                                                                              |
| ------------ | -------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `state_diff` | `workspaceId`  | `mode`, `workflowId`, `sourceCheckpointId`, `targetCheckpointId`, `checkpointId`, `checkpointsBack`, `options` | Compare state between checkpoints or current state. `mode`: `checkpoints` (compare two checkpoints), `current-vs-checkpoint` (live vs checkpoint), `recent` (newest vs N back). |

## Step execution

| Tool                | Required input                                                 | Optional input | Behavior                                                           |
| ------------------- | -------------------------------------------------------------- | -------------- | ------------------------------------------------------------------ |
| `step_run_start`    | `workspaceId`, `workflowId`, `stepId`, `executionId`           | `agentId`      | Starts or retries a step, auto-checkpoints, returns cached success |
| `step_run_complete` | `workspaceId`, `workflowId`, `stepId`, `executionId`           | `result`       | Marks a step execution as succeeded                                |
| `step_run_fail`     | `workspaceId`, `workflowId`, `stepId`, `executionId`, `reason` | —              | Marks a step execution as failed                                   |

## Agent roles

| Tool                | Required input                                               | Behavior                                   |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `agent_role_create` | `workspaceId`, `name`, `allowedWriteKeys`, `allowedReadKeys` | Defines read/write key patterns for a role |
| `agent_role_list`   | `workspaceId`                                                | Lists roles in a workspace                 |

Key patterns support exact keys, prefix wildcards (`lead*`), and `*`.

## Checkpoint

| Tool                 | Required input                | Optional input | Behavior                                     |
| -------------------- | ----------------------------- | -------------- | -------------------------------------------- |
| `checkpoint_create`  | `workspaceId`, `workflowId`   | `label`        | Captures full state from a running workflow. |
| `checkpoint_list`    | `workspaceId`, `workflowId`   | —              | Lists newest checkpoints first.              |
| `checkpoint_restore` | `workspaceId`, `checkpointId` | —              | Atomically restores its running workflow.    |
| `checkpoint_delete`  | `workspaceId`, `checkpointId` | —              | Deletes a checkpoint.                        |

## Handoff

| Tool               | Required input              | Optional input                                                                    | Behavior                                            |
| ------------------ | --------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| `handoff_generate` | `workspaceId`, `workflowId` | `keys`, `maxTokens`, `agentRole`, `priorityKeys`, `nextGoals`, `format`           | Summarizes selected keys with role-aware projection |
| `handoff_generate_ai` | `workspaceId`, `workflowId` | `keys`, `priorityKeys`, `style`, `model`, `includeReasoning`, `includeOpenQuestions`, `maxTokens`, `context` | Summarizes selected keys with an LLM (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`), with optional reasoning and open questions. Falls back to the rule-based summary if the model call fails. |
| `handoff_apply`    | `workspaceId`, `workflowId` | `keys`, `prefix`, `maxTokens`, `agentRole`, `priorityKeys`, `nextGoals`, `format` | Returns prefix plus generated summary               |

`maxTokens` accepts 50–1000 and defaults to 200. It is enforced using a
deterministic four-characters-per-token approximation.

## Journal

| Tool             | Required input | Optional input                                                           | Behavior                                                                                             |
| ---------------- | -------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `journal_query`  | `workspaceId`  | `workflowId`, `eventTypes`, `since`, `until`, `limit`, `cursor`, `order`, `view`, `untilSequence`, `exportFormat` | Query journal events with filters. `view`: `entries` (raw rows), `replay` (rebuilt state), `stats` (counts by type), `export` (serialized), `sequence` (current number). |
| `journal_append` | `workspaceId`, `workflowId`, `eventType`, `payload` | `metadata` | Append a custom event to the journal.                                                              |

## Debugger

| Tool              | Required input              | Behavior                            |
| ----------------- | --------------------------- | ---------------------------------- |
| `debugger_inspect` | `workspaceId`, `workflowId` | Inspect workflow state and history |

## Stable error codes

`VALIDATION_ERROR`, `SCHEMA_VALIDATION_FAILED`, `VERSION_CONFLICT`,
`WRITE_FORBIDDEN`, `READ_FORBIDDEN`, `AGENT_ROLE_NOT_FOUND`,
`STEP_EXECUTION_NOT_FOUND`, `WORKSPACE_NOT_FOUND`, `WORKSPACE_NAME_AMBIGUOUS`,
`WORKFLOW_NOT_FOUND`, `WORKFLOW_NOT_RUNNING`, `STATE_NOT_FOUND`,
`SCHEMA_NOT_FOUND`, `CHECKPOINT_NOT_FOUND`, `TOOL_NOT_FOUND`, and
`INTERNAL_ERROR`.
