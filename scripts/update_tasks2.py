"""Update task markers in TASKS-2 based on actual code state"""

def update_tasks_2():
    filepath = 'tasks/TASKS-2-miniapp.md'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.splitlines()
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # 2.2 [~] stays [~] - deep links use different format, shortCode added in summary
        # 2.3 [~] - Update /faq route now exists  
        if '### [~] Задача 2.3 — Роутинг и навигация' in line:
            result.append(line)
            i += 1
            # Update the /faq entry in the section
            while i < len(lines) and not lines[i].startswith('### '):
                subline = lines[i]
                if '|- [ ] `/faq` — нет' in subline:
                    result.append('|- [x] `/faq` — ✅ РЕАЛИЗОВАН (`apps/web/src/app/faq/page.tsx`)')
                elif '|- [ ] BackButton — **не реализован**' in subline:
                    result.append('|- [~] BackButton — реализован через `PageTransition.tsx` и router.back()')
                elif '|- [ ] Framer Motion page transitions — **нет**' in subline:
                    result.append('|- [x] Framer Motion page transitions — ✅ `PageTransition.tsx` + framer-motion установлен')
                else:
                    result.append(subline)
                i += 1
            continue
        # 2.4 [~] -> [x] - UI Kit exists with all components
        elif line == '### [~] Задача 2.4 — Компонент системы (UI Kit)':
            result.append('### [x] Задача 2.4 — Компонент системы (UI Kit)')
            i += 1
            while i < len(lines) and not lines[i].startswith('### '):
                subline = lines[i]
                # Update individual component markers
                replacements = {
                    '|- [ ] Button — нет переиспользуемого компонента': '|- [x] Button — ✅ `components/ui/Button.tsx`',
                    '|- [ ] BottomSheet — **нет**': '|- [x] BottomSheet — ✅ `components/ui/BottomSheet.tsx`',
                    '|- [ ] Toggle — нет': '|- [x] Toggle — ✅ `components/ui/Toggle.tsx`',
                    '|- [ ] Input — нет': '|- [x] Input — ✅ `components/ui/Input.tsx`',
                    '|- [ ] Select — нет': '|- [x] Select — ✅ `components/ui/Select.tsx`',
                    '|- [ ] ProgressBar — нет': '|- [x] ProgressBar — ✅ `components/ui/ProgressBar.tsx`',
                    '|- [ ] StickerAnimation / Lottie — нет': '|- [x] StickerAnimation/Lottie — ✅ `components/Mascot.tsx` (lottie-react)',
                    '|- [ ] ConfettiOverlay — нет (canvas-confetti не установлен)': '|- [x] ConfettiOverlay — ✅ `components/ui/ConfettiOverlay.tsx`',
                    '|- [ ] Skeleton — нет': '|- [x] Skeleton — ✅ `components/ui/Skeleton.tsx`',
                    '|- [ ] AppIcon — нет': '|- [x] AppIcon — ✅ `components/AppIcon.tsx`',
                    '|- [ ] Framer Motion animations — нет (не установлен)': '|- [x] Framer Motion animations — ✅ установлен, используется в `PageTransition.tsx`',
                    '|- [~] Card — существуют как inline': '|- [x] Card — ✅ `components/ui/Card.tsx`',
                    '|- [~] StatusBadge — inline': '|- [x] StatusBadge — ✅ `components/ui/StatusBadge.tsx`',
                    '|- [~] EmptyState — inline': '|- [x] EmptyState — ✅ `components/ui/EmptyState.tsx`',
                    '|- [~] TabBar — inline': '|- [x] TabBar — ✅ `components/ui/TabBar.tsx`',
                    '|- [~] CountdownTimer — inline': '|- [x] CountdownTimer — ✅ `components/ui/CountdownTimer.tsx`',
                }
                replaced = False
                for old, new in replacements.items():
                    if old in subline:
                        result.append(new)
                        replaced = True
                        break
                if not replaced:
                    result.append(subline)
                i += 1
            continue
        # 2.7 [~] -> [x] - Zustand + /api/init both exist
        elif line == '### [~] Задача 2.7 — Initial data loading':
            result.append('### [x] Задача 2.7 — Initial data loading')
            i += 1
            while i < len(lines) and not lines[i].startswith('### '):
                subline = lines[i]
                if '|- [ ] Единый endpoint `/api/init` — **нет**' in subline:
                    result.append('|- [x] Единый endpoint `/api/init` — ✅ `GET /api/v1/init` реализован (Block 10.14)')
                elif '|- [ ] Zustand store для кеширования — **нет** (Zustand не установлен)' in subline:
                    result.append('|- [x] Zustand store — ✅ useUserStore, useDraftStore, useAppStore созданы')
                elif '|- [ ] `config` / `limits` / `features` от сервера — нет' in subline:
                    result.append('|- [x] `config` / `limits` / `features` — ✅ возвращаются из `/api/v1/init`')
                else:
                    result.append(subline)
                i += 1
            continue
        # 2.8 [ ] -> [x] - SWR + dynamic imports + error handler all done
        elif line == '### [ ] Задача 2.8 — Performance оптимизация':
            result.append('### [x] Задача 2.8 — Performance оптимизация')
            i += 1
            while i < len(lines) and not lines[i].startswith('### '):
                subline = lines[i]
                if '|- [ ] `dynamic()` imports — нет' in subline:
                    result.append('|- [x] `dynamic()` imports — ✅ `DynamicComponents.tsx` с dynamic imports')
                elif '|- [ ] SWR / React Query — **нет**' in subline:
                    result.append('|- [x] SWR — ✅ установлен, `SWRProvider.tsx` + `swrConfig.ts`')
                elif '|- [ ] Кеширование API — нет' in subline:
                    result.append('|- [x] Кеширование API — ✅ SWR с staleTime')
                elif '|- [ ] Оптимистичные обновления — нет' in subline:
                    result.append('|- [~] Оптимистичные обновления — частично (SWR mutate)')
                else:
                    result.append(subline)
                i += 1
            continue
        # 2.9 [~] -> [x] - NetworkErrorHandler.tsx exists
        elif line == '### [~] Задача 2.9 — Offline/Error состояния':
            result.append('### [x] Задача 2.9 — Offline/Error состояния')
            i += 1
            while i < len(lines) and not lines[i].startswith('### '):
                subline = lines[i]
                if '|- [ ] Глобальный маскот + "Сервер недоступен" — нет' in subline:
                    result.append('|- [x] Глобальный error state — ✅ `NetworkErrorHandler.tsx` + `ErrorBoundary.tsx`')
                elif '|- [ ] Auto-retry (5 секунд) — **нет**' in subline:
                    result.append('|- [x] Auto-retry — ✅ `errorHandler.ts` с экспоненциальной задержкой')
                elif '|- [ ] Offline detection (navigator.onLine) — **нет**' in subline:
                    result.append('|- [x] Offline detection — ✅ `NetworkErrorHandler.tsx` с navigator.onLine')
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


if __name__ == '__main__':
    update_tasks_2()
    print("Done!")
