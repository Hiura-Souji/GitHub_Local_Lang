/*
 * 共用工具（油猴腳本與擴充背景服務使用）
 * - mergeHarvest：合併「收集到的未翻譯字串」
 * - GitHubZhMT：機器翻譯（Google 免費端點／OpenAI 相容 API）
 */

const HARVEST_CAP = 5000;

// h: 既有紀錄 { 原文: { n: 次數, p: [頁面類型], f: 首次時間, l: 最後時間 } }
// d: 本次新增 { 原文: { n, p: [頁面類型] } }
function mergeHarvest(h, d) {
  const now = Date.now();
  for (const t of Object.keys(d)) {
    const e = h[t] || (h[t] = { n: 0, p: [], f: now });
    e.n += d[t].n || 1;
    for (const p of d[t].p || []) if (e.p.indexOf(p) < 0 && e.p.length < 6) e.p.push(p);
    e.l = now;
  }
  const keys = Object.keys(h);
  if (keys.length > HARVEST_CAP) {
    keys.sort((a, b) => (h[a].l || 0) - (h[b].l || 0));
    for (let i = 0; i < keys.length - HARVEST_CAP; i++) delete h[keys[i]];
  }
  return h;
}

const MT_DEFAULT = { provider: 'google', preset: 'google', endpoint: '', key: '', model: '' };

// 服務預設值；model 留空時，取得模型清單後自動挑選（prefer）
const MT_PRESETS = {
  anthropic: { provider: 'anthropic', endpoint: 'https://api.anthropic.com/v1', model: '', prefer: [/haiku/, /sonnet/] },
  openai: { provider: 'openai', endpoint: 'https://api.openai.com/v1', model: '', prefer: [/^gpt-[\d.]+-mini$/, /mini/] },
  gemini: { provider: 'openai', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: '', prefer: [/flash(?!.*(lite|preview|exp|thinking))/, /flash/] },
  deepseek: { provider: 'openai', endpoint: 'https://api.deepseek.com/v1', model: '', prefer: [/deepseek-chat/] },
  ollama: { provider: 'openai', endpoint: 'http://localhost:11434/v1', model: '', prefer: [/qwen/, /gemma/, /llama/] },
  custom: { provider: 'openai', endpoint: '', model: '', prefer: [] },
};
function presetOf(cfg) {
  if (!cfg || cfg.provider === 'google') return 'google';
  if (cfg.preset && MT_PRESETS[cfg.preset]) return cfg.preset;
  return cfg.provider === 'anthropic' ? 'anthropic' : 'custom';
}
// 從清單挑一個適合翻譯的模型（便宜、快速）
function pickModel(preset, list, current) {
  if (current && list.indexOf(current) >= 0) return current;
  const pre = MT_PRESETS[preset];
  for (const re of (pre && pre.prefer) || []) { const hit = list.find((m) => re.test(m)); if (hit) return hit; }
  return list[0] || '';
}

// 校正常見的 API 網址寫法（例如貼了 Gemini 的 /v1beta/models 或完整的 /chat/completions）
function normalizeEndpoint(ep) {
  let u = String(ep || '').trim().replace(/\/+$/, '');
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  u = u.replace(/\/chat\/completions$/i, '').replace(/\/models(\/[^/]*)?$/i, (m) => (/generativelanguage/.test(u) ? m : ''));
  const m = /^(https?:\/\/generativelanguage\.googleapis\.com)(\/.*)?$/i.exec(u);
  if (m && !/\/openai$/i.test(u)) u = m[1] + '/v1beta/openai';
  if (/^https?:\/\/api\.openai\.com$/i.test(u) || /^https?:\/\/api\.deepseek\.com$/i.test(u)) u += '/v1';
  if (/^https?:\/\/(localhost|127\.0\.0\.1):11434$/i.test(u)) u += '/v1';
  if (/^https?:\/\/api\.anthropic\.com/i.test(u)) u = 'https://api.anthropic.com/v1';
  return u;
}
function normalizeModel(m) {
  return String(m || '').trim().replace(/^models\//, '');
}

/*
 * http(url, { method, headers, body }) → Promise<{ status, text }>
 * 由各環境提供（油猴：GM_xmlhttpRequest；擴充：背景 fetch）
 */
function GitHubZhMT(http) {
  const GOOGLE_TL = { 'zh-TW': 'zh-TW', 'zh-HK': 'zh-TW', 'zh-CN': 'zh-CN', ja: 'ja' };

  // Google 翻譯常見的非台灣用語修正
  const FIX = {
    'zh-TW': [
      [/存儲庫|存放庫|倉庫/g, '儲存庫'], [/拉取請求|拉請求|提取請求/g, '合併請求'], [/代碼/g, '程式碼'],
      [/軟件/g, '軟體'], [/默認/g, '預設'], [/鏈接/g, '連結'], [/文件夾/g, '資料夾'], [/登錄/g, '登入'],
      [/用戶/g, '使用者'], [/叉子/g, '分叉'], [/信息/g, '資訊'], [/視頻/g, '影片'], [/設置/g, '設定'],
      [/網絡/g, '網路'], [/緩存/g, '快取'], [/項目/g, '專案'], [/運行/g, '執行'], [/導入/g, '匯入'], [/導出/g, '匯出'],
    ],
    'zh-HK': [[/存放庫|倉庫/g, '存儲庫'], [/拉取請求|提取請求/g, '合併請求'], [/代碼/g, '程式碼']],
    'zh-CN': [[/存储库|存放库/g, '仓库']],
  };
  function fix(lang, s) {
    for (const [re, to] of FIX[lang] || []) s = s.replace(re, to);
    return s.trim();
  }

  async function googleOne(text, tl) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&dt=t&tl=' +
      encodeURIComponent(tl) + '&q=' + encodeURIComponent(text);
    const r = await http(url, { method: 'GET' });
    if (r.status !== 200) throw new Error('Google 翻譯 HTTP ' + r.status);
    const data = JSON.parse(r.text);
    return (data[0] || []).map((s) => s[0] || '').join('');
  }

  async function google(texts, lang) {
    const tl = GOOGLE_TL[lang] || lang;
    const out = {};
    // 以換行合併成數批（每批約 1500 字元），回傳行數不符時改逐筆翻譯
    const chunks = [];
    let cur = [], len = 0;
    for (const t of texts) {
      if (cur.length && len + t.length > 1500) { chunks.push(cur); cur = []; len = 0; }
      cur.push(t); len += t.length + 1;
    }
    if (cur.length) chunks.push(cur);
    for (const c of chunks) {
      const res = (await googleOne(c.join('\n'), tl)).split('\n');
      if (res.length === c.length) c.forEach((t, i) => { out[t] = fix(lang, res[i]); });
      else for (const t of c) out[t] = fix(lang, await googleOne(t, tl));
    }
    return out;
  }

  const STYLE = {
    'zh-TW': 'Use Traditional Chinese with Taiwan terminology (e.g. 程式碼, 軟體, 預設, 檔案, 資訊, 使用者, 登入, 設定, 網路, 專案). Never use Mainland China terms. Address the user as 你, never 您. Use full-width punctuation (，。：！？「」).',
    'zh-HK': 'Use Traditional Chinese as written in Hong Kong software UIs. Address the user as 你.',
    'zh-CN': 'Use Simplified Chinese matching GitHub official Chinese documentation.',
    ja: 'Use natural Japanese UI wording matching GitHub Docs (docs.github.com/ja).',
  };

  function systemPrompt(req) {
    const glossary = Object.entries(req.glossary || {}).map(([k, v]) => `${k} = ${v}`).join('; ');
    return `You translate UI strings of the GitHub website from English into ${req.langName || req.lang} (${req.lang}). ` +
      (STYLE[req.lang] || '') +
      (glossary ? ` Use this terminology consistently: ${glossary}.` : '') +
      ' Keep product names (GitHub, Copilot, Actions, Codespaces, Gist, Dependabot), code, numbers and symbols such as "…" unchanged.' +
      ' Strings are short UI labels, buttons, tooltips or sentence fragments; translate them concisely like native UI text.' +
      ' Placeholders such as {n}, {n2}, {date}, {repo}, {user} must be kept exactly as written (you may reorder them).' +
      ' Placeholders {0}, {1}, {2}… mark links or keys inside a sentence: keep each exactly once and keep them in ascending order.' +
      ' Do not translate proper names (people, organizations, repositories, products, apps, brands, places) or code; if an item is only such a name, return it unchanged.' +
      ' The input is a numbered list, one string per line. Reply with exactly one line per item in the form "<number>. <translation>",' +
      ' keeping the same numbers and order. Output nothing else: no explanations, no quotes around translations, no code fences.';
  }
  function userPrompt(texts) {
    return texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  }
  function httpError(r, url) {
    let detail = '';
    try { const j = JSON.parse(r.text); const e = Array.isArray(j) ? j[0].error : j.error; detail = (e && (e.message || e.type)) || ''; } catch (e) { detail = (r.text || '').slice(0, 160); }
    const hint = r.status === 404 ? '（網址或模型不正確，請重新取得模型清單）'
      : r.status === 401 || r.status === 403 ? '（API 金鑰無效或沒有權限）'
        : r.status === 429 ? '（超過用量限制，請稍後再試）' : '';
    return new Error(`HTTP ${r.status}${hint}　${detail}`.trim());
  }
  // 解析回覆：優先用「編號. 譯文」逐行格式，失敗再嘗試 JSON；都不行就丟出可重試的錯誤
  function parseError() { const e = new Error('翻譯服務回傳的格式無法解析'); e.parse = true; return e; }
  function clean(v) {
    v = String(v).trim();
    if (/^".*"$/.test(v)) v = v.slice(1, -1).trim();
    return v;
  }
  function parseResult(texts, content) {
    const body = String(content || '').replace(/^\s*```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const out = {};
    for (const line of body.split(/\r?\n/)) {
      const m = /^\s*\[?(\d{1,3})\]?\s*[.．:：、)\]）\t-]\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      const t = texts[+m[1] - 1], v = clean(m[2]);
      if (t && v && !(t in out)) out[t] = v;
    }
    if (Object.keys(out).length) return out;
    try {
      const j = /[[{][\s\S]*[\]}]/.exec(body);
      const obj = j && JSON.parse(j[0]);
      if (Array.isArray(obj)) texts.forEach((t, i) => { if (typeof obj[i] === 'string' && obj[i].trim()) out[t] = clean(obj[i]); });
      else if (obj) for (const t of texts) if (typeof obj[t] === 'string' && obj[t].trim()) out[t] = clean(obj[t]);
    } catch (e) { /* 交給下面處理 */ }
    if (Object.keys(out).length) return out;
    if (texts.length === 1 && body && body.indexOf('\n') < 0 && !/^[[{]/.test(body) && body.length < texts[0].length * 4 + 40) {
      return { [texts[0]]: clean(body) };
    }
    throw parseError();
  }

  // OpenAI 相容 API（OpenAI、Gemini、DeepSeek、Ollama、OpenRouter…）
  async function openai(texts, req, cfg) {
    const base = normalizeEndpoint(cfg.endpoint || MT_PRESETS.openai.endpoint);
    const model = normalizeModel(cfg.model);
    if (!model) throw new Error('尚未選擇模型，請先取得模型清單');
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.key) headers.Authorization = 'Bearer ' + cfg.key;
    const url = base + '/chat/completions';
    const r = await http(url, {
      method: 'POST', headers,
      body: JSON.stringify({
        model, temperature: 0,
        messages: [{ role: 'system', content: systemPrompt(req) }, { role: 'user', content: userPrompt(texts) }],
      }),
    });
    if (r.status !== 200) throw httpError(r, url);
    let content;
    try { content = JSON.parse(r.text).choices[0].message.content; } catch (e) { throw parseError(); }
    return parseResult(texts, content);
  }

  // Anthropic Claude（Messages API）
  function anthropicHeaders(cfg) {
    return {
      'Content-Type': 'application/json', 'x-api-key': cfg.key || '', 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }
  async function anthropic(texts, req, cfg) {
    const model = normalizeModel(cfg.model);
    if (!model) throw new Error('尚未選擇模型，請先取得模型清單');
    const url = 'https://api.anthropic.com/v1/messages';
    const r = await http(url, {
      method: 'POST', headers: anthropicHeaders(cfg),
      body: JSON.stringify({
        model, max_tokens: 4096, temperature: 0, system: systemPrompt(req),
        messages: [{ role: 'user', content: userPrompt(texts) }],
      }),
    });
    if (r.status !== 200) throw httpError(r, url);
    let content;
    try { content = (JSON.parse(r.text).content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''); } catch (e) { throw parseError(); }
    return parseResult(texts, content);
  }

  // 取得可用模型清單（只留下適合文字生成的模型）
  const EXCLUDE = /embed|tts|whisper|dall-e|image|imagen|veo|audio|realtime|transcribe|moderation|search|aqa|vision-only|computer-use|babbage|davinci|live|native/i;
  async function listModels(cfg) {
    cfg = Object.assign({}, MT_DEFAULT, cfg || {});
    const preset = presetOf(cfg);
    if (preset === 'google') return [];
    let url, headers, r;
    if (cfg.provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/models?limit=100';
      headers = anthropicHeaders(cfg);
    } else {
      url = normalizeEndpoint(cfg.endpoint) + '/models';
      headers = cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {};
    }
    r = await http(url, { method: 'GET', headers });
    if (r.status !== 200) throw httpError(r, url);
    const j = JSON.parse(r.text);
    let ids = (j.data || j.models || []).map((m) => normalizeModel(m.id || m.name)).filter(Boolean);
    ids = ids.filter((id) => !EXCLUDE.test(id));
    if (preset === 'openai') ids = ids.filter((id) => /^(gpt|o\d|chatgpt)/.test(id));
    if (preset === 'gemini') ids = ids.filter((id) => /^gemini|^gemma/.test(id));
    return [...new Set(ids)].sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  }

  // req: { lang, langName, texts: [], glossary: {} }
  async function translate(cfg, req) {
    cfg = Object.assign({}, MT_DEFAULT, cfg || {});
    const texts = (req.texts || []).filter((t) => typeof t === 'string' && t && t.indexOf('\n') < 0);
    if (!texts.length) return {};
    if (cfg.provider === 'google') return google(texts, req.lang);
    const fn = cfg.provider === 'anthropic' ? anthropic : openai;
    // 回覆無法解析時拆成兩半重試，避免一筆怪字串拖垮整批
    async function run(list, depth) {
      try { return await fn(list, req, cfg); } catch (e) {
        if (e.parse && list.length === 1) return {}; // 單筆仍無法解析就略過
        if (!e.parse || depth > 4) throw e;
        const h = list.length >> 1;
        return Object.assign(await run(list.slice(0, h), depth + 1), await run(list.slice(h), depth + 1));
      }
    }
    const out = await run(texts, 0);
    if (!Object.keys(out).length) throw parseError();
    return out;
  }

  return { translate, listModels };
}

/*
 * 翻譯服務設定表單（油猴面板與擴充設定頁共用）
 * root：容器元素；io：{ load(): cfg, save(cfg), listModels(cfg): Promise<[]>, beforeRemote(cfg): Promise }
 */
function mountMTForm(root, io) {
  root.innerHTML = `
    <div class="mt-grid">
      <span>翻譯服務</span>
      <select class="mt-prov">
        <option value="google">Google 翻譯（免費、免金鑰）</option>
        <option value="anthropic">Anthropic Claude</option>
        <option value="openai">OpenAI</option>
        <option value="gemini">Google Gemini</option>
        <option value="deepseek">DeepSeek</option>
        <option value="ollama">Ollama（本機）</option>
        <option value="custom">其他 OpenAI 相容 API</option>
      </select>
      <span class="mt-ai mt-epl">API 網址</span><input class="mt-ai mt-ep" type="text" placeholder="https://…/v1">
      <span class="mt-ai">API 金鑰</span><input class="mt-ai mt-key" type="password" autocomplete="off" placeholder="貼上 API 金鑰">
      <span class="mt-ai">模型</span>
      <div class="mt-ai mt-mrow"><select class="mt-model"><option value="">（請先取得模型清單）</option></select><button type="button" class="mt-fetch">取得模型清單</button></div>
      <span class="mt-ai mt-customl" style="display:none"></span><input class="mt-ai mt-custom" type="text" placeholder="輸入模型名稱" style="display:none">
    </div>
    <div class="mt-row"><button type="button" class="mt-save mt-primary">儲存</button><button type="button" class="mt-test">測試翻譯</button></div>
    <div class="mt-msg"></div>`;
  const $ = (s) => root.querySelector(s);
  const prov = $('.mt-prov'), ep = $('.mt-ep'), key = $('.mt-key'), model = $('.mt-model'), custom = $('.mt-custom');
  const say = (t, err) => { const m = $('.mt-msg'); m.textContent = t; m.className = 'mt-msg' + (err ? ' mt-err' : ''); };
  let models = [];

  function fillModels(list, selected) {
    models = list;
    model.innerHTML = '';
    if (!list.length) model.add(new Option('（請先取得模型清單）', ''));
    for (const m of list) model.add(new Option(m, m));
    model.add(new Option('自訂模型名稱…', '__custom__'));
    if (selected && list.indexOf(selected) < 0) { model.value = '__custom__'; custom.value = selected; }
    else model.value = selected || (list[0] || '');
    syncCustom();
  }
  function syncCustom() {
    const show = model.value === '__custom__' && prov.value !== 'google';
    custom.style.display = show ? '' : 'none';
    $('.mt-customl').style.display = show ? '' : 'none';
  }
  function sync() {
    const p = prov.value;
    root.querySelectorAll('.mt-ai').forEach((n) => { n.style.display = p === 'google' ? 'none' : ''; });
    // Claude 與官方服務的網址固定，只有自訂與 Ollama 需要填
    const showEp = p === 'custom' || p === 'ollama';
    ep.style.display = showEp ? '' : 'none';
    $('.mt-epl').style.display = showEp ? '' : 'none';
    key.placeholder = p === 'ollama' ? '本機服務不需要金鑰' : p === 'anthropic' ? 'sk-ant-…' : '貼上 API 金鑰';
    syncCustom();
  }
  function read() {
    const p = prov.value;
    const pre = MT_PRESETS[p] || {};
    const m = model.value === '__custom__' ? normalizeModel(custom.value) : model.value;
    return {
      provider: p === 'google' ? 'google' : pre.provider || 'openai', preset: p,
      endpoint: p === 'custom' || p === 'ollama' ? normalizeEndpoint(ep.value) : (pre.endpoint || ''),
      key: key.value.trim(), model: m, models,
    };
  }
  let fetching = false;
  async function fetchModels() {
    if (fetching) return;
    const cfg = read();
    if (cfg.preset === 'google') return;
    if (cfg.preset !== 'ollama' && !cfg.key) { say('請先填入 API 金鑰。', true); return; }
    if ((cfg.preset === 'custom' || cfg.preset === 'ollama') && !cfg.endpoint) { say('請先填入 API 網址。', true); return; }
    say('正在取得模型清單…');
    fetching = true;
    try {
      if (io.beforeRemote) await io.beforeRemote(cfg);
      const list = await io.listModels(cfg);
      if (!list.length) { say('這個服務沒有回傳可用的模型，可選「自訂模型名稱」。', true); fillModels([], cfg.model); return; }
      fillModels(list, pickModel(cfg.preset, list, cfg.model));
      say(`取得 ${list.length} 個模型，已選擇 ${model.value}。按「儲存」套用。`);
    } catch (e) { say('取得模型清單失敗：' + e.message, true); } finally { fetching = false; }
  }

  const cfg = Object.assign({}, MT_DEFAULT, io.load() || {});
  prov.value = presetOf(cfg);
  ep.value = cfg.endpoint || ''; key.value = cfg.key || '';
  fillModels(cfg.models || [], cfg.model);
  sync();

  prov.addEventListener('change', () => {
    const pre = MT_PRESETS[prov.value];
    ep.value = pre ? pre.endpoint : '';
    fillModels([], '');
    sync();
    say(prov.value === 'google' ? '' : prov.value === 'ollama' ? '按「取得模型清單」讀取本機已下載的模型。' : '填入 API 金鑰後按「取得模型清單」。');
  });
  model.addEventListener('change', syncCustom);
  key.addEventListener('change', () => { if (key.value.trim() && !models.length) fetchModels(); });
  $('.mt-fetch').addEventListener('click', fetchModels);
  $('.mt-save').addEventListener('click', async () => {
    const c = read();
    if (c.preset !== 'google' && !c.model) { say('請先選擇模型。', true); return; }
    try { if (io.beforeRemote) await io.beforeRemote(c); await io.save(c); say('已儲存。'); } catch (e) { say(e.message, true); }
  });
  $('.mt-test').addEventListener('click', async () => {
    const c = read();
    if (c.preset !== 'google' && !c.model) { say('請先選擇模型。', true); return; }
    try {
      if (io.beforeRemote) await io.beforeRemote(c);
      await io.save(c);
      say('測試中…');
      const r = await io.test(c);
      say('測試成功：' + Object.entries(r).map(([k, v]) => `${k} → ${v}`).join('、'));
    } catch (e) { say('測試失敗：' + e.message, true); }
  });
}

const MT_FORM_CSS = `
.mt-grid{display:grid;grid-template-columns:90px 1fr;gap:8px 10px;align-items:center}
.mt-grid input,.mt-grid select{font:inherit;font-size:13px;padding:5px 8px;border:1px solid var(--mt-line,#d0d7de);border-radius:6px;background:var(--mt-bg,#fff);color:inherit;width:100%;box-sizing:border-box}
.mt-mrow{display:flex;gap:6px}
.mt-mrow select{flex:1;min-width:0}
.mt-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.mt-grid button,.mt-row button{font:inherit;font-size:13px;padding:4px 12px;border-radius:6px;border:1px solid var(--mt-line,#d0d7de);background:var(--mt-soft,#f6f8fa);color:inherit;cursor:pointer;white-space:nowrap}
.mt-row .mt-primary{background:var(--mt-accent,#1f883d);border-color:transparent;color:#fff}
.mt-msg{min-height:18px;font-size:12px;margin-top:6px;color:var(--mt-ok,#1a7f37);word-break:break-word}
.mt-msg.mt-err{color:var(--mt-err,#d1242f)}
`;
