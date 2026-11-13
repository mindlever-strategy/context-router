---
'@context-router/mcp-server': minor
---

**Breaking (MCP tool surface).** Consolidates 49 registered tools into 37 by
merging variants into option-driven tools. Every MCP client loads the full tool
list into its context window on each session, so a smaller surface directly
improves tool-selection accuracy.

Removed, with replacements:

| Removed                                                                 | Use instead                                |
| ----------------------------------------------------------------------- | ------------------------------------------ |
| `state_read_batch`, `state_read_ttl`                                    | `state_read` with `keys`                   |
| `state_write_batch`, `state_write_ttl`                                  | `state_write` with `entries` / `expiresIn` |
| `state_diff_current_vs_checkpoint`, `state_diff_recent_changes`         | `state_diff` with `mode`                   |
| `schema_migrate_preview`                                                | `schema_migrate` with `dryRun: true`       |
| `journal_replay`, `journal_stats`, `journal_export`, `journal_sequence` | `journal_query` with `view`                |
| `ttl_service_status`                                                    | `router_status` or `state_delete_expired`  |

Neither SDK nor any adapter referenced the removed tools, and none were listed
in `docs/api.md`.
