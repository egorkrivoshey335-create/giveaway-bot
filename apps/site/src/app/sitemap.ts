import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://randombeast.ru';
const API_URL = process.env.API_URL || 'http://localhost:4000';

/**
 * Динамический sitemap.xml для randombeast.ru
 * Включает: главные страницы на 3 языках + публичные страницы результатов
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Основные страницы
  const staticPages: MetadataRoute.Sitemap = [
    // Главная (ru — без префикса)
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    // Главная EN
    {
      url: `${BASE_URL}/en`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // Главная KK
    {
      url: `${BASE_URL}/kk`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // Privacy
    {
      url: `${BASE_URL}/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/en/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/kk/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    // Terms
    {
      url: `${BASE_URL}/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/en/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/kk/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // Динамические страницы результатов публичных розыгрышей
  let resultPages: MetadataRoute.Sitemap = [];

  try {
    const response = await fetch(`${API_URL}/site/public-results`, {
      next: { revalidate: 3600 }, // кэш 1 час
    });

    if (response.ok) {
      const data = await response.json();
      if (data.ok && Array.isArray(data.giveaways)) {
        resultPages = data.giveaways.map((g: { id: string; finishedAt: string }) => ({
          url: `${BASE_URL}/results/${g.id}`,
          lastModified: new Date(g.finishedAt),
          changeFrequency: 'never' as const,
          priority: 0.7,
        }));
      }
    }
  } catch {
    // Если API недоступен — возвращаем только статические страницы
  }

  return [...staticPages, ...resultPages];
}
