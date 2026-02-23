import { prisma } from '@randombeast/database';

/**
 * Бейдж-коды и их условия начисления
 *
 * newcomer      — первое участие
 * activist      — 5 участий
 * veteran       — 20 участий
 * winner        — первая победа
 * multi_winner  — 3 победы
 * champion      — 10 побед
 * friend        — пригласил 5 участников суммарно
 * patron        — оформил платную подписку
 */
const BADGE_DEFINITIONS: Record<string, string> = {
  newcomer: '🌱 Новичок',
  activist: '🔥 Активист',
  veteran: '⚔️ Ветеран',
  winner: '🏆 Победитель',
  multi_winner: '🥇 Мульти-победитель',
  champion: '👑 Чемпион',
  friend: '🤝 Друг',
  patron: '💎 Меценат',
};

/**
 * Выдать бейдж пользователю если ещё не выдан.
 * Возвращает true если бейдж был выдан впервые.
 */
async function awardBadge(userId: string, badgeCode: string): Promise<boolean> {
  try {
    await prisma.userBadge.create({
      data: {
        userId,
        badgeCode,
      },
    });
    return true;
  } catch {
    // unique constraint violation — уже выдан, игнорируем
    return false;
  }
}

/**
 * Начисляет бейджи участнику после участия (join).
 * Вызывается при успешном вступлении в розыгрыш.
 */
export async function awardParticipationBadges(userId: string): Promise<void> {
  // Считаем общее кол-во участий
  const count = await prisma.participation.count({
    where: { userId },
  });

  if (count >= 1) await awardBadge(userId, 'newcomer');
  if (count >= 5) await awardBadge(userId, 'activist');
  if (count >= 20) await awardBadge(userId, 'veteran');

  // Считаем суммарно приглашённых
  const invited = await prisma.participation.aggregate({
    where: { userId },
    _sum: { inviteCount: true },
  });
  const invitedTotal = invited._sum?.inviteCount ?? 0;
  if (invitedTotal >= 5) await awardBadge(userId, 'friend');
}

/**
 * Начисляет бейджи победителю после окончания розыгрыша.
 * Вызывается при выборе победителей.
 */
export async function awardWinnerBadges(userId: string): Promise<void> {
  // Считаем кол-во побед (не резервных)
  const winsCount = await prisma.winner.count({
    where: {
      userId,
      isReserve: false,
    },
  });

  if (winsCount >= 1) await awardBadge(userId, 'winner');
  if (winsCount >= 3) await awardBadge(userId, 'multi_winner');
  if (winsCount >= 10) await awardBadge(userId, 'champion');
}

/**
 * Начисляет бейдж 'patron' при оформлении платной подписки.
 */
export async function awardPatronBadge(userId: string): Promise<void> {
  await awardBadge(userId, 'patron');
}

export { BADGE_DEFINITIONS };
