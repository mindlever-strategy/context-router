---
'@context-router/mcp-server': patch
---

Add the missing PostgreSQL migration for the event journal and state expiry.

The Prisma schema gained `Workspace.journalEnabled`, `State.expiresAt` and the
`EventJournalEntry` table, and SQLite got migrations for them, but PostgreSQL
did not. On PostgreSQL every workspace query failed with "The column
`journalEnabled` does not exist". Run `prisma migrate deploy` (`npm run
db:migrate` in this repository) to apply it.
