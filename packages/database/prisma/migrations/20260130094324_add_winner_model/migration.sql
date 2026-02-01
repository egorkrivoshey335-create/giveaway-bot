-- CreateTable
CREATE TABLE "Winner" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "ticketsUsed" INTEGER NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "Winner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Winner_giveawayId_idx" ON "Winner"("giveawayId");

-- CreateIndex
CREATE INDEX "Winner_userId_idx" ON "Winner"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Winner_giveawayId_userId_key" ON "Winner"("giveawayId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Winner_giveawayId_place_key" ON "Winner"("giveawayId", "place");

-- CreateIndex
CREATE INDEX "Giveaway_status_startAt_idx" ON "Giveaway"("status", "startAt");

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
