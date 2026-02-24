"""Update final task markers in TASKS-1, TASKS-3, TASKS-4"""

def update_tasks_1():
    filepath = 'tasks/TASKS-1-bot.md'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.splitlines()
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # 1.1 [~] -> [x] - webhook mode is now fully implemented
        if line == '### [~] Задача 1.1 — Каркас бота (grammy)':
            result.append('### [x] Задача 1.1 — Каркас бота (grammy)')
            i += 1
            # Update the "not implemented" notes
            while i < len(lines) and not lines[i].startswith('### '):
                subline = lines[i]
                if '❌ **Webhook mode**' in subline:
                    result.append('- ✅ **Webhook mode** — реализован через WEBHOOK_ENABLED=true в ENV')
                elif '❌ **Нет ENV BOT_MODE**' in subline:
                    result.append('- ✅ **ENV BOT_MODE** — переключение через WEBHOOK_ENABLED=true|false')
                else:
                    result.append(subline)
                i += 1
            continue
        # 1.11 [ ] -> [~] - 10 workers implemented, but some still missing
        elif line == '### [ ] Задача 1.11 — Планировщик (BullMQ jobs)':
            result.append('### [~] Задача 1.11 — Планировщик (BullMQ jobs)')
            i += 1
            in_block = True
            while i < len(lines) and not lines[i].startswith('### '):
                subline = lines[i]
                # Update the "implemented" section
                if '⚠️ **НЕ РЕАЛИЗОВАНО**: остальные 11+' in subline:
                    result.append('- ⚠️ **ЧАСТИЧНО РЕАЛИЗОВАНО**: 10 из 18+ jobs')
                elif subline == '- ❌ `subscription:expire` - истечение платных подписок':
                    result.append('- ✅ `subscription:expire` — ✅ реализован (jobs/subscription.ts)')
                elif subline == '- ❌ `subscription:auto-renew` - автопродление':
                    result.append('- ✅ `subscription:auto-renew` — ✅ реализован (jobs/subscription.ts)')
                elif subline == '- ❌ `subscription:expire-warning` - предупреждение за 3 дня':
                    result.append('- ✅ `subscription:expire-warning` — ✅ реализован (jobs/subscription.ts)')
                elif subline == '- ❌ `creator:milestone` - milestone уведомления (10/50/100...)':
                    result.append('- ✅ `creator:milestone` — ✅ реализован (jobs/milestones.ts)')
                elif subline == '- ❌ `sandbox:cleanup` - очистка sandbox розыгрышей':
                    result.append('- ✅ `sandbox:cleanup` — ✅ реализован (jobs/cleanup.ts)')
                elif subline == '- ❌ `badges:check` - пересчет бейджей':
                    result.append('- ✅ `badges:check` — ✅ реализован (jobs/cleanup.ts)')
                elif subline == '- ❌ `prize-form:cleanup` - очистка форм получения приза':
                    result.append('- ✅ `prize-form:cleanup` — ✅ реализован (jobs/cleanup.ts)')
                elif '**НЕ РЕАЛИЗОВАНО** (требует доп. информации' in subline:
                    result.append('**НЕ РЕАЛИЗОВАНО** (остаток):')
                else:
                    result.append(subline)
                i += 1
            continue
        # 1.12 [ ] -> [x] - inline mode implemented
        elif line == '### [ ] Задача 1.12 — Inline mode бота':
            result.append('### [x] Задача 1.12 — Inline mode бота')
            i += 1
            continue
        # 1.13 [ ] -> [x] - repost command now implemented
        elif line == '### [ ] Задача 1.13 — Команда /repost':
            result.append('### [x] Задача 1.13 — Команда /repost')
            i += 1
            while i < len(lines) and not lines[i].startswith('### '):
                subline = lines[i]
                if '**Реализовано:** ❌ 0%' in subline:
                    result.append('**Реализовано:** ✅ 100% (2026-02-24)')
                elif '❌ Нет команды `/repost`' in subline:
                    result.append('- ✅ `/repost:[shortCode]` — реализован через `bot.hears(/^\\/repost:?(.+)$/)` в `bot.ts`')
                    result.append('- ✅ Поиск по shortCode → отправка поста с WebApp кнопкой')
                else:
                    result.append(subline)
                i += 1
            continue
        # 1.14 [ ] -> [x] - already marked as implemented
        elif line == '### [ ] Задача 1.14 — Обработка ошибок доставки сообщений':
            result.append('### [x] Задача 1.14 — Обработка ошибок доставки сообщений')
            i += 1
            continue
        # 1.16 [ ] -> [x] - already marked as 100%
        elif line == '### [ ] Задача 1.16 — Обработка событий членства (chat_member)':
            result.append('### [x] Задача 1.16 — Обработка событий членства (chat_member)')
            i += 1
            continue
        # 1.18 [ ] -> [x] - notification settings UI now implemented
        elif line == '### [ ] Задача 1.18 — Уведомления создателю о участниках':
            result.append('### [x] Задача 1.18 — Уведомления создателю о участниках')
            i += 1
            while i < len(lines) and not lines[i].startswith('### '):
                subline = lines[i]
                if '❌ НЕТ настроек в боте для переключения режима уведомлений' in subline:
                    result.append('- ✅ Настройки уведомлений в боте — реализованы через Settings handler (MILESTONE/DAILY/OFF кнопки)')
                elif '❌ Поле `User.creatorNotificationMode` существует в Prisma, но не используется' in subline:
                    result.append('- ✅ `User.creatorNotificationMode` — используется через PATCH `/internal/users/:id/notification-mode`')
                elif '⚠️ Требуется UI в боте для управления настройками' in subline:
                    result.append('- ✅ UI реализован — кнопки MILESTONE/DAILY/OFF в меню Настройки с callback `notif_*`')
                else:
                    result.append(subline)
                i += 1
            continue
        # 1.19 [ ] -> [x] - admin commands all implemented
        elif line == '### [ ] Задача 1.19 — Админские бот-команды':
            result.append('### [x] Задача 1.19 — Админские бот-команды')
            i += 1
            continue
        else:
            result.append(line)
            i += 1

    new_content = '\n'.join(result)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Updated {filepath}")


def update_tasks_3():
    filepath = 'tasks/TASKS-3-participant.md'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.splitlines()
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # 3.3 [~] — CountdownTimer + ConfettiOverlay + Mascot now integrated
        if '### [~] Задача 3.3' in line:
            result.append(line)
            i += 1
            while i < len(lines) and not lines[i].startswith('### '):
                subline = lines[i]
                if 'CountdownTimer` компоненты существуют но НЕ используются' in subline or \
                   'CountdownTimer, ConfettiOverlay` — не подключены' in subline or \
                   'ConfettiOverlay не запускается' in subline:
                    result.append(subline + ' **→ ИСПРАВЛЕНО 2026-02-24: все компоненты интегрированы**')
                else:
                    result.append(subline)
                i += 1
            continue
        else:
            result.append(line)
            i += 1

    new_content = '\n'.join(result)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Updated {filepath}")


def check_tasks_4():
    filepath = 'tasks/TASKS-4-creator.md'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check what [~] remain
    pending = []
    for i, line in enumerate(content.splitlines()):
        if line.startswith('### [~]') or line.startswith('### [ ]'):
            pending.append(f"Line {i+1}: {line}")
    
    if pending:
        print(f"\n{filepath} pending items:")
        for p in pending:
            print(f"  {p}")
    else:
        print(f"\n{filepath}: No pending [~] or [ ] markers")


if __name__ == '__main__':
    update_tasks_1()
    update_tasks_3()
    check_tasks_4()
    print("\nDone!")
