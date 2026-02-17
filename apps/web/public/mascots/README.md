# 🎭 Lottie Mascots для RandomBeast

Эта папка содержит JSON файлы Lottie анимаций для маскотов приложения.

## Структура

```
mascots/
├── wizard/             # Маскоты для мастера создания (15 шт)
│   ├── wizard-type.json
│   ├── wizard-settings.json
│   ├── wizard-channels.json
│   ├── wizard-publish.json
│   ├── wizard-results.json
│   ├── wizard-calendar.json
│   ├── wizard-winners.json
│   ├── wizard-boost.json
│   ├── wizard-invite.json
│   ├── wizard-stories.json
│   ├── wizard-protection.json
│   ├── wizard-mascot.json
│   ├── wizard-promotion.json
│   ├── wizard-tasks.json
│   └── wizard-review.json
├── states/             # Маскоты состояний (6 шт)
│   ├── state-success.json
│   ├── state-error.json
│   ├── state-empty.json
│   ├── state-loading.json
│   ├── state-captcha.json
│   └── state-locked.json
├── participant/        # Маскоты для участников (3 шт)
│   ├── participant-joined.json
│   ├── participant-winner.json
│   └── participant-lost.json
└── characters/         # Маскоты-персонажи (6 шт)
    ├── mascot-free-default.json
    ├── mascot-paid-1.json
    ├── mascot-paid-2.json
    ├── mascot-paid-3.json
    ├── mascot-paid-4.json
    └── mascot-paid-5.json
```

**Итого: 30 Lottie JSON файлов**

## Где скачать Lottie анимации

Рекомендуемые источники бесплатных Lottie файлов:

1. **LottieFiles** — https://lottiefiles.com/
   - Огромная библиотека бесплатных анимаций
   - Фильтр по категориям: success, error, loading, celebration
   - Качественные анимации от сообщества

2. **IconScout** — https://iconscout.com/lotties
   - Бесплатные и платные Lottie
   - Премиум качество

3. **Lordicon** — https://lordicon.com/
   - Animated icons с поддержкой Lottie

## Требования к файлам

- Формат: `.json` (Lottie JSON)
- Размер файла: до 200 KB
- FPS: 30-60
- Длительность: 1-3 секунды (loop можно включить в коде)
- Стиль: минималистичный, соответствует бренду (#f2b6b6)

## Как добавить новый маскот

1. Скачать Lottie JSON файл
2. Переименовать в соответствии с именем (например, `my-mascot.json`)
3. Поместить в нужную категорию (participant/creator/loading)
4. Обновить `MASCOT_PATHS` в `Mascot.tsx`

## Примеры использования

```tsx
// Wizard маскот (мастер создания)
<Mascot type="wizard-type" size={200} />

// State маскот (состояния)
<Mascot type="state-success" size={150} />

// Participant маскот с loop (участник)
<Mascot type="participant-winner" size="10rem" loop />

// Character маскот (персонаж)
<Mascot type="mascot-paid-2" size={180} />

// Кастомный путь
<Mascot type="/mascots/custom/my-animation.json" size={150} />
```

## Prompt для генерации Lottie анимаций

Базовый стиль для всех анимаций:
> "Cute minimalist flat design, pink (#f2b6b6) and white colors, smooth animation, JSON Lottie format, [duration] seconds"

### Wizard маскоты (15 шт):

- **wizard-type**: "Choose option icon, select category, menu selection with pointer, STYLE"
- **wizard-settings**: "Settings gear rotating, configuration icon, customize, STYLE"
- **wizard-channels**: "Social media broadcast, megaphone, channel icon, STYLE"
- **wizard-publish**: "Rocket launch, send message, publish button press, STYLE"
- **wizard-results**: "Trophy podium, results announcement, winner reveal, STYLE"
- **wizard-calendar**: "Calendar date picker, schedule animation, date selection, STYLE"
- **wizard-winners**: "Gold medal, trophy winner, champion celebration, STYLE"
- **wizard-boost**: "Lightning bolt, energy boost, power up animation, STYLE"
- **wizard-invite**: "Add people, invite friends, team building, STYLE"
- **wizard-stories**: "Mobile phone story share, social share animation, STYLE"
- **wizard-protection**: "Security shield, protection icon, lock shield, STYLE"
- **wizard-mascot**: "Cute character waving, kawaii animal, friendly mascot, STYLE"
- **wizard-promotion**: "Marketing loudspeaker, advertising megaphone, promotion, STYLE"
- **wizard-tasks**: "Checklist completion, task list checked, todo done, STYLE"
- **wizard-review**: "Document review, checklist approve, verify check, STYLE"

### State маскоты (6 шт):

- **state-success**: "Success checkmark with confetti, celebration, hooray, STYLE"
- **state-error**: "Error sad face, oops animation, something went wrong, STYLE"
- **state-empty**: "Empty box open, no data, empty state illustration, STYLE"
- **state-loading**: "Cute loading animation, waiting hourglass, spinner, STYLE"
- **state-captcha**: "Robot check, bot detection, are you human question, STYLE"
- **state-locked**: "Locked padlock, premium feature locked, unlock animation, STYLE"

### Participant маскоты (3 шт):

- **participant-joined**: "Party celebration, congratulations confetti, hooray, STYLE"
- **participant-winner**: "Winner gold trophy, fireworks celebration, champion, STYLE"
- **participant-lost**: "Better luck next time, try again, sad but hopeful, STYLE"

### Character маскоты (6 шт):

- **mascot-free-default**: "Cute cat waving, friendly mascot, happy character, STYLE"
- **mascot-paid-1**: "Cool dog with sunglasses, puppy dance, playful, STYLE"
- **mascot-paid-2**: "Magical unicorn, rainbow unicorn, sparkles, STYLE"
- **mascot-paid-3**: "Cute panda waving, baby panda, friendly, STYLE"
- **mascot-paid-4**: "Smart fox, cute fox mascot, clever character, STYLE"
- **mascot-paid-5**: "Astronaut cat, space cosmonaut, rocket, STYLE"

## Список отсутствующих файлов (TODO)

### Wizard (15 файлов):
- [ ] `wizard/wizard-type.json`
- [ ] `wizard/wizard-settings.json`
- [ ] `wizard/wizard-channels.json`
- [ ] `wizard/wizard-publish.json`
- [ ] `wizard/wizard-results.json`
- [ ] `wizard/wizard-calendar.json`
- [ ] `wizard/wizard-winners.json`
- [ ] `wizard/wizard-boost.json`
- [ ] `wizard/wizard-invite.json`
- [ ] `wizard/wizard-stories.json`
- [ ] `wizard/wizard-protection.json`
- [ ] `wizard/wizard-mascot.json`
- [ ] `wizard/wizard-promotion.json`
- [ ] `wizard/wizard-tasks.json`
- [ ] `wizard/wizard-review.json`

### States (6 файлов):
- [ ] `states/state-success.json`
- [ ] `states/state-error.json`
- [ ] `states/state-empty.json`
- [ ] `states/state-loading.json`
- [ ] `states/state-captcha.json`
- [ ] `states/state-locked.json`

### Participant (3 файла):
- [ ] `participant/participant-joined.json`
- [ ] `participant/participant-winner.json`
- [ ] `participant/participant-lost.json`

### Characters (6 файлов):
- [ ] `characters/mascot-free-default.json`
- [ ] `characters/mascot-paid-1.json`
- [ ] `characters/mascot-paid-2.json`
- [ ] `characters/mascot-paid-3.json`
- [ ] `characters/mascot-paid-4.json`
- [ ] `characters/mascot-paid-5.json`

**Итого: 30 Lottie JSON файлов**
