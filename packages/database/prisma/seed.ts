import { PrismaClient, ProductType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Upsert MVP Product: Catalog Monthly Access
  const catalogProduct = await prisma.product.upsert({
    where: { code: 'CATALOG_MONTHLY_1000' },
    update: {
      title: 'Каталог розыгрышей на 30 дней',
      price: 100000, // 1000 RUB in kopecks
      currency: 'RUB',
      periodDays: 30,
      type: ProductType.SUBSCRIPTION,
      entitlementCode: 'catalog.access',
      isActive: true,
    },
    create: {
      code: 'CATALOG_MONTHLY_1000',
      title: 'Каталог розыгрышей на 30 дней',
      description: 'Доступ к каталогу активных розыгрышей на 30 дней',
      price: 100000, // 1000 RUB in kopecks
      currency: 'RUB',
      periodDays: 30,
      type: ProductType.SUBSCRIPTION,
      entitlementCode: 'catalog.access',
      isActive: true,
    },
  });

  console.log(`✅ Product created/updated: ${catalogProduct.code}`);
  console.log(`   - Title: ${catalogProduct.title}`);
  console.log(`   - Price: ${catalogProduct.price / 100} ${catalogProduct.currency}`);
  console.log(`   - Period: ${catalogProduct.periodDays} days`);

  // Upsert Product: Randomizer Monthly Access
  const randomizerProduct = await prisma.product.upsert({
    where: { code: 'RANDOMIZER_MONTHLY_500' },
    update: {
      title: 'Рандомайзер на 30 дней',
      price: 50000, // 500 RUB in kopecks
      currency: 'RUB',
      periodDays: 30,
      type: ProductType.SUBSCRIPTION,
      entitlementCode: 'randomizer.access',
      isActive: true,
    },
    create: {
      code: 'RANDOMIZER_MONTHLY_500',
      title: 'Рандомайзер на 30 дней',
      description: 'Красивый рандомайзер для объявления победителей с анимацией и эффектами',
      price: 50000, // 500 RUB in kopecks
      currency: 'RUB',
      periodDays: 30,
      type: ProductType.SUBSCRIPTION,
      entitlementCode: 'randomizer.access',
      isActive: true,
    },
  });

  console.log(`✅ Product created/updated: ${randomizerProduct.code}`);

  // ── Подписки для создателей ────────────────────────────────────────────────

  const subscriptionPlus = await prisma.product.upsert({
    where: { code: 'SUBSCRIPTION_PLUS' },
    update: {
      title: 'RandomBeast PLUS',
      price: 19000, // 190 RUB в копейках
      currency: 'RUB',
      periodDays: 30,
      type: ProductType.SUBSCRIPTION,
      entitlementCode: 'tier.plus',
      isActive: true,
      starsPrice: 200, // ~190 RUB в Stars (конвертация ~1 Star ≈ 1 RUB)
    },
    create: {
      code: 'SUBSCRIPTION_PLUS',
      title: 'RandomBeast PLUS',
      description: 'Расширенные возможности для создателей и участников на 30 дней',
      price: 19000,
      currency: 'RUB',
      periodDays: 30,
      type: ProductType.SUBSCRIPTION,
      entitlementCode: 'tier.plus',
      isActive: true,
      starsPrice: 200,
    },
  });

  console.log(`✅ Product created/updated: ${subscriptionPlus.code} (${subscriptionPlus.price / 100} RUB / ${subscriptionPlus.starsPrice} Stars)`);

  const subscriptionPro = await prisma.product.upsert({
    where: { code: 'SUBSCRIPTION_PRO' },
    update: {
      title: 'RandomBeast PRO',
      price: 49000, // 490 RUB
      currency: 'RUB',
      periodDays: 30,
      type: ProductType.SUBSCRIPTION,
      entitlementCode: 'tier.pro',
      isActive: true,
      starsPrice: 500,
    },
    create: {
      code: 'SUBSCRIPTION_PRO',
      title: 'RandomBeast PRO',
      description: 'Профессиональные инструменты: расширенная аналитика, liveness check, экспорт CSV на 30 дней',
      price: 49000,
      currency: 'RUB',
      periodDays: 30,
      type: ProductType.SUBSCRIPTION,
      entitlementCode: 'tier.pro',
      isActive: true,
      starsPrice: 500,
    },
  });

  console.log(`✅ Product created/updated: ${subscriptionPro.code} (${subscriptionPro.price / 100} RUB / ${subscriptionPro.starsPrice} Stars)`);

  const subscriptionBusiness = await prisma.product.upsert({
    where: { code: 'SUBSCRIPTION_BUSINESS' },
    update: {
      title: 'RandomBeast BUSINESS',
      price: 149000, // 1490 RUB
      currency: 'RUB',
      periodDays: 30,
      type: ProductType.SUBSCRIPTION,
      entitlementCode: 'tier.business',
      isActive: true,
      starsPrice: 1500,
    },
    create: {
      code: 'SUBSCRIPTION_BUSINESS',
      title: 'RandomBeast BUSINESS',
      description: 'Максимальные возможности: белый лейбл, webhook API, выделенная поддержка на 30 дней',
      price: 149000,
      currency: 'RUB',
      periodDays: 30,
      type: ProductType.SUBSCRIPTION,
      entitlementCode: 'tier.business',
      isActive: true,
      starsPrice: 1500,
    },
  });

  console.log(`✅ Product created/updated: ${subscriptionBusiness.code} (${subscriptionBusiness.price / 100} RUB / ${subscriptionBusiness.starsPrice} Stars)`);

  // ── Dev test data (только в dev/test окружении) ──────────────────────────

  if (process.env.NODE_ENV !== 'production') {
    console.log('\n📦 Creating dev test data...');

    // ── 3 тестовых пользователя с разными подписками ──

    const userAlice = await prisma.user.upsert({
      where: { telegramUserId: BigInt(123456789) },
      update: { username: 'test_creator', firstName: 'Alice', lastName: 'FREE' },
      create: {
        telegramUserId: BigInt(123456789),
        username: 'test_creator',
        firstName: 'Alice',
        lastName: 'FREE',
        language: 'RU',
        isPremium: false,
      },
    });
    console.log(`  ✅ User: ${userAlice.username} (FREE)`);

    const userBob = await prisma.user.upsert({
      where: { telegramUserId: BigInt(987654321) },
      update: { username: 'test_plus', firstName: 'Bob', lastName: 'PLUS' },
      create: {
        telegramUserId: BigInt(987654321),
        username: 'test_plus',
        firstName: 'Bob',
        lastName: 'PLUS',
        language: 'RU',
        isPremium: true,
      },
    });
    console.log(`  ✅ User: ${userBob.username} (PLUS)`);

    const userCharlie = await prisma.user.upsert({
      where: { telegramUserId: BigInt(111222333) },
      update: { username: 'test_pro', firstName: 'Charlie', lastName: 'PRO' },
      create: {
        telegramUserId: BigInt(111222333),
        username: 'test_pro',
        firstName: 'Charlie',
        lastName: 'PRO',
        language: 'EN',
        isPremium: true,
      },
    });
    console.log(`  ✅ User: ${userCharlie.username} (PRO)`);

    // ── Entitlements: Bob → tier.plus, Charlie → tier.pro ──

    const existingPlusEntitlement = await prisma.entitlement.findFirst({
      where: { userId: userBob.id, code: 'tier.plus', revokedAt: null },
    });
    if (!existingPlusEntitlement) {
      await prisma.entitlement.create({
        data: {
          userId: userBob.id,
          code: 'tier.plus',
          sourceType: 'manual',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 дней
          autoRenew: false,
        },
      });
      console.log(`  ✅ Entitlement: tier.plus → Bob`);
    }

    const existingProEntitlement = await prisma.entitlement.findFirst({
      where: { userId: userCharlie.id, code: 'tier.pro', revokedAt: null },
    });
    if (!existingProEntitlement) {
      await prisma.entitlement.create({
        data: {
          userId: userCharlie.id,
          code: 'tier.pro',
          sourceType: 'manual',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          autoRenew: true,
        },
      });
      console.log(`  ✅ Entitlement: tier.pro → Charlie`);
    }

    // ── Тестовые purchases ──

    const existingPlusProduct = await prisma.product.findUnique({
      where: { code: 'SUBSCRIPTION_PLUS' },
    });
    if (existingPlusProduct) {
      const existingPurchase = await prisma.purchase.findFirst({
        where: { userId: userBob.id, productId: existingPlusProduct.id },
      });
      if (!existingPurchase) {
        await prisma.purchase.create({
          data: {
            userId: userBob.id,
            productId: existingPlusProduct.id,
            status: 'COMPLETED',
            provider: 'YOOKASSA',
            externalId: 'test-yookassa-bob-001',
            amount: existingPlusProduct.price,
            currency: 'RUB',
            paidAt: new Date(),
          },
        });
        console.log(`  ✅ Purchase: SUBSCRIPTION_PLUS → Bob (COMPLETED)`);
      }
    }

    // ── 5 каналов ──

    const channelDefs = [
      { chatId: BigInt(-1001234567890), title: 'Tech Giveaways', username: 'test_tech_giveaways', member: 15000, owner: userAlice },
      { chatId: BigInt(-1001234567891), title: 'Gaming Prizes RU',  username: 'test_gaming_prizes',  member: 42000, owner: userAlice },
      { chatId: BigInt(-1001234567892), title: 'Crypto Drops',      username: 'test_crypto_drops',   member: 8500,  owner: userBob },
      { chatId: BigInt(-1001234567893), title: 'Beauty & Fashion',  username: 'test_beauty_fashion', member: 31000, owner: userBob },
      { chatId: BigInt(-1001234567894), title: 'Charlie Global',    username: 'test_charlie_global', member: 120000, owner: userCharlie },
    ];

    const channels = [];
    for (const def of channelDefs) {
      const ch = await prisma.channel.upsert({
        where: { telegramChatId: def.chatId },
        update: { title: def.title, botIsAdmin: true, creatorIsAdmin: true, memberCount: def.member },
        create: {
          telegramChatId: def.chatId,
          title: def.title,
          username: def.username,
          type: 'CHANNEL',
          addedByUserId: def.owner.id,
          botIsAdmin: true,
          creatorIsAdmin: true,
          memberCount: def.member,
        },
      });
      channels.push(ch);
    }
    console.log(`  ✅ Channels: ${channels.map(c => c.username).join(', ')}`);

    // ── Post template для розыгрышей ──

    const postTemplate = await prisma.postTemplate.upsert({
      where: { id: 'seed-post-template-001' },
      update: {},
      create: {
        id: 'seed-post-template-001',
        ownerUserId: userAlice.id,
        name: 'Стандартный шаблон',
        text: '🎁 *Розыгрыш призов!*\n\nУчаствуй и выиграй крутые призы!\n\n📅 Конец: {endAt}\n🏆 Победителей: {winnersCount}\n👥 Участников: {participantsCount}',
        mediaType: 'NONE',
      },
    }).catch(() => prisma.postTemplate.findFirstOrThrow({ where: { ownerUserId: userAlice.id } }));

    // ── 5 розыгрышей в разных статусах ──

    // 1. ACTIVE (идёт сейчас)
    const giveawayActive = await prisma.giveaway.upsert({
      where: { id: 'seed-giveaway-active-001' },
      update: { totalParticipants: 87 },
      create: {
        id: 'seed-giveaway-active-001',
        shortCode: 'SEEDACT1',
        ownerUserId: userAlice.id,
        title: '🎮 Розыгрыш геймерского кресла',
        status: 'ACTIVE',
        type: 'STANDARD',
        postTemplateId: postTemplate.id,
        startAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // -2 дня
        endAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),   // +5 дней
        winnersCount: 3,
        buttonText: 'Участвовать',
        totalParticipants: 87,
        isPublicInCatalog: true,
        catalogApproved: true,
        prizeDescription: 'Геймерское кресло DXRacer Formula Series',
        prizeDeliveryMethod: 'BOT_INSTRUCTION',
        condition: {
          create: {
            captchaMode: 'SUSPICIOUS_ONLY',
            inviteEnabled: true,
            inviteMax: 5,
            boostEnabled: false,
            storiesEnabled: false,
          },
        },
        requiredSubscriptions: {
          create: [{ channelId: channels[0].id }, { channelId: channels[1].id }],
        },
        publishChannels: {
          create: [{ channelId: channels[0].id }],
        },
      },
    });

    // 2. SCHEDULED (запланирован)
    const giveawayScheduled = await prisma.giveaway.upsert({
      where: { id: 'seed-giveaway-scheduled-001' },
      update: {},
      create: {
        id: 'seed-giveaway-scheduled-001',
        shortCode: 'SEEDSCH1',
        ownerUserId: userBob.id,
        title: '💰 Крипто-розыгрыш 0.1 BTC',
        status: 'SCHEDULED',
        type: 'STANDARD',
        startAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),  // +1 день
        endAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),   // +14 дней
        winnersCount: 1,
        buttonText: 'Принять участие',
        totalParticipants: 0,
        isPublicInCatalog: true,
        prizeDescription: '0.1 BTC на криптокошелёк победителя',
        condition: {
          create: {
            captchaMode: 'ALL',
            inviteEnabled: false,
            boostEnabled: true,
            boostChannelIds: [channels[2].id],
            storiesEnabled: false,
          },
        },
        requiredSubscriptions: {
          create: [{ channelId: channels[2].id }],
        },
      },
    });

    // 3. FINISHED (завершён с победителями)
    const giveawayFinished = await prisma.giveaway.upsert({
      where: { id: 'seed-giveaway-finished-001' },
      update: {},
      create: {
        id: 'seed-giveaway-finished-001',
        shortCode: 'SEEDFIN1',
        ownerUserId: userAlice.id,
        title: '👗 Бьюти-бокс от партнёра',
        status: 'FINISHED',
        type: 'STANDARD',
        startAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        winnersCount: 5,
        buttonText: 'Участвовать',
        totalParticipants: 324,
        publishResultsMode: 'SEPARATE_POSTS',
        prizeDescription: 'Бьюти-бокс с косметикой от топ-брендов',
        condition: {
          create: {
            captchaMode: 'SUSPICIOUS_ONLY',
            inviteEnabled: true,
            inviteMax: 10,
            storiesEnabled: true,
            boostEnabled: false,
          },
        },
      },
    });

    // 4. DRAFT (черновик)
    const giveawayDraft = await prisma.giveaway.upsert({
      where: { id: 'seed-giveaway-draft-001' },
      update: {},
      create: {
        id: 'seed-giveaway-draft-001',
        ownerUserId: userCharlie.id,
        title: '🌍 Global Tech Giveaway',
        status: 'DRAFT',
        type: 'CUSTOM',
        language: 'EN',
        wizardStep: 'conditions',
        draftPayload: {
          title: 'Global Tech Giveaway',
          winnersCount: 10,
          type: 'CUSTOM',
        },
        totalParticipants: 0,
        condition: {
          create: {
            captchaMode: 'OFF',
            inviteEnabled: true,
            inviteMax: 20,
            storiesEnabled: true,
            boostEnabled: true,
          },
        },
      },
    });

    // 5. CANCELLED (отменён)
    const giveawayCancelled = await prisma.giveaway.upsert({
      where: { id: 'seed-giveaway-cancelled-001' },
      update: {},
      create: {
        id: 'seed-giveaway-cancelled-001',
        shortCode: 'SEEDCAN1',
        ownerUserId: userBob.id,
        title: '❌ Тест (отменён)',
        status: 'CANCELLED',
        type: 'STANDARD',
        startAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        winnersCount: 2,
        totalParticipants: 12,
        condition: {
          create: { captchaMode: 'OFF', inviteEnabled: false, boostEnabled: false, storiesEnabled: false },
        },
      },
    });

    console.log(`  ✅ Giveaways: ACTIVE, SCHEDULED, FINISHED, DRAFT, CANCELLED`);

    // ── 100 участников в ACTIVE розыгрыше ──
    // Создаём 100 тест-участников (telegramUserId 200000000 → 200000099)

    const participantUsers: typeof userAlice[] = [];
    const PARTICIPANT_COUNT = 100;

    for (let i = 0; i < PARTICIPANT_COUNT; i++) {
      const tgId = BigInt(200000000 + i);
      const names = ['Иван', 'Анна', 'Михаил', 'Ольга', 'Дмитрий', 'Татьяна', 'Сергей', 'Наталья', 'Андрей', 'Елена'];
      const lastNames = ['Иванов', 'Петрова', 'Сидоров', 'Козлова', 'Новиков', 'Морозова', 'Павлов', 'Соколова', 'Лебедев', 'Попова'];
      const firstName = names[i % names.length];
      const lastName = lastNames[Math.floor(i / names.length) % lastNames.length];

      const user = await prisma.user.upsert({
        where: { telegramUserId: tgId },
        update: {},
        create: {
          telegramUserId: tgId,
          username: `participant_${i}`,
          firstName,
          lastName,
          language: i % 3 === 0 ? 'RU' : i % 3 === 1 ? 'EN' : 'KK',
          isPremium: i % 7 === 0,
        },
      });
      participantUsers.push(user);
    }

    // Создаём участия в ACTIVE розыгрыше
    let participationsCreated = 0;
    for (let i = 0; i < participantUsers.length; i++) {
      const user = participantUsers[i];
      const existingParticipation = await prisma.participation.findUnique({
        where: { giveawayId_userId: { giveawayId: giveawayActive.id, userId: user.id } },
      });
      if (!existingParticipation) {
        const inviteCount = i < 20 ? Math.floor(i / 4) : 0; // первые 20 — реферралы
        await prisma.participation.create({
          data: {
            giveawayId: giveawayActive.id,
            userId: user.id,
            status: 'JOINED',
            ticketsBase: 1,
            ticketsExtra: inviteCount,
            inviteCount,
            joinedAt: new Date(Date.now() - Math.random() * 2 * 24 * 60 * 60 * 1000),
            fraudScore: i % 20 === 0 ? 50 : 0, // 5% подозрительных
            subscriptionVerified: true,
            captchaPassed: i % 5 !== 0, // 80% прошли капчу
            displayName: `${user.firstName} ${user.lastName ?? ''}`.trim(),
          },
        });
        participationsCreated++;
      }
    }

    // Часть участников в FINISHED розыгрыше (первые 30)
    for (let i = 0; i < 30 && i < participantUsers.length; i++) {
      const user = participantUsers[i];
      const existing = await prisma.participation.findUnique({
        where: { giveawayId_userId: { giveawayId: giveawayFinished.id, userId: user.id } },
      });
      if (!existing) {
        await prisma.participation.create({
          data: {
            giveawayId: giveawayFinished.id,
            userId: user.id,
            status: i < 5 ? 'WON' : 'JOINED',
            ticketsBase: 1,
            ticketsExtra: i < 10 ? 2 : 0,
            joinedAt: new Date(Date.now() - (20 + i) * 24 * 60 * 60 * 1000),
            subscriptionVerified: true,
            displayName: `${user.firstName} ${user.lastName ?? ''}`.trim(),
          },
        });
      }
    }

    // Победители FINISHED розыгрыша
    for (let place = 1; place <= 5; place++) {
      const user = participantUsers[place - 1];
      const existing = await prisma.winner.findFirst({
        where: { giveawayId: giveawayFinished.id, userId: user.id },
      });
      if (!existing) {
        await prisma.winner.create({
          data: {
            giveawayId: giveawayFinished.id,
            userId: user.id,
            participationId: (await prisma.participation.findUnique({
              where: { giveawayId_userId: { giveawayId: giveawayFinished.id, userId: user.id } },
            }))?.id ?? '',
            place,
            ticketsUsed: 1 + (place - 1),
            isReserve: false,
            selectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    console.log(`  ✅ Participations: ${participationsCreated} созданных в ACTIVE, 30 в FINISHED`);
    console.log(`  ✅ Winners: 5 победителей в FINISHED розыгрыше`);

    console.log('\n📊 Dev data summary:');
    console.log(`   Users: Alice (FREE), Bob (PLUS), Charlie (PRO) + 100 участников`);
    console.log(`   Channels: 5 (разные владельцы)`);
    console.log(`   Giveaways: ACTIVE, SCHEDULED, FINISHED, DRAFT, CANCELLED`);
    console.log(`   Participations: ~100 в ACTIVE, 30 в FINISHED`);
    console.log(`   Winners: 5 победителей (место 1-5) в FINISHED`);
    console.log(`   Purchases: 1 COMPLETED (Bob → PLUS)`);
    console.log(`   Entitlements: tier.plus (Bob), tier.pro (Charlie)`);
  }

  console.log('\n🌱 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
