-- 14.8 Уведомления каталога: добавляем поле opt-in для пользователей
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "catalogNotificationsEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
