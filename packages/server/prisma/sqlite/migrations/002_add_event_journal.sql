-- Migration: 002_add_event_journal
-- Description: Add EventJournalEntry model and journalEnabled field

-- Add journalEnabled field to Workspace
ALTER TABLE "Workspace" ADD COLUMN "journalEnabled" INTEGER NOT NULL DEFAULT 1;

-- Create EventJournalEntry table
CREATE TABLE "EventJournalEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "metadata" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventJournalEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventJournalEntry_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EventJournalEntry_workspaceId_workflowId_sequence_idx" ON "EventJournalEntry"("workspaceId", "workflowId", "sequence");
CREATE INDEX "EventJournalEntry_workspaceId_createdAt_idx" ON "EventJournalEntry"("workspaceId", "createdAt");
CREATE INDEX "EventJournalEntry_workflowId_eventType_idx" ON "EventJournalEntry"("workflowId", "eventType");
CREATE INDEX "EventJournalEntry_workspaceId_workflowId_eventType_createdAt_idx" ON "EventJournalEntry"("workspaceId", "workflowId", "eventType", "createdAt");
