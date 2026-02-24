-- Add missing columns that were added to schema.prisma without migrations

-- User: notification settings
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationsBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "creatorNotificationMode" TEXT NOT NULL DEFAULT 'MILESTONE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "catalogNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Giveaway: sandbox mode
ALTER TABLE "Giveaway" ADD COLUMN IF NOT EXISTS "isSandbox" BOOLEAN NOT NULL DEFAULT false;

-- Entitlement: auto-renew and lifecycle fields
ALTER TABLE "Entitlement" ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Entitlement" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Entitlement" ADD COLUMN IF NOT EXISTS "warningSentAt" TIMESTAMP(3);

-- Index for subscription lifecycle queries
CREATE INDEX IF NOT EXISTS "Entitlement_warningSentAt_expiresAt_idx" ON "Entitlement"("warningSentAt", "expiresAt");
