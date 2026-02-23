-- Migration: Add drawSeed to Giveaway for audit transparency
-- The drawSeed stores SHA256(giveawayId|endAt|sortedParticipantsJSON) so anyone can verify the draw.

ALTER TABLE "Giveaway" ADD COLUMN IF NOT EXISTS "drawSeed" TEXT;
