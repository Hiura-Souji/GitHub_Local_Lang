"""建置：python3 build/build.py  →  dist/ 下產生油猴腳本與 Chrome/Edge、Firefox 擴充"""
import json, os, shutil, zipfile
from locales import build as build_locales

VERSION = '2.5.0'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')

def read(p):
    with open(os.path.join(SRC, p), encoding='utf-8') as f:
        return f.read()

def write(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s)

locales = build_locales()
with open(os.path.join(SRC, 'locales', 'ignore.json'), encoding='utf-8') as f:
    DENY = json.load(f)
LOCALES_JS = ('const LOCALES = ' + json.dumps(locales, ensure_ascii=False, separators=(',', ':')) + ';\n' +
              'const DENY = ' + json.dumps(DENY, ensure_ascii=False, separators=(',', ':')) + ';\n')
CORE = read('core.js')
SHARED = read('shared.js')

shutil.rmtree(DIST, ignore_errors=True)
os.makedirs(DIST)

# ---------------- 油猴腳本 ----------------
USERSCRIPT_HEADER = f"""// ==UserScript==
// @name         GitHub多國語言
// @namespace    https://grayfree.tw/
// @version      {VERSION}
// @description  GitHub 多國語言介面：正體中文（台灣用語）、繁體中文（香港）、簡體中文、日本語，可隨時切換或保持原文；即時翻譯，自動收集並機器翻譯漏翻字串
// @author       格雷資訊
// @match        https://github.com/*
// @match        https://gist.github.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      translate.googleapis.com
// @connect      api.anthropic.com
// @connect      api.openai.com
// @connect      generativelanguage.googleapis.com
// @connect      api.deepseek.com
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @license      MIT
// @noframes
// ==/UserScript==
"""
USERSCRIPT_BODY = """
(function () {
  'use strict';
""" + LOCALES_JS + SHARED + CORE + """
  const MT = GitHubZhMT((url, opt) => new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      url, method: opt.method || 'GET', headers: opt.headers, data: opt.body, anonymous: true, timeout: 60000,
      onload: (r) => resolve({ status: r.status, text: r.responseText }),
      onerror: () => reject(new Error('無法連線到翻譯服務')),
      ontimeout: () => reject(new Error('翻譯服務逾時')),
    });
  }));
  // 多個分頁共用同一份紀錄：每次寫入前重新讀取
  const api = GitHubZhCore({
    get: (k, d) => GM_getValue(k, d),
    set: (k, v) => GM_setValue(k, v),
    clip: (t) => GM_setClipboard(t, 'text'),
    harvestAdd: (d) => GM_setValue('harvest', mergeHarvest(GM_getValue('harvest', {}) || {}, d)),
    harvestGet: async () => GM_getValue('harvest', {}) || {},
    harvestClear: async () => GM_setValue('harvest', {}),
    translate: (req) => MT.translate(GM_getValue('mt', MT_DEFAULT), req),
    mtInPage: true,
    listModels: (cfg) => MT.listModels(cfg),
    getMT: () => GM_getValue('mt', MT_DEFAULT),
    setMT: (cfg) => GM_setValue('mt', cfg),
  });
  GM_registerMenuCommand('⚙️ 語言與翻譯設定', () => api.openPanel());
  GM_registerMenuCommand('📝 審核與匯出翻譯', () => api.openPanel('review'));
  for (const L of api.languages()) {
    GM_registerMenuCommand('🌐 切換為：' + L.name, () => api.setLang(L.id));
  }
})();
"""
write(os.path.join(DIST, 'GitHub多國語言.user.js'), USERSCRIPT_HEADER + USERSCRIPT_BODY)

# ---------------- 瀏覽器擴充 ----------------
def manifest(firefox):
    m = {
        'manifest_version': 3,
        'name': 'GitHub多國語言',
        'short_name': 'GitHub多國語言',
        'version': VERSION,
        'description': 'GitHub 多國語言介面：正體中文（台灣用語）、繁體中文（香港）、簡體中文、日本語；即時翻譯，自動收集並機器翻譯漏翻字串。',
        'author': '格雷資訊',
        'icons': {s: f'icons/icon{s}.png' for s in ('16', '32', '48', '128')},
        'permissions': ['storage'],
        'host_permissions': ['https://translate.googleapis.com/*'],
        'optional_host_permissions': ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
        'options_ui': {'page': 'options.html', 'open_in_tab': True},
        'background': {'scripts': ['background.js']} if firefox else {'service_worker': 'background.js'},
        'action': {'default_popup': 'popup.html', 'default_title': 'GitHub多國語言',
                   'default_icon': {s: f'icons/icon{s}.png' for s in ('16', '32')}},
        'content_scripts': [{
            'matches': ['https://github.com/*', 'https://gist.github.com/*'],
            'js': ['content.js'],
            'run_at': 'document_start',
            'all_frames': False,
        }],
    }
    if firefox:
        m['browser_specific_settings'] = {'gecko': {'id': 'github-zh-tw@grayfree.tw', 'strict_min_version': '115.0',
                                                    'data_collection_permissions': {'required': ['none']}}}
    return m

CONTENT = "(function () {\n'use strict';\n" + LOCALES_JS + SHARED + CORE + read('extension/adapter.js') + '\n})();\n'
BACKGROUND = SHARED + read('extension/background.js')

for target, firefox in (('chrome', False), ('firefox', True)):
    d = os.path.join(DIST, target)
    os.makedirs(d)
    write(os.path.join(d, 'manifest.json'), json.dumps(manifest(firefox), ensure_ascii=False, indent=2))
    write(os.path.join(d, 'content.js'), CONTENT)
    write(os.path.join(d, 'background.js'), BACKGROUND)
    write(os.path.join(d, 'shared.js'), SHARED)
    for f in ('popup.html', 'popup.js', 'options.html', 'options.js'):
        shutil.copy(os.path.join(SRC, 'extension', f), d)
    shutil.copytree(os.path.join(SRC, 'extension', 'icons'), os.path.join(d, 'icons'))
    zp = os.path.join(DIST, f'GitHub多國語言-{target}-v{VERSION}.zip')
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(d):
            for fn in files:
                full = os.path.join(base, fn)
                z.write(full, os.path.relpath(full, d))

print('built', VERSION, {k: len(v['entries']) for k, v in locales.items()})
