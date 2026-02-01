-- AlterTable
ALTER TABLE "Giveaway" ADD COLUMN     "draftPayload" JSONB,
ADD COLUMN     "draftVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "wizardStep" TEXT,
ALTER COLUMN "title" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "Giveaway_ownerUserId_status_idx" ON "Giveaway"("ownerUserId", "status");
