"""Check task markers across all TASKS files"""
import os
import re

tasks_dir = 'tasks'
files = sorted([f for f in os.listdir(tasks_dir) if f.startswith('TASKS-') and f.endswith('.md')])

total_done = 0
total_partial = 0
total_todo = 0

for fname in files:
    filepath = os.path.join(tasks_dir, fname)
    with open(filepath, encoding='utf-8') as f:
        content = f.read()
    
    done = len(re.findall(r'### \[x\]', content))
    partial = len(re.findall(r'### \[~\]', content))
    todo = len(re.findall(r'### \[ \]', content))
    
    total_done += done
    total_partial += partial
    total_todo += todo
    
    print(f"{fname}: [x]={done}, [~]={partial}, [ ]={todo}")

print(f"\nTOTAL: [x]={total_done}, [~]={total_partial}, [ ]={total_todo}")
print(f"Grand total: {total_done + total_partial + total_todo} tasks")
