-- CreateEnum
CREATE TYPE "LanguageCode" AS ENUM ('RU', 'EN', 'KK');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('CHANNEL', 'GROUP');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('NONE', 'PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "GiveawayStatus" AS ENUM ('DRAFT', 'PENDING_CONFIRM', 'SCHEDULED', 'ACTIVE', 'FINISHED', 'CANCELLED', 'ERROR');

-- CreateEnum
CREATE TYPE "GiveawayType" AS ENUM ('STANDARD', 'BOOST_REQUIRED', 'INVITE_REQUIRED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('JOINED', 'FAILED_CAPTCHA', 'FAILED_SUBSCRIPTION', 'BANNED');

-- CreateEnum
CREATE TYPE "CaptchaMode" AS ENUM ('OFF', 'SUSPICIOUS_ONLY', 'ALL');

-- CreateEnum
CREATE TYPE "PublishResultsMode" AS ENUM ('SEPARATE_POSTS', 'EDIT_START_POST');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('SUBSCRIPTION', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PurchaseProvider" AS ENUM ('YOOKASSA');

-- CreateEnum
CREATE TYPE "GiveawayMessageKind" AS ENUM ('START', 'RESULTS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "language" "LanguageCode" NOT NULL DEFAULT 'RU',
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "telegramChatId" BIGINT NOT NULL,
    "username" TEXT,
    "title" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "botIsAdmin" BOOLEAN NOT NULL DEFAULT false,
    "creatorIsAdmin" BOOLEAN NOT NULL DEFAULT false,
    "permissionsSnapshot" JSONB,
    "memberCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostTemplate" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT,
    "text" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL DEFAULT 'NONE',
    "telegramFileId" TEXT,
    "telegramFileUniqueId" TEXT,
    "mediaNeedsReupload" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PostTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "language" "LanguageCode" NOT NULL DEFAULT 'RU',
    "type" "GiveawayType" NOT NULL DEFAULT 'STANDARD',
    "status" "GiveawayStatus" NOT NULL DEFAULT 'DRAFT',
    "postTemplateId" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "winnersCount" INTEGER NOT NULL DEFAULT 1,
    "reserveWinnersCount" INTEGER NOT NULL DEFAULT 0,
    "buttonText" TEXT,
    "publishResultsMode" "PublishResultsMode" NOT NULL DEFAULT 'SEPARATE_POSTS',
    "isPublicInCatalog" BOOLEAN NOT NULL DEFAULT false,
    "totalParticipants" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayCondition" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "captchaMode" "CaptchaMode" NOT NULL DEFAULT 'SUSPICIOUS_ONLY',
    "boostRequired" BOOLEAN NOT NULL DEFAULT false,
    "inviteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inviteMax" INTEGER,
    "storiesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "livenessEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiveawayCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayCustomTask" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "bonusTickets" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayCustomTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayRequiredSubscription" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayRequiredSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayPublishChannel" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayPublishChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayResultsChannel" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayResultsChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayMessage" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" "GiveawayMessageKind" NOT NULL,
    "telegramMessageId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participation" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ParticipationStatus" NOT NULL DEFAULT 'JOINED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketsBase" INTEGER NOT NULL DEFAULT 1,
    "ticketsExtra" INTEGER NOT NULL DEFAULT 0,
    "sourceTag" TEXT,
    "referrerUserId" TEXT,
    "conditionsSnapshot" JSONB,
    "fraudScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "periodDays" INTEGER,
    "type" "ProductType" NOT NULL,
    "entitlementCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PurchaseProvider" NOT NULL DEFAULT 'YOOKASSA',
    "externalId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "metadata" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateIndex
CREATE INDEX "User_telegramUserId_idx" ON "User"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_telegramChatId_key" ON "Channel"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_username_key" ON "Channel"("username");

-- CreateIndex
CREATE INDEX "Channel_telegramChatId_idx" ON "Channel"("telegramChatId");

-- CreateIndex
CREATE INDEX "Channel_addedByUserId_idx" ON "Channel"("addedByUserId");

-- CreateIndex
CREATE INDEX "PostTemplate_ownerUserId_idx" ON "PostTemplate"("ownerUserId");

-- CreateIndex
CREATE INDEX "Giveaway_ownerUserId_idx" ON "Giveaway"("ownerUserId");

-- CreateIndex
CREATE INDEX "Giveaway_status_idx" ON "Giveaway"("status");

-- CreateIndex
CREATE INDEX "Giveaway_status_endAt_idx" ON "Giveaway"("status", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayCondition_giveawayId_key" ON "GiveawayCondition"("giveawayId");

-- CreateIndex
CREATE INDEX "GiveawayCustomTask_giveawayId_idx" ON "GiveawayCustomTask"("giveawayId");

-- CreateIndex
CREATE INDEX "GiveawayRequiredSubscription_giveawayId_idx" ON "GiveawayRequiredSubscription"("giveawayId");

-- CreateIndex
CREATE INDEX "GiveawayRequiredSubscription_channelId_idx" ON "GiveawayRequiredSubscription"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayRequiredSubscription_giveawayId_channelId_key" ON "GiveawayRequiredSubscription"("giveawayId", "channelId");

-- CreateIndex
CREATE INDEX "GiveawayPublishChannel_giveawayId_idx" ON "GiveawayPublishChannel"("giveawayId");

-- CreateIndex
CREATE INDEX "GiveawayPublishChannel_channelId_idx" ON "GiveawayPublishChannel"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayPublishChannel_giveawayId_channelId_key" ON "GiveawayPublishChannel"("giveawayId", "channelId");

-- CreateIndex
CREATE INDEX "GiveawayResultsChannel_giveawayId_idx" ON "GiveawayResultsChannel"("giveawayId");

-- CreateIndex
CREATE INDEX "GiveawayResultsChannel_channelId_idx" ON "GiveawayResultsChannel"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayResultsChannel_giveawayId_channelId_key" ON "GiveawayResultsChannel"("giveawayId", "channelId");

-- CreateIndex
CREATE INDEX "GiveawayMessage_giveawayId_idx" ON "GiveawayMessage"("giveawayId");

-- CreateIndex
CREATE INDEX "GiveawayMessage_channelId_idx" ON "GiveawayMessage"("channelId");

-- CreateIndex
CREATE INDEX "Participation_giveawayId_idx" ON "Participation"("giveawayId");

-- CreateIndex
CREATE INDEX "Participation_userId_idx" ON "Participation"("userId");

-- CreateIndex
CREATE INDEX "Participation_referrerUserId_idx" ON "Participation"("referrerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Participation_giveawayId_userId_key" ON "Participation"("giveawayId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_code_idx" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");

-- CreateIndex
CREATE INDEX "Purchase_productId_idx" ON "Purchase"("productId");

-- CreateIndex
CREATE INDEX "Purchase_externalId_idx" ON "Purchase"("externalId");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- CreateIndex
CREATE INDEX "Entitlement_userId_idx" ON "Entitlement"("userId");

-- CreateIndex
CREATE INDEX "Entitlement_userId_code_idx" ON "Entitlement"("userId", "code");

-- CreateIndex
CREATE INDEX "Entitlement_expiresAt_idx" ON "Entitlement"("expiresAt");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTemplate" ADD CONSTRAINT "PostTemplate_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_postTemplateId_fkey" FOREIGN KEY ("postTemplateId") REFERENCES "PostTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayCondition" ADD CONSTRAINT "GiveawayCondition_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayCustomTask" ADD CONSTRAINT "GiveawayCustomTask_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayRequiredSubscription" ADD CONSTRAINT "GiveawayRequiredSubscription_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayRequiredSubscription" ADD CONSTRAINT "GiveawayRequiredSubscription_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayPublishChannel" ADD CONSTRAINT "GiveawayPublishChannel_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayPublishChannel" ADD CONSTRAINT "GiveawayPublishChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayResultsChannel" ADD CONSTRAINT "GiveawayResultsChannel_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayResultsChannel" ADD CONSTRAINT "GiveawayResultsChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayMessage" ADD CONSTRAINT "GiveawayMessage_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayMessage" ADD CONSTRAINT "GiveawayMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
