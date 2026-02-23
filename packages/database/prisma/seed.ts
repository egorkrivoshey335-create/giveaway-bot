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

  // Task 0.5: Test user (only in development)
  if (process.env.NODE_ENV !== 'production') {
    const testUser = await prisma.user.upsert({
      where: { telegramUserId: BigInt(123456789) },
      update: {
        username: 'test_creator',
        firstName: 'Test',
        lastName: 'Creator',
      },
      create: {
        telegramUserId: BigInt(123456789),
        username: 'test_creator',
        firstName: 'Test',
        lastName: 'Creator',
        language: 'RU',
        isPremium: false,
      },
    });

    console.log(`✅ Test user created/updated: ${testUser.username} (telegramUserId: ${testUser.telegramUserId})`);

    // Test channel
    const testChannel = await prisma.channel.upsert({
      where: { telegramChatId: BigInt(-1001234567890) },
      update: {
        title: 'Test Channel',
        username: 'test_channel',
        botIsAdmin: true,
        creatorIsAdmin: true,
      },
      create: {
        telegramChatId: BigInt(-1001234567890),
        title: 'Test Channel',
        username: 'test_channel',
        type: 'CHANNEL',
        addedByUserId: testUser.id,
        botIsAdmin: true,
        creatorIsAdmin: true,
        memberCount: 100,
      },
    });

    console.log(`✅ Test channel created/updated: ${testChannel.title} (@${testChannel.username})`);
  }

  console.log('🌱 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
