-- Migration: 003_add_state_expires_at
-- Description: Add expiresAt field to State model for TTL support

-- Add expiresAt field to State
ALTER TABLE "State" ADD COLUMN "expiresAt" DATETIME;

-- Create index for TTL cleanup queries
CREATE INDEX IF NOT EXISTS "State_expiresAt_idx" ON "State"("expiresAt");
