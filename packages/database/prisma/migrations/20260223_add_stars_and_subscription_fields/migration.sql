-- Migration: add Stars payment provider + subscription warning field
-- Task 6.4: Telegram Stars (PurchaseProvider enum)
-- Task 6.5: Subscription expiry warning (Entitlement.warningSentAt)

-- Add new PurchaseProvider values
ALTER TYPE "PurchaseProvider" ADD VALUE IF NOT EXISTS 'STARS';
ALTER TYPE "PurchaseProvider" ADD VALUE IF NOT EXISTS 'MANUAL';

-- Add warningSentAt to Entitlement (for 3-day expiry reminder)
ALTER TABLE "Entitlement" ADD COLUMN IF NOT EXISTS "warningSentAt" TIMESTAMP(3);

-- Index for efficient scheduler queries
CREATE INDEX IF NOT EXISTS "Entitlement_warningSentAt_expiresAt_idx"
  ON "Entitlement" ("warningSentAt", "expiresAt");
