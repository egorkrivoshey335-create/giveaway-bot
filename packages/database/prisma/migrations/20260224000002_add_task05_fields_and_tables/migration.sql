-- Comprehensive migration: Task 0.5 fields and new tables
-- All statements use IF NOT EXISTS / IF NOT EXISTS to be idempotent

-- =============================================================================
-- 1. New enum values
-- =============================================================================

ALTER TYPE "PublishResultsMode" ADD VALUE IF NOT EXISTS 'RANDOMIZER';

DO $$ BEGIN
  CREATE TYPE "StoryRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 2. New table: Mascot (must exist before Giveaway FK)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "Mascot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mascot_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- 3. Alter existing tables — missing columns
-- =============================================================================

-- Giveaway: Task 0.5 fields + misc fields added without migrations
ALTER TABLE "Giveaway"
  ADD COLUMN IF NOT EXISTS "shortCode" TEXT,
  ADD COLUMN IF NOT EXISTS "randomizerPrizes" JSONB,
  ADD COLUMN IF NOT EXISTS "randomizerCustom" JSONB,
  ADD COLUMN IF NOT EXISTS "winnersPublished" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mascotId" TEXT,
  ADD COLUMN IF NOT EXISTS "promotionEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "catalogApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "catalogApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "catalogRejectedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "prizeDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "prizeDeliveryMethod" TEXT NOT NULL DEFAULT 'CONTACT_CREATOR',
  ADD COLUMN IF NOT EXISTS "prizeInstruction" TEXT,
  ADD COLUMN IF NOT EXISTS "minParticipants" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cancelIfNotEnough" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoExtendDays" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "Giveaway_shortCode_key" ON "Giveaway"("shortCode");
CREATE INDEX IF NOT EXISTS "Giveaway_shortCode_idx" ON "Giveaway"("shortCode");

DO $$ BEGIN
  ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_mascotId_fkey"
    FOREIGN KEY ("mascotId") REFERENCES "Mascot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- GiveawayCondition: Task 0.5 additional condition flags
ALTER TABLE "GiveawayCondition"
  ADD COLUMN IF NOT EXISTS "inviteMin" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "subscriptionRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "inviteRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "boostBonusEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inviteBonusEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "storiesBonusEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Channel: Task 0.5 avatar
ALTER TABLE "Channel"
  ADD COLUMN IF NOT EXISTS "avatarFileId" TEXT;

-- GiveawayPublishChannel: Task 0.5 original post fields
ALTER TABLE "GiveawayPublishChannel"
  ADD COLUMN IF NOT EXISTS "originalText" JSONB,
  ADD COLUMN IF NOT EXISTS "originalEntities" JSONB;

-- Participation: Task 0.5 granular condition check fields
ALTER TABLE "Participation"
  ADD COLUMN IF NOT EXISTS "boostedChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "boostsSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "storiesShared" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "storiesSharedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "captchaPassed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "subscriptionVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "boostVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inviteCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "storiesPosted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "customTasksCompleted" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "displayName" TEXT,
  ADD COLUMN IF NOT EXISTS "livenessChecked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "livenessPhotoPath" TEXT,
  ADD COLUMN IF NOT EXISTS "livenessStatus" TEXT;

-- Winner: Task 0.5 reserve & reroll support
ALTER TABLE "Winner"
  ADD COLUMN IF NOT EXISTS "isReserve" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rerolled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rerolledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "previousWinnerUserId" TEXT;

-- Product: Stars price
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "starsPrice" INTEGER;

-- =============================================================================
-- 4. New tables (Task 0.5 new models)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "GiveawayTheme" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "backgroundColor" TEXT,
    "accentColor" TEXT,
    "buttonStyle" TEXT NOT NULL DEFAULT 'default',
    "logoFileId" TEXT,
    "iconVariant" TEXT NOT NULL DEFAULT 'brand',
    "iconColor" TEXT NOT NULL DEFAULT '#000000',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiveawayTheme_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GiveawayTheme_giveawayId_key" ON "GiveawayTheme"("giveawayId");
DO $$ BEGIN
  ALTER TABLE "GiveawayTheme" ADD CONSTRAINT "GiveawayTheme_giveawayId_fkey"
    FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "TrackingLink" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "joins" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrackingLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrackingLink_giveawayId_tag_key" ON "TrackingLink"("giveawayId", "tag");
CREATE INDEX IF NOT EXISTS "TrackingLink_giveawayId_idx" ON "TrackingLink"("giveawayId");
DO $$ BEGIN
  ALTER TABLE "TrackingLink" ADD CONSTRAINT "TrackingLink_giveawayId_fkey"
    FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ReferralLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralLink_code_key" ON "ReferralLink"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralLink_userId_giveawayId_key" ON "ReferralLink"("userId", "giveawayId");
CREATE INDEX IF NOT EXISTS "ReferralLink_userId_idx" ON "ReferralLink"("userId");
CREATE INDEX IF NOT EXISTS "ReferralLink_giveawayId_idx" ON "ReferralLink"("giveawayId");
CREATE INDEX IF NOT EXISTS "ReferralLink_code_idx" ON "ReferralLink"("code");
DO $$ BEGIN
  ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_giveawayId_fkey"
    FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "CreatorBanList" (
    "id" TEXT NOT NULL,
    "creatorUserId" TEXT NOT NULL,
    "bannedUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorBanList_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreatorBanList_creatorUserId_bannedUserId_key" ON "CreatorBanList"("creatorUserId", "bannedUserId");
CREATE INDEX IF NOT EXISTS "CreatorBanList_creatorUserId_idx" ON "CreatorBanList"("creatorUserId");
CREATE INDEX IF NOT EXISTS "CreatorBanList_bannedUserId_idx" ON "CreatorBanList"("bannedUserId");
DO $$ BEGIN
  ALTER TABLE "CreatorBanList" ADD CONSTRAINT "CreatorBanList_creatorUserId_fkey"
    FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "CreatorBanList" ADD CONSTRAINT "CreatorBanList_bannedUserId_fkey"
    FOREIGN KEY ("bannedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeCode" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserBadge_userId_badgeCode_key" ON "UserBadge"("userId", "badgeCode");
CREATE INDEX IF NOT EXISTS "UserBadge_userId_idx" ON "UserBadge"("userId");
DO $$ BEGIN
  ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "GiveawayErrorLog" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiveawayErrorLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GiveawayErrorLog_giveawayId_idx" ON "GiveawayErrorLog"("giveawayId");
CREATE INDEX IF NOT EXISTS "GiveawayErrorLog_errorType_idx" ON "GiveawayErrorLog"("errorType");
DO $$ BEGIN
  ALTER TABLE "GiveawayErrorLog" ADD CONSTRAINT "GiveawayErrorLog_giveawayId_fkey"
    FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "GiveawayReminder" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiveawayReminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GiveawayReminder_giveawayId_userId_key" ON "GiveawayReminder"("giveawayId", "userId");
CREATE INDEX IF NOT EXISTS "GiveawayReminder_giveawayId_idx" ON "GiveawayReminder"("giveawayId");
CREATE INDEX IF NOT EXISTS "GiveawayReminder_userId_idx" ON "GiveawayReminder"("userId");
CREATE INDEX IF NOT EXISTS "GiveawayReminder_remindAt_idx" ON "GiveawayReminder"("remindAt");
DO $$ BEGIN
  ALTER TABLE "GiveawayReminder" ADD CONSTRAINT "GiveawayReminder_giveawayId_fkey"
    FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "GiveawayReminder" ADD CONSTRAINT "GiveawayReminder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "StoryRequest" (
    "id" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "status" "StoryRequestStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StoryRequest_participationId_key" ON "StoryRequest"("participationId");
CREATE INDEX IF NOT EXISTS "StoryRequest_participationId_idx" ON "StoryRequest"("participationId");
CREATE INDEX IF NOT EXISTS "StoryRequest_status_idx" ON "StoryRequest"("status");
DO $$ BEGIN
  ALTER TABLE "StoryRequest" ADD CONSTRAINT "StoryRequest_participationId_fkey"
    FOREIGN KEY ("participationId") REFERENCES "Participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "StoryRequest" ADD CONSTRAINT "StoryRequest_reviewedBy_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SystemBan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "bannedBy" TEXT,
    "bannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "SystemBan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SystemBan_userId_key" ON "SystemBan"("userId");
CREATE INDEX IF NOT EXISTS "SystemBan_userId_idx" ON "SystemBan"("userId");
DO $$ BEGIN
  ALTER TABLE "SystemBan" ADD CONSTRAINT "SystemBan_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "GiveawayView" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "viewerUserId" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiveawayView_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GiveawayView_giveawayId_idx" ON "GiveawayView"("giveawayId");
CREATE INDEX IF NOT EXISTS "GiveawayView_viewerUserId_idx" ON "GiveawayView"("viewerUserId");
CREATE INDEX IF NOT EXISTS "GiveawayView_createdAt_idx" ON "GiveawayView"("createdAt");
DO $$ BEGIN
  ALTER TABLE "GiveawayView" ADD CONSTRAINT "GiveawayView_giveawayId_fkey"
    FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "GiveawayView" ADD CONSTRAINT "GiveawayView_viewerUserId_fkey"
    FOREIGN KEY ("viewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "PrizeForm" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "winnerUserId" TEXT NOT NULL,
    "formData" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "PrizeForm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PrizeForm_giveawayId_winnerUserId_key" ON "PrizeForm"("giveawayId", "winnerUserId");
CREATE INDEX IF NOT EXISTS "PrizeForm_giveawayId_idx" ON "PrizeForm"("giveawayId");
CREATE INDEX IF NOT EXISTS "PrizeForm_winnerUserId_idx" ON "PrizeForm"("winnerUserId");
DO $$ BEGIN
  ALTER TABLE "PrizeForm" ADD CONSTRAINT "PrizeForm_giveawayId_fkey"
    FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PrizeForm" ADD CONSTRAINT "PrizeForm_winnerUserId_fkey"
    FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "moderatorNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Report_giveawayId_idx" ON "Report"("giveawayId");
CREATE INDEX IF NOT EXISTS "Report_reporterId_idx" ON "Report"("reporterId");
CREATE INDEX IF NOT EXISTS "Report_status_idx" ON "Report"("status");
CREATE INDEX IF NOT EXISTS "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");
DO $$ BEGIN
  ALTER TABLE "Report" ADD CONSTRAINT "Report_giveawayId_fkey"
    FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
