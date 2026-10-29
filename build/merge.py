"""
把「貢獻檔」併入內建詞庫

用法：
  python3 build/merge.py GitHub多國語言-貢獻檔-2026-10-29.json          # 只併入「已確認」的譯文
  python3 build/merge.py contrib.json --machine                           # 連同機器翻譯一起併入
  python3 build/merge.py a.json b.json c.json                             # 一次合併多份

去向：
  zh-TW        → src/locales/zh-TW.extra.json（香港、簡中會由此自動轉換）
  zh-HK, zh-CN → src/locales/overrides/<語言>.json（覆寫自動轉換結果）
  ja           → src/locales/ja.json
  其他語言      → src/locales/overrides/<語言>.json（僅保存，需自行做成語言包）
  未翻譯清單    → src/locales/todo.json（依出現次數排序，方便集中翻譯）
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOC = os.path.normpath(os.path.join(HERE, '..', 'src', 'locales'))

def load(p, default):
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    return default

def save(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write('\n')

def target(lang):
    if lang == 'zh-TW': return os.path.join(LOC, 'zh-TW.extra.json')
    if lang == 'ja': return os.path.join(LOC, 'ja.json')
    return os.path.join(LOC, 'overrides', lang + '.json')

def main(argv):
    machine = '--machine' in argv
    files = [a for a in argv if not a.startswith('--')]
    if not files:
        print(__doc__); return 1
    base = load(os.path.join(LOC, 'base-entries.json'), {})
    base.update(load(os.path.join(LOC, 'zh-TW.extra.json'), {}))
    todo = load(os.path.join(LOC, 'todo.json'), {})
    ignored = set()
    stats = {}
    for fp in files:
        c = load(fp, None)
        if not c or c.get('format') != 'github-zh-tw-contrib':
            print('略過（不是貢獻檔）：', fp); continue
        ignored.update(c.get('ignored') or [])
        for lang, d in (c.get('langs') or {}).items():
            add = dict(d.get('machine') or {}) if machine else {}
            add.update(d.get('reviewed') or {})
            add = {k.strip(): v.strip() for k, v in add.items()
                   if k.strip() and k not in ignored and isinstance(v, str) and v.strip()}
            if not add: continue
            p = target(lang)
            cur = load(p, {})
            new = sum(1 for k in add if k not in cur)
            changed = sum(1 for k in add if k in cur and cur[k] != add[k])
            cur.update(add)
            save(p, cur)
            s = stats.setdefault(lang, [0, 0]); s[0] += new; s[1] += changed
            if lang == 'zh-TW': base.update(add)
        for k, e in (c.get('untranslated') or {}).items():
            t = todo.setdefault(k, {'n': 0, 'pages': []})
            t['n'] += e.get('n', 0)
            for pg in e.get('pages') or []:
                if pg not in t['pages'] and len(t['pages']) < 6: t['pages'].append(pg)
    # 已有台灣譯文或被忽略的就從待辦移除
    todo = {k: v for k, v in todo.items() if k not in base and k not in ignored}
    todo = dict(sorted(todo.items(), key=lambda kv: -kv[1]['n']))
    save(os.path.join(LOC, 'todo.json'), todo)
    for lang, (n, ch) in stats.items():
        print(f'{lang}: 新增 {n} 筆、更新 {ch} 筆 → {os.path.relpath(target(lang))}')
    print(f'待翻譯清單：{len(todo)} 筆 → {os.path.relpath(os.path.join(LOC, "todo.json"))}')
    print('完成後執行 python3 build/build.py 重新建置。')
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
