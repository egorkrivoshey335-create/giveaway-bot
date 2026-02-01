-- AlterTable
ALTER TABLE "GiveawayCondition" ADD COLUMN     "boostChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "boostEnabled" BOOLEAN NOT NULL DEFAULT false;
