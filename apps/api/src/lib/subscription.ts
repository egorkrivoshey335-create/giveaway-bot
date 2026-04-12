import { prisma } from '@randombeast/database';

export type TierKey = 'FREE' | 'PLUS' | 'PRO' | 'BUSINESS';

const TIER_ENTITLEMENT_CODES: { code: string; tier: TierKey }[] = [
  { code: 'tier.business', tier: 'BUSINESS' },
  { code: 'tier.pro', tier: 'PRO' },
  { code: 'tier.plus', tier: 'PLUS' },
];

/**
 * Resolve the highest active subscription tier for a user.
 * Checks entitlements with codes tier.business > tier.pro > tier.plus.
 */
export async function getUserTier(userId: string): Promise<TierKey> {
  const entitlements = await prisma.entitlement.findMany({
    where: {
      userId,
      revokedAt: null,
      cancelledAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    select: { code: true },
  });

  const codes = entitlements.map(e => e.code);

  for (const { code, tier } of TIER_ENTITLEMENT_CODES) {
    if (codes.includes(code)) return tier;
  }
  return 'FREE';
}

/**
 * Check if the user has at least the given tier.
 */
export function isTierAtLeast(userTier: TierKey, requiredTier: TierKey): boolean {
  const order: TierKey[] = ['FREE', 'PLUS', 'PRO', 'BUSINESS'];
  return order.indexOf(userTier) >= order.indexOf(requiredTier);
}

/**
 * Check if the user has a specific entitlement code (e.g. 'catalog.access', 'randomizer.access').
 */
export async function hasEntitlement(userId: string, code: string): Promise<boolean> {
  const ent = await prisma.entitlement.findFirst({
    where: {
      userId,
      code,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });
  return !!ent;
}
