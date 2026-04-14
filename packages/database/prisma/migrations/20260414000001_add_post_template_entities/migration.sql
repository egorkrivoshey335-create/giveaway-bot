-- Add entities column to PostTemplate for storing Telegram message entities (custom emoji etc.)
ALTER TABLE "PostTemplate"
  ADD COLUMN IF NOT EXISTS "entities" JSONB;
