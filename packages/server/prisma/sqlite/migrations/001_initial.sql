CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lookupKey" TEXT
);
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");
CREATE UNIQUE INDEX "Workspace_ownerId_lookupKey_key" ON "Workspace"("ownerId", "lookupKey");

CREATE TABLE "Schema" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "fields" JSONB NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Schema_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Schema_workspaceId_name_version_key" ON "Schema"("workspaceId", "name", "version");
CREATE INDEX "Schema_workspaceId_idx" ON "Schema"("workspaceId");

CREATE TABLE "Workflow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "failureReason" TEXT,
  CONSTRAINT "Workflow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Workflow_workspaceId_idx" ON "Workflow"("workspaceId");
CREATE INDEX "Workflow_status_idx" ON "Workflow"("status");

CREATE TABLE "State" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "State_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "State_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "State_workflowId_key_key" ON "State"("workflowId", "key");
CREATE INDEX "State_workspaceId_idx" ON "State"("workspaceId");
CREATE INDEX "State_workflowId_idx" ON "State"("workflowId");

CREATE TABLE "Checkpoint" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "label" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Checkpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Checkpoint_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Checkpoint_workspaceId_idx" ON "Checkpoint"("workspaceId");
CREATE INDEX "Checkpoint_workflowId_idx" ON "Checkpoint"("workflowId");

CREATE TABLE "StepExecution" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "agentId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "result" JSONB,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "StepExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StepExecution_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "StepExecution_workspaceId_idx" ON "StepExecution"("workspaceId");
CREATE INDEX "StepExecution_workflowId_idx" ON "StepExecution"("workflowId");
CREATE UNIQUE INDEX "StepExecution_workflowId_stepId_executionId_key" ON "StepExecution"("workflowId", "stepId", "executionId");

CREATE TABLE "AgentRole" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "allowedWriteKeys" JSONB NOT NULL,
  "allowedReadKeys" JSONB NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AgentRole_workspaceId_name_key" ON "AgentRole"("workspaceId", "name");
CREATE INDEX "AgentRole_workspaceId_idx" ON "AgentRole"("workspaceId");
