-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "journalEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "State" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EventJournalEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventJournalEntry_workspaceId_workflowId_sequence_idx" ON "EventJournalEntry"("workspaceId", "workflowId", "sequence");

-- CreateIndex
CREATE INDEX "EventJournalEntry_workspaceId_createdAt_idx" ON "EventJournalEntry"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "EventJournalEntry_workflowId_eventType_idx" ON "EventJournalEntry"("workflowId", "eventType");

-- CreateIndex
CREATE INDEX "EventJournalEntry_workspaceId_workflowId_eventType_createdA_idx" ON "EventJournalEntry"("workspaceId", "workflowId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "State_expiresAt_idx" ON "State"("expiresAt");

-- AddForeignKey
ALTER TABLE "EventJournalEntry" ADD CONSTRAINT "EventJournalEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventJournalEntry" ADD CONSTRAINT "EventJournalEntry_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

