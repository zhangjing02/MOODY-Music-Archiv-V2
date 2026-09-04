import json

log_path = r'C:\Users\zhangjing\.gemini\antigravity\brain\9b5c1cfb-21b1-4294-a472-50c3b1a821ac\.system_generated\logs\transcript.jsonl'
with open(log_path, 'r', encoding='utf-8', errors='replace') as f:
    for line in f:
        data = json.loads(line)
        if data.get('step_index') in [13, 21, 23]:
            print(f"=== STEP {data.get('step_index')} ===")
            print("Tool calls:", json.dumps(data.get('tool_calls', []), ensure_ascii=True)[:300])
            print("Content:", ascii(str(data.get('content', ''))[:300]))
