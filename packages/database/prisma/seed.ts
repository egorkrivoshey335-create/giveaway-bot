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
  console.log(`   - Title: ${randomizerProduct.title}`);
  console.log(`   - Price: ${randomizerProduct.price / 100} ${randomizerProduct.currency}`);
  console.log(`   - Period: ${randomizerProduct.periodDays} days`);

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
