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
