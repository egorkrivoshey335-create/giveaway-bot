"""Update task markers in TASKS files"""
import sys

def update_tasks_10():
    filepath = 'tasks/TASKS-10-api.md'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Update summary table
    old_lines = [
        '| 2 | 10.7, 10.8 |',
    ]
    
    # Find and replace the summary section
    lines = content.splitlines()
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if '| 2 | 10.7, 10.8 |' in line:
            # Replace the 3 table rows + empty line + итого line
            result.append('| ✅ [x] | 21 | 10.1, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 10.14, 10.15, 10.16, 10.17, 10.18, 10.20, 10.21, 10.22, 10.23, 10.24, 10.25 |')
            i += 1
        elif '| 14 | 10.1, 10.2, 10.3, 10.4,' in line:
            result.append('|| 🟡 [~] | 3 | 10.2, 10.3, 10.4 (архитектурное решение: каналы/посты через бота) |')
            i += 1
        elif '| 9 | 10.12, 10.14,' in line:
            result.append('|| ❌ [ ] | 1 | 10.19 (Liveness Check — сложная feature, отложена) |')
            i += 1
        elif 'Итого: 2 полностью' in line:
            result.append('**Итого: 21 полностью ✅ / 3 частично 🟡 (по дизайну) / 1 не реализовано ❌ (отложено)**')
            result.append('')
            result.append('*Обновлено: 2026-02-24 — глобальный аудит*')
            i += 1
        else:
            result.append(line)
            i += 1
    
    new_content = '\n'.join(result)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Updated {filepath}")


def update_tasks_7():
    filepath = 'tasks/TASKS-7-security.md'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.splitlines()
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Update 7.5 [~] -> [x]
        if line == '### [~] Задача 7.5 — Валидация Telegram initData':
            result.append('### [x] Задача 7.5 — Валидация Telegram initData')
            i += 1
        # Update 7.6 [~] -> [x]
        elif line == '### [~] Задача 7.6 — Rate Limiting и DDoS защита':
            result.append('### [x] Задача 7.6 — Rate Limiting и DDoS защита')
            i += 1
        # Update 7.8 [~] -> [x] (Redis lock was implemented)
        elif line == '### [~] Задача 7.8 — Race condition при участии':
            result.append('### [x] Задача 7.8 — Race condition при участии')
            i += 1
        # Update summary stats
        elif '8 задач ПОЛНОСТЬЮ реализовано' in line and '7.1, 7.3,' in line:
            result.append('- ✅ **11 задач ПОЛНОСТЬЮ реализовано** (7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12)')
            i += 1
        elif '~ **2 задачи частично реализовано** (7.6, 7.8)' in line:
            # skip old partial line
            i += 1
        else:
            result.append(line)
            i += 1
    
    new_content = '\n'.join(result)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Updated {filepath}")


def update_tasks_11():
    filepath = 'tasks/TASKS-11-site.md'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    print(f"Read {filepath}, length={len(content)}")
    # Check if there are any [~] markers
    if '[~]' in content:
        print("Found [~] markers in TASKS-11")
        for i, line in enumerate(content.splitlines()):
            if '[~]' in line:
                print(f"  Line {i+1}: {line}")
    else:
        print("No [~] markers found in TASKS-11 - all good")


if __name__ == '__main__':
    update_tasks_10()
    update_tasks_7()
    update_tasks_11()
    print("Done!")
