-- CreateEnum
CREATE TYPE "StepExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "StepExecution" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "agentId" TEXT,
    "status" "StepExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "result" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRole" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allowedWriteKeys" TEXT[],
    "allowedReadKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StepExecution_workspaceId_idx" ON "StepExecution"("workspaceId");

-- CreateIndex
CREATE INDEX "StepExecution_workflowId_idx" ON "StepExecution"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "StepExecution_workflowId_stepId_executionId_key" ON "StepExecution"("workflowId", "stepId", "executionId");

-- CreateIndex
CREATE INDEX "AgentRole_workspaceId_idx" ON "AgentRole"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRole_workspaceId_name_key" ON "AgentRole"("workspaceId", "name");

-- AddForeignKey
ALTER TABLE "StepExecution" ADD CONSTRAINT "StepExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepExecution" ADD CONSTRAINT "StepExecution_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRole" ADD CONSTRAINT "AgentRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
