# Nginx конфигурация RandomBeast

## Установка

```bash
# 1. Скопировать конфиги на сервер
sudo cp app.randombeast.ru.conf  /etc/nginx/sites-available/
sudo cp api.randombeast.ru.conf  /etc/nginx/sites-available/
sudo cp randombeast.ru.conf      /etc/nginx/sites-available/

# 2. Создать symlinks
sudo ln -sf /etc/nginx/sites-available/app.randombeast.ru.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/api.randombeast.ru.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/randombeast.ru.conf     /etc/nginx/sites-enabled/

# 3. Создать папку для certbot и статики 503
sudo mkdir -p /var/www/certbot
sudo mkdir -p /var/www/randombeast
sudo cp 503.html /var/www/randombeast/

# 4. Проверить конфиг (сначала без SSL — закомментируй ssl_certificate строки)
sudo nginx -t

# 5. Получить SSL сертификаты (certbot сам заменит конфиг)
sudo certbot --nginx \
  -d randombeast.ru \
  -d www.randombeast.ru \
  -d app.randombeast.ru \
  -d api.randombeast.ru \
  --email admin@randombeast.ru \
  --agree-tos \
  --no-eff-email

# 6. Перезапустить nginx
sudo systemctl reload nginx
```

## Домены

| Домен | Порт | Описание |
|-------|------|----------|
| `randombeast.ru` | 3001 | Marketing Site (Next.js) |
| `app.randombeast.ru` | 3000 | Mini App (Next.js) |
| `api.randombeast.ru` | 4000 | Fastify API |

## Критичные настройки

### Mini App (app.randombeast.ru)
- **CSP с `frame-ancestors`** — обязателен для работы в Telegram
- **НЕТ X-Frame-Options: DENY** — это заблокирует iframe Telegram

### API (api.randombeast.ru)
- `/internal/*` — доступен только с `127.0.0.1`
- `/bot/webhook` — только POST
- `client_max_body_size 15m` — для загрузки файлов
