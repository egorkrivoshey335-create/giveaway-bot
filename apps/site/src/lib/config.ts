// Конфигурация для site
export const config = {
  // API URL
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  
  // Site URL
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001',
  
  // Telegram Bot
  botUsername: process.env.NEXT_PUBLIC_BOT_USERNAME || 'BeastRandomBot',
  
  // Cookie name для сессии сайта
  sessionCookieName: 'rb_site_session',
  
  // Цены
  randomizerPrice: 500, // рублей
  randomizerPeriod: 30, // дней
} as const;
