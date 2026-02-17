# 🎨 Иконки для RandomBeast

Эта папка содержит SVG иконки для приложения.

## Структура

```
icons/
└── brand/              # Брендовые SVG иконки (собственный стиль #f2b6b6)
    ├── icon-home.svg
    ├── icon-back.svg
    ├── icon-menu.svg
    └── ... (см. список ниже)
```

## Стиль brand иконок

Все brand иконки должны соответствовать единому стилю:

- **Цвет**: розовый (#f2b6b6) как primary, белый (#ffffff) как secondary
- **Стиль**: минималистичный, rounded corners, soft outline stroke 2.5px
- **Размер**: 24x24px grid
- **Формат**: SVG, transparent background
- **Градиенты**: subtle gradient highlight допустим
- **Тени**: не используются
- **Линии**: слегка puffy (мягкие), высокий контраст

## Fallback на Lucide

Если brand иконка отсутствует, `AppIcon` автоматически использует **Lucide React** иконку.

```tsx
// Brand иконка (если файл есть в /public/icons/brand/)
<AppIcon name="home" variant="brand" size={24} />

// Lucide fallback (всегда работает)
<AppIcon name="home" variant="lucide" size={24} />

// Автовыбор (рекомендуется)
<AppIcon name="home" size={24} />
```

## Генерация brand иконок

### Общий стиль-пресет (используй для всех иконок)

```
Minimal vector icon, rounded corners, soft outline stroke 2.5px, duotone pink palette (#f2b6b6 primary, #ffffff secondary), subtle gradient highlight, no text, no shadow, transparent background, consistent 24x24 grid, friendly modern UI, slightly puffy lines, high contrast, SVG-like.
```

### Промты для генерации

**Navigation:**
- `icon-home.svg`: "Home icon, rounded house with heart-shaped doorway, STYLE PRESET"
- `icon-back.svg`: "Back arrow left, rounded thick arrow, STYLE PRESET"
- `icon-menu.svg`: "Menu icon, 3 rounded lines, STYLE PRESET"
- `icon-close.svg`: "Close X icon, rounded ends, STYLE PRESET"
- `icon-settings.svg`: "Gear icon, rounded gear teeth, STYLE PRESET"
- `icon-support.svg`: "Headset support icon, friendly, STYLE PRESET"

**Actions:**
- `icon-create.svg`: "Plus in rounded square, STYLE PRESET"
- `icon-edit.svg`: "Pencil edit icon, rounded, STYLE PRESET"
- `icon-delete.svg`: "Trash bin icon, rounded, STYLE PRESET"
- `icon-share.svg`: "Share arrow icon, rounded, STYLE PRESET"
- `icon-copy.svg`: "Copy two overlapping rounded rectangles, STYLE PRESET"
- `icon-view.svg`: "Eye icon, rounded, STYLE PRESET"
- `icon-save.svg`: "Bookmark/save icon, rounded, STYLE PRESET"
- `icon-cancel.svg`: "Circle with slash cancel icon, STYLE PRESET"

**Giveaway:**
- `icon-giveaway.svg`: "Gift box with ribbon, rounded, STYLE PRESET"
- `icon-winner.svg`: "Trophy icon, rounded, STYLE PRESET"
- `icon-participant.svg`: "User silhouette icon, rounded, STYLE PRESET"
- `icon-ticket.svg`: "Ticket stub icon, rounded, STYLE PRESET"
- `icon-boost.svg`: "Lightning bolt icon, rounded, STYLE PRESET"
- `icon-invite.svg`: "User plus icon, rounded, STYLE PRESET"
- `icon-story.svg`: "Story frame icon (rounded rectangle with sparkle), STYLE PRESET"
- `icon-calendar.svg`: "Calendar icon, rounded, STYLE PRESET"

**Status:**
- `icon-active.svg`: "Active circle with checkmark, rounded, STYLE PRESET"
- `icon-pending.svg`: "Clock pending icon, rounded, STYLE PRESET"
- `icon-completed.svg`: "Checkmark circle completed, rounded, STYLE PRESET"
- `icon-cancelled.svg`: "X circle cancelled, rounded, STYLE PRESET"
- `icon-error.svg`: "Alert circle error, rounded, STYLE PRESET"
- `icon-success.svg`: "Success checkmark circle, rounded, STYLE PRESET"

**Premium:**
- `icon-crown.svg`: "Crown icon, rounded, STYLE PRESET"
- `icon-star.svg`: "Star icon, rounded, STYLE PRESET"
- `icon-diamond.svg`: "Diamond gem icon, rounded, STYLE PRESET"
- `icon-lock.svg`: "Padlock icon, rounded, STYLE PRESET"

**Protection:**
- `icon-captcha.svg`: "Shield with check and tiny dots, STYLE PRESET"
- `icon-camera.svg`: "Camera icon, rounded, STYLE PRESET"
- `icon-shield.svg`: "Shield icon, rounded, STYLE PRESET"
- `icon-verify.svg`: "Checkmark badge icon, rounded, STYLE PRESET"

**Stats:**
- `icon-chart.svg`: "Bar chart icon, rounded bars, STYLE PRESET"
- `icon-analytics.svg`: "Line chart with nodes icon, rounded, STYLE PRESET"
- `icon-export.svg`: "Export arrow out of box icon, rounded, STYLE PRESET"
- `icon-filter.svg`: "Filter funnel icon, rounded, STYLE PRESET"

**Channels:**
- `icon-channel.svg`: "Broadcast tower icon, rounded, STYLE PRESET"
- `icon-group.svg`: "Multiple users icon, rounded, STYLE PRESET"
- `icon-add-channel.svg`: "Plus in circle, rounded, STYLE PRESET"
- `icon-subscribers.svg`: "Group of users, rounded, STYLE PRESET"

**Misc:**
- `icon-faq.svg`: "Question mark in rounded speech bubble, STYLE PRESET"
- `icon-info.svg`: "Info circle icon, rounded, STYLE PRESET"
- `icon-language.svg`: "Globe icon, rounded, STYLE PRESET"
- `icon-theme.svg`: "Magic wand / sparkle icon, rounded, STYLE PRESET"
- `icon-notification.svg`: "Bell icon, rounded, STYLE PRESET"
- `icon-refresh.svg`: "Refresh arrows icon, rounded, STYLE PRESET"

## Список отсутствующих иконок (TODO)

### Navigation (6)
- [ ] icon-home.svg
- [ ] icon-back.svg
- [ ] icon-menu.svg
- [ ] icon-close.svg
- [ ] icon-settings.svg
- [ ] icon-support.svg

### Actions (8)
- [ ] icon-create.svg
- [ ] icon-edit.svg
- [ ] icon-delete.svg
- [ ] icon-share.svg
- [ ] icon-copy.svg
- [ ] icon-view.svg
- [ ] icon-save.svg
- [ ] icon-cancel.svg

### Giveaway (8)
- [ ] icon-giveaway.svg
- [ ] icon-winner.svg
- [ ] icon-participant.svg
- [ ] icon-ticket.svg
- [ ] icon-boost.svg
- [ ] icon-invite.svg
- [ ] icon-story.svg
- [ ] icon-calendar.svg

### Status (6)
- [ ] icon-active.svg
- [ ] icon-pending.svg
- [ ] icon-completed.svg
- [ ] icon-cancelled.svg
- [ ] icon-error.svg
- [ ] icon-success.svg

### Premium (4)
- [ ] icon-crown.svg
- [ ] icon-star.svg
- [ ] icon-diamond.svg
- [ ] icon-lock.svg

### Protection (4)
- [ ] icon-captcha.svg
- [ ] icon-camera.svg
- [ ] icon-shield.svg
- [ ] icon-verify.svg

### Stats (4)
- [ ] icon-chart.svg
- [ ] icon-analytics.svg
- [ ] icon-export.svg
- [ ] icon-filter.svg

### Channels (4)
- [ ] icon-channel.svg
- [ ] icon-group.svg
- [ ] icon-add-channel.svg
- [ ] icon-subscribers.svg

### Misc (6)
- [ ] icon-faq.svg
- [ ] icon-info.svg
- [ ] icon-language.svg
- [ ] icon-theme.svg
- [ ] icon-notification.svg
- [ ] icon-refresh.svg

**Итого:** 50 иконок для генерации

## Где генерировать SVG иконки

1. **Midjourney / DALL-E** — с промтом выше + "export as SVG"
2. **Figma** — ручное создание с экспортом в SVG
3. **IconScout / Flaticon** — поиск готовых, редактирование цвета
4. **SVG Repo** — https://www.svgrepo.com/ (бесплатные SVG)
5. **Heroicons / Lucide** — скачать и перекрасить в #f2b6b6
