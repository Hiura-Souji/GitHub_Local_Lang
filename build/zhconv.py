"""極簡 OpenCC 轉換器（最大正向匹配），只在建置時使用。"""
import os
D = os.environ.get('OPENCC_DICT', '/tmp/claude-0/OpenCC/data/dictionary')

def _load(name, reverse=False):
    m = {}
    with open(os.path.join(D, name + '.txt'), encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            if not line or line.startswith('#') or '\t' not in line: continue
            k, v = line.split('\t', 1)
            vals = v.split(' ')
            if reverse:
                for x in vals:
                    m.setdefault(x, k)
            else:
                m[k] = vals[0]
    return m

def _stage(*dicts):
    merged = {}
    for d in reversed(dicts):  # 前面的優先
        merged.update(d)
    maxlen = max(len(k) for k in merged)
    def conv(s):
        out, i = [], 0
        while i < len(s):
            for L in range(min(maxlen, len(s) - i), 0, -1):
                seg = s[i:i+L]
                if seg in merged:
                    out.append(merged[seg]); i += L; break
            else:
                out.append(s[i]); i += 1
        return ''.join(out)
    return conv

_tw2sp = None
_t2hk = None

def tw2sp(s):
    global _tw2sp
    if _tw2sp is None:
        a = _stage(_load('TWPhrasesRev'), _load('TWVariantsRevPhrases'), _load('TWVariants', reverse=True))
        b = _stage(_load('TSPhrases'), _load('TSCharacters'))
        _tw2sp = lambda x: b(a(x))
    return _tw2sp(s)

def t2hk(s):
    global _t2hk
    if _t2hk is None:
        _t2hk = _stage(_load('HKVariantsPhrases'), _load('HKVariants'))
    return _t2hk(s)

if __name__ == '__main__':
    t = '儲存庫 程式碼 軟體 網路 預設 檔案 登入 使用者 資訊 訊息 專案 剪貼簿 原始碼 裡面 線上 群組 執行 匯入 範本 快取'
    print(tw2sp(t)); print(t2hk(t))
