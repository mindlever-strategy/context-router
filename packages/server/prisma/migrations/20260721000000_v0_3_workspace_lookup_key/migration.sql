ALTER TABLE "Workspace" ADD COLUMN "lookupKey" TEXT;

CREATE UNIQUE INDEX "Workspace_ownerId_lookupKey_key"
ON "Workspace"("ownerId", "lookupKey");
