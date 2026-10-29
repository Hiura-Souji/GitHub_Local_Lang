/*
 * GitHub多國語言 核心（油猴腳本與瀏覽器擴充共用）
 * - document_start 同步翻譯，不等待頁面載入完成
 * - 保留原文，可即時切換語言、不必重新整理
 * - 查詢結果快取，GitHub 動態換頁時也能即時套用
 */
/* global LOCALES, DENY */
function GitHubZhCore(P) {
  'use strict';

  /* ---------------- 設定與語言包 ---------------- */
  const ORIGINAL = { id: 'en', name: '保持原文（English）' };
  let lang = P.get('lang', 'zh-TW');
  let collect = P.get('collect', true) !== false;   // 自動收集未翻譯字串（只存本機）
  let autoMT = !!P.get('autoMT', false);            // 自動機器翻譯
  let customDict = P.get('customDict', {}) || {};   // { 語言代碼: { 原文: 譯文 } }（人工確認）
  let autoDict = P.get('autoDict', {}) || {};       // { 語言代碼: { 原文: 譯文 } }（機器翻譯）
  let extraLocales = P.get('extraLocales', {}) || {}; // 使用者匯入的語言包
  let ignoreSet = new Set(P.get('ignore', []) || []); // 不收集、不翻譯的字串
  const DENY_SET = new Set(typeof DENY !== 'undefined' ? DENY : []); // 內建忽略清單（國家、語言、名稱等）
  const isIgnored = (t) => ignoreSet.has(t) || DENY_SET.has(t);

  function allLocales() {
    return Object.assign({}, LOCALES, extraLocales);
  }
  function languageList() {
    const list = [];
    for (const [id, L] of Object.entries(allLocales())) list.push({ id, name: L.name || id });
    list.push(ORIGINAL);
    return list;
  }

  let dict = null;
  let autoMap = new Map();
  let rules = [];
  let cache = new Map();
  let htmlLang = null;

  function loadLocale() {
    const L = allLocales()[lang];
    cache = new Map();
    if (!L) { dict = null; autoMap = new Map(); rules = []; htmlLang = null; return; }
    dict = new Map(Object.entries(L.entries || {}));
    autoMap = new Map(Object.entries(autoDict[lang] || {}));
    const c = customDict[lang];
    if (c) for (const k of Object.keys(c)) if (c[k]) dict.set(k.replace(/\s+/g, ' ').trim(), c[k]);
    rules = [];
    for (const r of L.rules || []) {
      try { rules.push([new RegExp(r[0], r[1]), r[2]]); } catch (e) { /* 忽略錯誤規則 */ }
    }
    htmlLang = L.htmlLang || lang;
  }
  loadLocale();

  /* ---------------- 查詢 ---------------- */
  const LATIN = /[A-Za-z]/;

  /* ---------- 樣板：把數字、日期、owner/repo、目前帳號換成佔位符 ----------
   * 例：「Star this repository (6705)」→「Star this repository ({n})」
   *     「No contributions on August 31st.」→「No contributions on {date}.」
   * 同一類出現多次時依序編號：{n}、{n2}、{n3}… */
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const MON_RE = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)';
  const DATE_RE = new RegExp('\\b' + MON_RE + '\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?(?:,?\\s+(?:at\\s+)?\\d{1,2}:\\d{2}(?:\\s*[AP]M)?)?', 'g');
  const REPO_RE = /(?<![\w./-])[A-Za-z0-9][\w.-]*\/[\w.-]*[\w-](?![\w/])/g;
  const NUM_RE = /(?<![\w.{])\d+(?:[.,]\d+)*(?![\w])/g;
  const PURE_RE = /^[\s\-–—,.:;()·|/]*(?:\{(?:n|date|repo|user)\d*\}[\s\-–—,.:;()·|/]*)+$/;
  let login = null;
  function currentLogin() {
    if (login) return login;
    const m = document.querySelector('meta[name="user-login"]');
    return (login = (m && m.content) || null);
  }
  function tokenize(t) {
    if (!/\d|\//.test(t) && !(currentLogin() && t.indexOf(login) >= 0)) return null;
    const vals = {}, cnt = {};
    const put = (type, v) => { cnt[type] = (cnt[type] || 0) + 1; const k = type + (cnt[type] > 1 ? cnt[type] : ''); vals[k] = v; return '{' + k + '}'; };
    let s = t.replace(REPO_RE, (m) => (/^[A-Z]+\/[A-Z]+$/.test(m) ? m : put('repo', m)));
    const me = currentLogin();
    if (me) s = s.replace(new RegExp('(?<![\\w-])' + me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'g'), (m) => put('user', m));
    s = s.replace(DATE_RE, (m) => put('date', m));
    s = s.replace(NUM_RE, (m) => put('n', m));
    return s === t ? null : { key: s, vals, pure: PURE_RE.test(s) };
  }
  // 依目前語言格式化英文日期（August 31st、Oct 25, 2026 18:37…）
  const dateFmtCache = new Map();
  function localizeDate(str) {
    const m = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?:,?\s+(?:at\s+)?(\d{1,2}):(\d{2})(?:\s*([AP]M))?)?$/i.exec(str.trim());
    if (!m || !htmlLang) return str;
    const mi = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3)));
    if (mi < 0) return str;
    let h = m[4] ? +m[4] : 0;
    if (m[6]) h = (h % 12) + (/p/i.test(m[6]) ? 12 : 0);
    const d = new Date(m[3] ? +m[3] : new Date().getFullYear(), mi, +m[2], h, m[5] ? +m[5] : 0);
    const key = htmlLang + (m[3] ? 'y' : '') + (m[4] ? 't' : '');
    let f = dateFmtCache.get(key);
    if (!f) {
      const o = { month: 'long', day: 'numeric' };
      if (m[3]) o.year = 'numeric';
      if (m[4]) { o.hour = '2-digit'; o.minute = '2-digit'; o.hour12 = false; }
      try { f = new Intl.DateTimeFormat(htmlLang, o); } catch (e) { f = new Intl.DateTimeFormat('en', o); }
      dateFmtCache.set(key, f);
    }
    return f.format(d);
  }
  function fillTemplate(tr, vals) {
    return tr.replace(/\{(n|date|repo|user)(\d*)\}/g, (all, type, i) => {
      const v = vals[type + i];
      if (v === undefined) return all;
      return type === 'date' ? localizeDate(v) : v;
    });
  }
  function placeholders(s) { return (s.match(/\{(?:n|date|repo|user)?\d*\}/g) || []).filter((x) => x !== '{}').sort().join(','); }

  function compute(t) {
    const d = dict.get(t);
    if (d !== undefined) return d;
    const a = autoMap.get(t);
    if (a !== undefined) return a;
    for (let i = 0; i < rules.length; i++) {
      const re = rules[i][0];
      if (re.test(t)) return t.replace(re, rules[i][1]);
    }
    const tk = tokenize(t);
    if (tk) {
      // 純日期／數字（例如「Oct 25, 2026」）：直接依語言格式化日期
      if (tk.pure) return tk.key.indexOf('{date') >= 0 ? fillTemplate(tk.key, tk.vals) : null;
      const v = dict.get(tk.key) ?? autoMap.get(tk.key);
      if (v !== undefined) return fillTemplate(v, tk.vals);
    }
    const m = /^(.+?)([:：.…!?]+)$/.exec(t);
    if (m) {
      const base = lookup(m[1]);
      if (base != null) return base + m[2].replace(':', '：').replace('!', '！').replace('?', '？');
    }
    return null;
  }

  function lookup(text) {
    if (!dict) return null;
    const t = text.indexOf('  ') >= 0 || text.indexOf('\n') >= 0 ? text.replace(/\s+/g, ' ') : text;
    let r = cache.get(t);
    if (r === undefined) {
      r = compute(t);
      if (cache.size > 8000) cache.clear();
      cache.set(t, r);
    }
    return r;
  }

  /* ---------------- 未翻譯字串收集（跨頁、持續、只存本機） ---------------- */
  const pageUntranslated = new Set();  // 本頁
  const sessionSeen = new Set();       // 本次瀏覽已記錄（頁面類型 + 字串）
  let pendingHarvest = {};
  let harvestTimer = null;

  // 頁面類型：把擁有者、儲存庫名稱、編號換成代號，不記錄真實網址
  const ROOT_PAGES = new Set(['settings', 'notifications', 'orgs', 'organizations', 'explore', 'trending', 'topics',
    'marketplace', 'pulls', 'issues', 'search', 'new', 'login', 'signup', 'sponsors', 'codespaces', 'features',
    'dashboard', 'stars', 'watching', 'collections', 'events', 'copilot', 'apps', 'enterprises', 'account', 'users']);
  function pageKind() {
    const segs = location.pathname.split('/').filter(Boolean).slice(0, 5);
    if (!segs.length) return location.hostname === 'gist.github.com' ? 'gist:/' : '/';
    let out;
    if (ROOT_PAGES.has(segs[0])) out = segs.map((x, i) => (i === 0 ? x : /^\d+$/.test(x) ? ':n' : i >= 2 ? ':x' : x));
    else if (segs.length === 1) out = [':user'];
    else out = [':owner', ':repo'].concat(segs.slice(2).map((x, i) => (/^\d+$/.test(x) ? ':n' : i === 0 ? x : ':x')));
    return (location.hostname === 'gist.github.com' ? 'gist:/' : '/') + out.join('/') + location.search.replace(/=.*?(&|$)/g, '=*$1').slice(0, 40);
  }

  // 判斷像不像介面文字（排除使用者名稱、檔名、雜湊、網址、版本號等）
  const NOT_UI = [
    /^[\w.-]+\/[\w.-]+$/,               // owner/repo
    /^[\w.@-]+\.[a-z0-9]{1,6}$/i,         // 檔名
    /:\/\/|www\.|@[\w-]+|#\d+/,           // 網址、@提及、#編號
    /\b[0-9a-f]{7,40}\b/,                // commit SHA
    /^v?\d+(\.\d+)+/,                   // 版本號
    /^[\w-]*[a-z][A-Z][\w-]*$/,           // camelCase 識別名稱
    /^[\w]+_[\w]+$/, /^[\w.-]*\d[\w.-]*$/, // snake_case、含數字的單字
    /[<>{}\[\]=;$\\|`]/,                    // 程式碼符號
  ];
  const CONTENT_CTX = '[data-hovercard-type],[data-hovercard-url],[itemprop],.Truncate-text,.markdown-title,.text-mono,[data-testid*="title"],[data-testid*="description"],[data-testid*="name"]';
  function looksLikeUI(t) {
    t = t.replace(/\{\d+\}/g, '').replace(/\s+/g, ' ').trim();   // 整句翻譯的 {0} 佔位符不列入判斷
    if (t.length < 2 || t.length > 320) return false;
    if (!/^[A-Za-z(+…“"'.]/.test(t) || !/[A-Za-z]{2,}/.test(t)) return false;
    if (t.split(' ').length > 55) return false;
    for (const re of NOT_UI) if (re.test(t)) return false;
    return true;
  }
  // 連到使用者、儲存庫、檔案、commit、外部網站的連結文字是「內容」（名稱、標題），不是介面
  const UI_TABS = new Set(['issues', 'pulls', 'actions', 'projects', 'wiki', 'security', 'pulse', 'settings', 'discussions',
    'releases', 'packages', 'tags', 'branches', 'stargazers', 'watchers', 'forks', 'network', 'graphs', 'commits', 'activity',
    'deployments', 'milestones', 'labels', 'compare', 'search', 'community', 'insights', 'codespaces', 'new', 'find', 'upload',
    'archive', 'contributors', 'traffic', 'dependency-graph', 'code-frequency', 'agents', 'models', 'subscription']);
  function isContentHref(a) {
    let u;
    try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { return false; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (!/(^|\.)github\.com$/.test(u.hostname)) return true;           // 外部網站（部落格、文件標題等）
    const segs = u.pathname.split('/').filter(Boolean);
    if (!segs.length) return false;
    if (ROOT_PAGES.has(segs[0])) {
      if (segs[0] === 'marketplace') return segs.length >= 3 && segs[1] !== 'category';
      return segs.length >= 2 && /^(topics|orgs|sponsors|apps|collections|users)$/.test(segs[0]) && !/^(settings|new|accounts)$/.test(segs[1]);
    }
    if (segs.length <= 2) return true;                                 // 使用者、組織、儲存庫名稱
    if (UI_TABS.has(segs[2]) && (segs.length === 3 || /^(new|compare|choose|templates|edit)$/.test(segs[3]))) return false;
    return true;                                                       // 檔案、分支、commit、議題標題…
  }
  const CARD_SEL = 'li, article, .Box-row, [class*="ListItem"], [class*="ListView-item"], [class*="card" i], [class*="Card"]';
  function isUserContent(el, t) {
    if (!el || !el.closest) return false;
    if (el.closest(CONTENT_CTX)) return true;
    const a = el.closest('a[href]');
    if (a && isContentHref(a)) return true;
    // 大型下拉選單（時區、國家、語言）
    const sel = el.closest('select, datalist, [role="listbox"]');
    if (sel && sel.querySelectorAll('option, [role="option"]').length > 25) return true;
    // 卡片中的描述文字（儲存庫、App、文章的說明）
    if (!a && (t.split(' ').length >= 4 || /[.!?]$/.test(t)) && !el.closest('button, [role="button"], label, nav, form, [role="dialog"], [role="menu"]')) {
      const card = el.closest(CARD_SEL);
      if (card && card.textContent.length < 2000) {
        for (const x of card.querySelectorAll('a[href]')) if (isContentHref(x)) return true;
      }
    }
    return false;
  }
  function isPrivatePage() {
    const m = document.querySelector('meta[name="octolytics-dimension-repository_public"]');
    return !!m && m.content === 'false';
  }

  const recordDone = new Set();   // 本頁已判斷過的字串（同一字串只判斷一次）
  function record(t, el) {
    if (!dict) return;
    if (t.indexOf('  ') >= 0 || t.indexOf('\n') >= 0) t = t.replace(/\s+/g, ' ');
    if (el && mixedParents.has(el) && t.indexOf('{') < 0) return;   // 整句已另外記錄
    if (recordDone.has(t)) return;
    recordDone.add(t);
    if (isIgnored(t) || !looksLikeUI(t)) return;
    if (isUserContent(el, t)) return;
    // 含數字、日期、儲存庫、帳號的字串改記樣板，一筆涵蓋所有變化
    const tk = tokenize(t);
    if (tk) {
      if (tk.pure) return;
      t = tk.key;
      if (isIgnored(t) || /^\{(repo|user)\d*\}\s+\S+$/.test(t)) return;
    }
    pageUntranslated.add(t);
    if (autoMT) queueMT(t);
    if (!collect) return;
    const kind = pageKind();
    const key = kind + '\u0000' + t;
    if (sessionSeen.has(key)) return;
    sessionSeen.add(key);
    const e = pendingHarvest[t] || (pendingHarvest[t] = { n: 0, p: [] });
    e.n++;
    if (e.p.indexOf(kind) < 0) e.p.push(kind);
    if (!harvestTimer) harvestTimer = setTimeout(flushHarvest, 3000);
  }
  function flushHarvest() {
    harvestTimer = null;
    const d = pendingHarvest;
    pendingHarvest = {};
    if (Object.keys(d).length) try { P.harvestAdd(d); } catch (e) { /* 忽略 */ }
  }
  addEventListener('pagehide', flushHarvest);

  /* ---------------- 自動機器翻譯 ---------------- */
  const mtQueue = new Set();
  const mtGaveUp = new Set();
  let mtTimer = null, mtBusy = false, mtFails = 0, mtError = '', mtCount = 0;
  const GLOSSARY_KEYS = ['Repository', 'Pull request', 'Issue', 'Discussion', 'Fork', 'Star', 'Watch', 'Commit', 'Branch',
    'Tag', 'Label', 'Release', 'Workflow', 'Merge', 'Clone', 'Settings', 'Organization', 'Profile', 'Code', 'Insights',
    'Packages', 'Projects', 'Notifications', 'Repositories', 'Contributors', 'Default branch', 'Draft', 'Review'];
  function glossary() {
    const g = {};
    for (const k of GLOSSARY_KEYS) { const v = dict && dict.get(k); if (v) g[k] = v; }
    return g;
  }
  function langName() {
    const L = allLocales()[lang];
    return (L && L.name) || lang;
  }
  function queueMT(t, force) {
    if (!dict || mtGaveUp.has(t) || autoMap.has(t)) return;
    if (!force && (mtFails >= 3 || isPrivatePage())) return;
    mtQueue.add(t);
    if (!mtTimer && !mtBusy) mtTimer = setTimeout(runMT, 600);
  }
  // 簡體字（常見且繁體不會出現的字）
  const SIMPLIFIED = /[们这个为说时对会来进还发现与关开没过让应该样经问题头动实从万东车长门见语书业产网线级认设计数据库将添资处里户单变选择载删请启确认]/;
  function checkMT(L, t, v) {
    v = v.trim();
    if (placeholders(t) !== placeholders(v)) return false;          // 佔位符必須完整保留
    if (L === 'zh-TW' || L === 'zh-HK') {
      if (SIMPLIFIED.test(v)) return false;
      v = v.replace(/您/g, '你');
    }
    return v;
  }
  async function mtBatch(batch, L) {
    const res = await P.translate({ lang: L, langName: langName(), texts: batch, glossary: glossary() });
    const a = autoDict[L] || (autoDict[L] = {});
    let n = 0;
    let ignored = 0;
    for (const t of batch) {
      let v = res && res[t];
      if (typeof v !== 'string' || !v) { mtGaveUp.add(t); continue; }
      v = checkMT(L, t, v);
      if (v === false) { mtGaveUp.add(t); continue; }
      // 翻譯服務原樣傳回：多半是名稱或不需翻譯的文字，自動忽略
      if (v === t) { ignoreSet.add(t); ignored++; continue; }
      a[t] = v; n++;
    }
    if (ignored) P.set('ignore', [...ignoreSet]);
    if (n) {
      P.set('autoDict', autoDict);
      if (L === lang) { autoMap = new Map(Object.entries(a)); cache = new Map(); full(); }
    }
    mtCount += n;
    return n;
  }
  async function runMT() {
    mtTimer = null;
    if (mtBusy || !mtQueue.size) return;
    const L = lang;
    const batch = [...mtQueue].slice(0, 25);
    batch.forEach((t) => mtQueue.delete(t));
    mtBusy = true;
    try {
      await mtBatch(batch, L);
      mtFails = 0; mtError = '';
    } catch (e) {
      mtFails++;
      mtError = String((e && e.message) || e);
      if (mtFails < 3) batch.forEach((t) => mtQueue.add(t));
      else mtQueue.clear(); // 連續失敗三次就暫停，避免一直打擾翻譯服務
    } finally {
      mtBusy = false;
      if (mtQueue.size && !mtTimer) mtTimer = setTimeout(runMT, mtFails ? 4000 * mtFails : 300);
    }
  }
  // 審核面板的「全部機器翻譯」：不受自動開關與私人頁限制
  async function translateNow(keys, onProgress) {
    const L = lang;
    const list = keys.filter((t) => !(autoDict[L] && autoDict[L][t]));
    let done = 0;
    for (let i = 0; i < list.length; i += 25) {
      await mtBatch(list.slice(i, i + 25), L);
      done = Math.min(i + 25, list.length);
      if (onProgress) onProgress(done, list.length);
    }
    mtFails = 0; mtError = '';
    return done;
  }

  /* ---------------- 略過區域 ---------------- */
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'svg', 'MATH', 'TEMPLATE', 'IFRAME']);
  // 只有 class 的簡單選擇器用 Set 比對（最快），其餘才交給 matches()
  const SKIP_CLASSES = new Set([
    'ghzh-ui', 'notranslate', 'markdown-body', 'comment-body', 'js-comment-body', 'email-format',
    'blob-code', 'blob-wrapper', 'blob-num', 'react-code-text', 'react-file-line', 'react-code-lines',
    'highlight', 'diff-table', 'js-file-content', 'cm-editor', 'monaco-editor',
    'js-issue-title', 'markdown-title', 'commit-title', 'commit-desc', 'commit-message',
    'react-directory-filename-column', 'react-directory-commit-message', 'react-directory-truncate',
    'PRIVATE_TreeView-item-content-text', 'p-name', 'p-nickname', 'p-note', 'user-profile-bio',
    'AppHeader-context-item-label', 'author', 'commit-author', 'IssueLabel', 'topic-tag', 'final-path', 'repo',
  ]);
  const SKIP_COMPLEX = [
    '[translate="no"]', '[contenteditable]:not([contenteditable="false"])',
    '#read-only-cursor-text-area', '#repos-file-tree',
    '[data-testid="issue-title"]', '[data-testid="issue-body"]', '[data-testid="markdown-body"]',
    '[data-testid="issue-title-sticky"]', '[data-testid="breadcrumbs"]',
    'a[itemprop~="codeRepository"]', '[itemprop="name"]', '[data-hovercard-type="repository"]',
    '.file-info .Link--primary', '.f4.my-3', '.BorderGrid-cell > .f4', // 儲存庫描述
  ].join(',');
  const SKIP_ALL = [...SKIP_CLASSES].map((c) => '.' + c).join(',') + ',' + SKIP_COMPLEX;

  function isSkipped(el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    const cl = el.classList;
    for (let i = 0; i < cl.length; i++) if (SKIP_CLASSES.has(cl[i])) return true;
    return el.hasAttributes() && el.matches(SKIP_COMPLEX);
  }
  function inSkippedArea(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return true;
    if (el.closest(SKIP_ALL)) return true;
    for (let p = el; p; p = p.parentElement) if (SKIP_TAGS.has(p.tagName)) return true;
    return false;
  }

  /* ---------------- 原文保存（供即時切換） ---------------- */
  const textOrig = new WeakMap();   // 文字節點 → 原文
  const textMine = new WeakMap();   // 文字節點 → 我們寫入的譯文
  const attrState = new WeakMap();  // 元素 → { 屬性: [原文, 譯文] }
  const ATTRS = ['placeholder', 'aria-label', 'title', 'data-placeholder', 'aria-description'];
  const TIME_SEL = 'relative-time, time-ago, time-until, local-time';
  const TIME_TAGS = new Set(['RELATIVE-TIME', 'TIME-AGO', 'TIME-UNTIL', 'LOCAL-TIME']);
  const langTouched = new WeakSet();

  /* ---------- 整句翻譯：文字中夾著連結、鍵盤按鍵等行內元素 ----------
   * 例：「Type <kbd>/</kbd> to search」→ 鍵值「Type {0} to search」→ 譯文「輸入 {0} 以搜尋」
   * 行內元素本身不動（React 管理的節點不搬移），只改它們之間的文字；譯文中的 {0}、{1}… 必須依序出現。 */
  const INLINE = new Set(['A', 'KBD', 'CODE', 'STRONG', 'B', 'EM', 'I', 'SPAN', 'SMALL', 'MARK', 'ABBR', 'TIME', 'BR', 'RELATIVE-TIME', 'U', 'TT', 'SAMP']);
  const mixedParents = new WeakSet();
  function doMixed(parent) {
    const kids = parent.childNodes;
    if (kids.length < 3 || kids.length > 24) return false;
    const parts = [], slots = [];   // slots: [文字節點, 所在位置, 原文]
    const elems = [];
    let ph = 0, textCount = 0;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (c.nodeType === 3) {
        const cur = c.nodeValue;
        const src = textMine.get(c) === cur ? textOrig.get(c) : cur;
        parts.push(src);
        slots.push([c, ph, src]);
        if (src.trim()) textCount++;
      } else if (c.nodeType === 1) {
        if (c.tagName === 'svg' || c.tagName === 'SVG') continue;
        if (!INLINE.has(c.tagName)) return false;
        parts.push('{' + ph + '}');
        elems.push(c);
        ph++;
      }
    }
    if (!ph || textCount < 2) return false;
    const key = parts.join('').replace(/\s+/g, ' ').trim();
    if (!LATIN.test(key.replace(/\{\d+\}/g, ''))) return false;
    mixedParents.add(parent);
    const tr = lookup(key);
    if (tr == null || tr.indexOf('{0}') < 0 && ph > 0 && !/\{\d+\}/.test(tr)) {
      if (tr == null) record(key, parent);
      return false;
    }
    // 譯文切成 ph+1 段，對應每個元素前後的文字
    const segs = tr.split(/\{(\d+)\}/);
    const texts = [];
    for (let i = 0; i < segs.length; i += 2) texts.push(segs[i]);
    for (let i = 1, k = 0; i < segs.length; i += 2, k++) if (+segs[i] !== k) return false;   // 順序必須一致
    if (texts.length !== ph + 1) return false;
    const used = new Set();
    for (const [node, slot, src] of slots) {
      const val = used.has(slot) ? '' : texts[slot];
      used.add(slot);
      if (node.nodeValue !== val) { textOrig.set(node, src); textMine.set(node, val); node.nodeValue = val; }
    }
    // 某段沒有文字節點但譯文有字：補一個文字節點
    for (let s = 0; s <= ph; s++) {
      if (used.has(s) || !texts[s]) continue;
      const n = document.createTextNode(texts[s]);
      textOrig.set(n, ''); textMine.set(n, texts[s]);
      if (s < ph) parent.insertBefore(n, elems[s]); else parent.appendChild(n);
    }
    return true;
  }

  function doText(node) {
    const parent = node.parentNode;
    if (!parent) return;
    if (parent.nodeName === 'TITLE') { doTitle(); return; }
    if (parent.nodeType === 1 && parent.childNodes.length > 2 && dict && doMixed(parent)) return;
    const cur = node.nodeValue;
    let src;
    if (textMine.get(node) === cur) src = textOrig.get(node);
    else { src = cur; textMine.delete(node); textOrig.delete(node); }
    if (!src || !LATIN.test(src)) return;
    const t = src.trim();
    if (!t || t.length > 400) return;
    const out = lookup(t);
    if (out == null) {
      if (src !== cur) { textMine.delete(node); textOrig.delete(node); node.nodeValue = src; }
      record(t, parent);
      return;
    }
    const i = src.indexOf(t);
    const next = src.slice(0, i) + out + src.slice(i + t.length);
    if (next !== cur) {
      textOrig.set(node, src);
      textMine.set(node, next);
      node.nodeValue = next;
    }
  }

  function doAttr(el, a) {
    const cur = el.getAttribute(a);
    let st = attrState.get(el);
    let src = cur;
    if (st && st[a]) {
      if (st[a][1] === cur) src = st[a][0];
      else delete st[a];
    }
    if (!src || !LATIN.test(src)) return;
    const out = lookup(src.trim());
    if (out == null) {
      if (src !== cur) { delete st[a]; el.setAttribute(a, src); }
      if (a !== 'value') record(src.trim(), el);
      return;
    }
    if (out !== cur) {
      if (!st) { st = {}; attrState.set(el, st); }
      st[a] = [src, out];
      el.setAttribute(a, out);
    }
  }

  function doElement(el) {
    if (el.hasAttributes()) for (let i = 0; i < ATTRS.length; i++) if (el.hasAttribute(ATTRS[i])) doAttr(el, ATTRS[i]);
    if (el.tagName === 'INPUT') {
      const type = el.type;
      if ((type === 'submit' || type === 'button' || type === 'reset') && el.hasAttribute('value')) doAttr(el, 'value');
    }
    if (TIME_TAGS.has(el.tagName)) doTime(el);
  }

  // 相對時間交給瀏覽器 Intl 處理（與 GitHub 原生在地化同一機制，零延遲）
  function doTime(el) {
    if (htmlLang) {
      if (el.getAttribute('lang') !== htmlLang) {
        if (!el.hasAttribute('lang') || langTouched.has(el)) { langTouched.add(el); el.setAttribute('lang', htmlLang); }
      }
    } else if (langTouched.has(el)) {
      langTouched.delete(el);
      el.removeAttribute('lang');
    }
  }

  /* ---------------- 頁面標題 ---------------- */
  let titleOrig = null, titleMine = null;
  function doTitle() {
    const cur = document.title;
    if (!cur) return;
    const src = cur === titleMine ? titleOrig : cur;
    const out = src.split(' · ').map((p) => {
      const r = lookup(p.trim());
      return r != null ? r : p;
    }).join(' · ');
    if (out !== cur) {
      titleOrig = src; titleMine = out;
      document.title = out;
    }
  }

  /* ---------------- <html lang> ---------------- */
  let root = null;
  let origHtmlLang = 'en';
  function doHtmlLang() {
    if (!root) return;
    const want = htmlLang || origHtmlLang;
    if (root.getAttribute('lang') !== want) root.setAttribute('lang', want);
  }

  /* ---------------- 走訪 ---------------- */
  const filter = {
    acceptNode(n) {
      return n.nodeType === 1 && isSkipped(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  };
  function walk(node) {
    const type = node.nodeType;
    if (type === 3) { doText(node); return; }
    if (type !== 1) return;
    if (isSkipped(node)) return;
    doElement(node);
    if (!node.firstChild) return;
    const w = document.createTreeWalker(node, 5 /* ELEMENT | TEXT */, filter);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) doText(n); else doElement(n);
    }
  }

  function onMutations(list) {
    handle(list);
    // 回呼中不會有頁面腳本插隊，此時佇列裡的紀錄全是我們自己寫入造成的，直接丟棄
    observer.takeRecords();
  }
  function handle(list) {
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const target = m.target;
      if (m.type === 'childList') {
        if (target.nodeName === 'TITLE') { doTitle(); continue; }
        const added = m.addedNodes;
        if (!added.length) continue;
        if (inSkippedArea(target)) continue;
        for (let j = 0; j < added.length; j++) walk(added[j]);
      } else if (m.type === 'characterData') {
        const p = target.parentNode;
        if (p && p.nodeName === 'TITLE') { doTitle(); continue; }
        if (!inSkippedArea(target)) doText(target);
      } else if (m.type === 'attributes') {
        if (target === root && m.attributeName === 'lang') { doHtmlLang(); continue; }
        if (m.attributeName === 'lang') { if (TIME_TAGS.has(target.tagName)) doTime(target); continue; }
        if (!inSkippedArea(target)) {
          if (m.attributeName === 'value') { if (target.tagName === 'INPUT') doElement(target); }
          else doAttr(target, m.attributeName);
        }
      }
    }
  }

  const observer = new MutationObserver(onMutations);
  function observe() {
    observer.observe(root, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS.concat(['value', 'lang']),
    });
  }

  function full() {
    if (!root) return;
    handle(observer.takeRecords()); // 先處理頁面尚未送達的變動
    doHtmlLang();
    doTitle();
    walk(root);
    observer.takeRecords();
  }

  /* ---------------- 對外 API ---------------- */
  function setLang(id) {
    if (id === lang) return;
    lang = id;
    P.set('lang', id);
    loadLocale();
    pageUntranslated.clear();
    sessionSeen.clear(); recordDone.clear();
    mtQueue.clear(); mtGaveUp.clear(); mtFails = 0;
    full();
  }
  function setCollect(v) { collect = !!v; P.set('collect', collect); if (collect) { sessionSeen.clear(); recordDone.clear(); cache = new Map(); full(); } }
  function setAutoMT(v) { autoMT = !!v; P.set('autoMT', autoMT); mtFails = 0; mtError = ''; if (autoMT) { recordDone.clear(); cache = new Map(); full(); } }
  function setCustomDict(obj) {
    customDict = obj || {};
    P.set('customDict', customDict);
    loadLocale();
    full();
  }
  function setAutoDict(obj) {
    autoDict = obj || {};
    P.set('autoDict', autoDict);
    loadLocale();
    full();
  }
  function setExtraLocales(obj) {
    extraLocales = obj || {};
    P.set('extraLocales', extraLocales);
    loadLocale();
    full();
  }
  function setIgnore(list) { ignoreSet = new Set(list || []); P.set('ignore', [...ignoreSet]); }
  function untranslatedJSON() {
    const o = {};
    [...pageUntranslated].filter((k) => lookup(k) == null).sort().forEach((k) => { o[k] = ''; });
    return JSON.stringify(o, null, 2);
  }
  // 外部（擴充 popup、其他分頁）改了設定時呼叫，不重複寫回儲存區
  function applySettings(s) {
    let reload = false;
    if (s.customDict !== undefined) { customDict = s.customDict || {}; reload = true; }
    if (s.autoDict !== undefined) { autoDict = s.autoDict || {}; reload = true; }
    if (s.extraLocales !== undefined) { extraLocales = s.extraLocales || {}; reload = true; }
    if (s.ignore !== undefined) ignoreSet = new Set(s.ignore || []);
    if (s.collect !== undefined) collect = s.collect !== false;
    if (s.autoMT !== undefined) { autoMT = !!s.autoMT; mtFails = 0; if (autoMT) reload = true; }
    if (s.lang !== undefined && s.lang !== lang) { lang = s.lang; reload = true; pageUntranslated.clear(); sessionSeen.clear(); }
    if (reload) { loadLocale(); full(); }
  }

  // 匯出貢獻檔：可交給維護者，或用 build/merge.py 併入內建詞庫
  async function exportContrib() {
    const harvest = (await P.harvestGet()) || {};
    const todo = {};
    for (const [k, e] of Object.entries(harvest)) {
      if (ignoreSet.has(k)) continue;
      const L = allLocales()[lang];
      if (L && L.entries && L.entries[k]) continue;
      todo[k] = { n: e.n, pages: e.p };
    }
    const langs = {};
    for (const id of new Set([...Object.keys(customDict), ...Object.keys(autoDict)])) {
      const c = customDict[id] || {}, m = autoDict[id] || {};
      const mOnly = {};
      for (const k of Object.keys(m)) if (!c[k]) mOnly[k] = m[k];
      if (Object.keys(c).length || Object.keys(mOnly).length) langs[id] = { reviewed: c, machine: mOnly };
    }
    return JSON.stringify({
      format: 'github-zh-tw-contrib', version: 1, exported: new Date().toISOString(),
      langs, untranslated: todo, ignored: [...ignoreSet],
    }, null, 2);
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    a.className = 'ghzh-ui';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  // 依目前規則清理：雜訊、可樣板化的動態字串、已有內建譯文的項目
  function isJunkKey(k) {
    if (k.indexOf('{') >= 0) return false;               // 已是樣板
    if (DENY_SET.has(k) || !looksLikeUI(k)) return true;
    const tk = tokenize(k);
    return !!tk;                                         // 含數字、日期、儲存庫、帳號的舊紀錄
  }
  // 自訂譯文中，內建詞庫已收錄（但譯法不同）的筆數
  function customCoveredByBuiltin() {
    const b = (allLocales()[lang] || {}).entries || {};
    return Object.keys(customDict[lang] || {}).filter((k) => b[k] && b[k] !== customDict[lang][k]).length;
  }
  async function cleanupData(useBuiltin) {
    const builtin = (allLocales()[lang] || {}).entries || {};
    const h = (await P.harvestGet()) || {};
    let nh = 0, na = 0, nc = 0;
    const h2 = {};
    for (const [k, e] of Object.entries(h)) {
      if (isJunkKey(k) || builtin[k] || ignoreSet.has(k)) { nh++; continue; }
      h2[k] = e;
    }
    const ad = {};
    for (const [L, m] of Object.entries(autoDict)) {
      const b = (allLocales()[L] || {}).entries || {};
      ad[L] = {};
      for (const [k, v] of Object.entries(m)) { if (isJunkKey(k) || b[k] || ignoreSet.has(k)) na++; else ad[L][k] = v; }
    }
    const cd = {};
    for (const [L, m] of Object.entries(customDict)) {
      const b = (allLocales()[L] || {}).entries || {};
      cd[L] = {};
      for (const [k, v] of Object.entries(m)) { if (isJunkKey(k) || b[k] === v || (useBuiltin && L === lang && b[k])) nc++; else cd[L][k] = v; }
    }
    await P.harvestClear();
    if (Object.keys(h2).length) await P.harvestAdd(h2);
    autoDict = ad; customDict = cd;
    P.set('autoDict', autoDict); P.set('customDict', customDict);
    sessionSeen.clear(); loadLocale(); full();
    return { nh, na, nc };
  }
  // 「清理雜訊」：詢問是否改用內建譯文後執行，回傳結果訊息
  async function runCleanup() {
    const cov = customCoveredByBuiltin();
    const useBuiltin = cov > 0 && confirm(`內建詞庫已收錄 ${cov} 筆你自訂過的字串（已經人工校對）。\n要改用內建譯文嗎？\n\n按「確定」改用內建譯文；按「取消」保留你的自訂譯文。`);
    const r = await cleanupData(useBuiltin);
    return `已清理：收集紀錄 ${r.nh} 筆、機器翻譯 ${r.na} 筆、自訂譯文 ${r.nc} 筆。`;
  }
  async function resetLang() {
    const all = Object.assign({}, customDict); delete all[lang];
    const ad = Object.assign({}, autoDict); delete ad[lang];
    autoDict = ad; customDict = all;
    P.set('autoDict', autoDict); P.set('customDict', customDict);
    await P.harvestClear();
    sessionSeen.clear(); mtGaveUp.clear(); loadLocale(); full();
  }

  /* ---------------- 頁面內面板 ---------------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const PANEL_CSS = MT_FORM_CSS + `
#ghzh-panel{--mt-line:var(--borderColor-default,#d0d7de);--mt-bg:var(--bgColor-default,#fff);--mt-soft:var(--bgColor-muted,#f6f8fa);--mt-accent:var(--bgColor-success-emphasis,#1f883d)}
#ghzh-panel .mtcfg{margin:8px 0 4px 30px}
#ghzh-panel .mt-row .mt-primary{background:var(--bgColor-success-emphasis,#1f883d);border-color:transparent;color:#fff}
#ghzh-panel .mt-msg.mt-err{color:var(--fgColor-danger,#d1242f)}
#ghzh-panel{position:fixed;inset:0;z-index:2147483647;background:rgba(1,4,9,.5);display:flex;align-items:center;justify-content:center;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC","Microsoft JhengHei",sans-serif;color:var(--fgColor-default,#1f2328)}
#ghzh-panel *{box-sizing:border-box}
#ghzh-panel .box{background:var(--bgColor-default,#fff);border:1px solid var(--borderColor-default,#d0d7de);border-radius:12px;width:min(580px,94vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 16px 32px rgba(1,4,9,.35)}
#ghzh-panel .box.wide{width:min(980px,96vw);height:88vh}
#ghzh-panel .body{overflow:auto;flex:1}
#ghzh-panel header{display:flex;gap:8px;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--borderColor-muted,#d8dee4);font-weight:600;font-size:16px}
#ghzh-panel section{padding:12px 16px;border-bottom:1px solid var(--borderColor-muted,#d8dee4)}
#ghzh-panel h3{margin:0 0 6px;font-size:13px;color:var(--fgColor-muted,#59636e);font-weight:600}
#ghzh-panel .hint{font-size:12px;color:var(--fgColor-muted,#59636e);margin:2px 0 0 30px}
#ghzh-panel label.opt{display:flex;gap:8px;align-items:center;padding:5px 8px;border-radius:6px;cursor:pointer}
#ghzh-panel label.opt:hover{background:var(--bgColor-muted,#f6f8fa)}
#ghzh-panel .grid{display:grid;grid-template-columns:90px 1fr;gap:6px 8px;align-items:center;margin:8px 0 0 30px}
#ghzh-panel input[type=text],#ghzh-panel input[type=password],#ghzh-panel input[type=search],#ghzh-panel select,#ghzh-panel textarea{font:inherit;font-size:13px;padding:4px 8px;border:1px solid var(--borderColor-default,#d0d7de);border-radius:6px;background:var(--bgColor-default,#fff);color:inherit;width:100%}
#ghzh-panel textarea{height:200px;font:12px ui-monospace,Consolas,monospace;background:var(--bgColor-inset,#f6f8fa);display:none;margin-top:8px}
#ghzh-panel .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}
#ghzh-panel button{font:inherit;font-size:13px;padding:4px 12px;border-radius:6px;border:1px solid var(--borderColor-default,#d0d7de);background:var(--bgColor-muted,#f6f8fa);color:inherit;cursor:pointer;white-space:nowrap}
#ghzh-panel button:disabled{opacity:.5;cursor:default}
#ghzh-panel button.primary{background:var(--bgColor-success-emphasis,#1f883d);border-color:transparent;color:#fff}
#ghzh-panel .stat{font-size:13px;margin-top:6px}
#ghzh-panel .msg{min-height:18px;font-size:12px;margin-top:6px;color:var(--fgColor-success,#1a7f37)}
#ghzh-panel .msg.err{color:var(--fgColor-danger,#d1242f)}
#ghzh-panel .x{border:0;background:none;font-size:20px;line-height:1;padding:0 4px}
#ghzh-panel .tabs{display:flex;gap:4px}
#ghzh-panel .tabs button{border-radius:999px;padding:2px 12px}
#ghzh-panel .tabs button.on{background:var(--bgColor-accent-emphasis,#0969da);color:#fff;border-color:transparent}
#ghzh-panel table{width:100%;border-collapse:collapse;font-size:13px}
#ghzh-panel th{position:sticky;top:0;background:var(--bgColor-muted,#f6f8fa);text-align:left;font-weight:600;padding:6px 8px;border-bottom:1px solid var(--borderColor-default,#d0d7de);z-index:1}
#ghzh-panel td{padding:4px 8px;border-bottom:1px solid var(--borderColor-muted,#d8dee4);vertical-align:middle}
#ghzh-panel td.src{width:42%;word-break:break-word}
#ghzh-panel td.src small{display:block;color:var(--fgColor-muted,#59636e);font-size:11px}
#ghzh-panel td.act{width:1%;white-space:nowrap}
#ghzh-panel td.act button{padding:2px 8px}
#ghzh-panel .tag{font-size:11px;padding:0 6px;border-radius:999px;border:1px solid currentColor;margin-left:6px;opacity:.75}
#ghzh-panel .tag.m{color:var(--fgColor-attention,#9a6700)}
#ghzh-panel .tag.c{color:var(--fgColor-success,#1a7f37)}
#ghzh-panel .empty{padding:40px;text-align:center;color:var(--fgColor-muted,#59636e)}
#ghzh-panel .toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 16px;border-bottom:1px solid var(--borderColor-muted,#d8dee4)}
#ghzh-panel .toolbar input[type=search]{flex:1;min-width:160px}
`;

  function openPanel(view) {
    const old = document.getElementById('ghzh-panel');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'ghzh-panel';
    wrap.className = 'ghzh-ui';
    wrap.innerHTML = '<style>' + PANEL_CSS + '</style><div class="box"></div>';
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) wrap.remove(); });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') wrap.remove(); });
    (document.body || document.documentElement).appendChild(wrap);
    if (view === 'review') renderReview(wrap); else renderMain(wrap);
  }

  function renderMain(wrap) {
    // 換一個新的 .box 元素：舊的事件處理器會跟著舊元素一起丟掉，避免重複觸發
    const oldBox = wrap.querySelector('.box');
    const box = oldBox.cloneNode(false);
    oldBox.replaceWith(box);
    box.className = 'box';
    box.innerHTML = `
  <header><span>GitHub多國語言 設定</span><button class="x" data-act="close" aria-label="關閉">×</button></header>
  <div class="body">
  <section><h3>介面語言（立即套用）</h3><div class="langs"></div></section>
  <section>
    <h3>自動補齊翻譯</h3>
    <label class="opt"><input type="checkbox" class="collect"> 自動收集未翻譯的字串</label>
    <div class="hint">跨頁面累積記錄，只存在你的瀏覽器裡，不會上傳。</div>
    <label class="opt"><input type="checkbox" class="automt"> 自動機器翻譯未翻譯的字串</label>
    <div class="hint">會把未翻譯的介面字串送到下方的翻譯服務；私人儲存庫頁面不會送出。</div>
    <div class="mtcfg"></div>
    <div class="stat"></div>
    <div class="row">
      <button class="primary" data-act="review">審核與編輯翻譯…</button>
      <button data-act="export">匯出貢獻檔</button>
      <button data-act="cleanup" title="移除不是介面文字的項目、改用樣板的動態字串、已有內建譯文的項目">清理雜訊</button>
      <button data-act="clear">清除收集紀錄</button>
    </div>
  </section>
  <section>
    <h3>進階</h3>
    <div class="row">
      <button data-act="copy">複製本頁未翻譯字串</button>
      <button data-act="edit">以 JSON 編輯自訂詞庫</button>
      <button data-act="import">匯入／管理語言包</button>
    </div>
    <textarea spellcheck="false"></textarea>
    <div class="row save-row" style="display:none"><button class="primary" data-act="save">儲存並套用</button><button data-act="cancel">取消</button></div>
    <div class="msg"></div>
  </section>
  </div>`;
    const $ = (s) => box.querySelector(s);
    for (const L of languageList()) {
      const lab = document.createElement('label');
      lab.className = 'opt';
      lab.innerHTML = '<input type="radio" name="ghzh-lang"> <span></span>';
      lab.querySelector('span').textContent = L.name;
      const r = lab.querySelector('input');
      r.value = L.id; r.checked = L.id === lang;
      r.addEventListener('change', () => { setLang(L.id); refreshStat(); });
      $('.langs').appendChild(lab);
    }
    const cCollect = $('.collect'), cMT = $('.automt');
    cCollect.checked = collect;
    cMT.checked = autoMT;
    cCollect.addEventListener('change', () => { setCollect(cCollect.checked); refreshStat(); });
    cMT.addEventListener('change', () => { setAutoMT(cMT.checked); refreshStat(); });

    // 翻譯服務設定：油猴版直接在面板設定；擴充版在擴充的設定頁（金鑰不經過網頁）
    const mtBox = $('.mtcfg');
    if (P.mtInPage) {
      mountMTForm(mtBox, {
        load: P.getMT,
        save: async (c) => { P.setMT(c); mtFails = 0; mtError = ''; refreshStat(); },
        listModels: P.listModels,
        test: () => P.translate({ lang: dict ? lang : 'zh-TW', langName: langName(), texts: ['Pull requests', 'Save changes', 'Copy permalink'], glossary: glossary() }),
      });
    } else {
      mtBox.innerHTML = '<div class="row" style="margin:0"><button data-act="options">翻譯服務設定…</button></div>';
    }

    const msg = $('.msg'), ta = $('textarea'), saveRow = $('.save-row');
    let mode = null;
    const say = (t, err) => { msg.textContent = t; msg.className = 'msg' + (err ? ' err' : ''); };
    const showEditor = (m, text) => { mode = m; ta.value = text; ta.style.display = 'block'; saveRow.style.display = 'flex'; ta.focus(); };
    const hideEditor = () => { mode = null; ta.style.display = 'none'; saveRow.style.display = 'none'; };

    async function refreshStat() {
      const h = (await P.harvestGet()) || {};
      const L = allLocales()[lang];
      let todo = 0;
      for (const k of Object.keys(h)) if (!ignoreSet.has(k) && !(L && L.entries[k]) && !((customDict[lang] || {})[k]) && !((autoDict[lang] || {})[k])) todo++;
      const m = Object.keys(autoDict[lang] || {}).length, c = Object.keys(customDict[lang] || {}).length;
      $('.stat').textContent = dict
        ? `目前語言：待翻譯 ${todo} 筆 · 機器翻譯 ${m} 筆 · 自訂 ${c} 筆` + (mtError ? `　⚠ 翻譯服務錯誤：${mtError}` : '')
        : '「保持原文」模式不會收集或翻譯。';
    }
    refreshStat();

    box.addEventListener('click', async (e) => {
      const btn = e.target.closest && e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'close') wrap.remove();
      else if (act === 'review') renderReview(wrap);
      else if (act === 'options') P.openOptions();
      else if (act === 'export') {
        download(`GitHub多國語言-貢獻檔-${new Date().toISOString().slice(0, 10)}.json`, await exportContrib());
        say('已下載貢獻檔。');
      } else if (act === 'cleanup') {
        if (!dict) { say('「保持原文」模式沒有資料可清理，請先選擇語言。', true); return; }
        say('清理中…');
        say(await runCleanup()); refreshStat();
      } else if (act === 'clear') {
        if (!confirm('確定清除所有收集到的未翻譯字串紀錄？（不會刪除已翻譯的內容）')) return;
        await P.harvestClear(); sessionSeen.clear(); refreshStat(); say('已清除收集紀錄。');
      } else if (act === 'copy') {
        const json = untranslatedJSON();
        P.clip(json);
        say(`已複製本頁 ${Object.keys(JSON.parse(json)).length} 筆未翻譯字串。`);
      } else if (act === 'edit') {
        if (!dict) { say('「保持原文」模式沒有詞庫可編輯，請先選擇語言。', true); return; }
        showEditor('dict', JSON.stringify(customDict[lang] || {}, null, 2));
        say(`正在編輯「${langName()}」的自訂詞庫，格式：{"原文": "譯文"}`);
      } else if (act === 'import') {
        showEditor('locales', JSON.stringify(extraLocales, null, 2));
        say('格式：{"ko": {"name": "한국어", "htmlLang": "ko", "entries": {"Code": "코드"}, "rules": []}}');
      } else if (act === 'cancel') { hideEditor(); say(''); }
      else if (act === 'save') {
        try {
          const obj = JSON.parse(ta.value || '{}');
          if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('最外層必須是物件 { }');
          if (mode === 'dict') {
            for (const k of Object.keys(obj)) if (typeof obj[k] !== 'string') throw new Error(`「${k}」的譯文必須是字串`);
            const all = Object.assign({}, customDict); all[lang] = obj;
            setCustomDict(all);
          } else {
            for (const [id, L] of Object.entries(obj)) if (!L || typeof L.entries !== 'object') throw new Error(`語言包「${id}」缺少 entries`);
            setExtraLocales(obj);
            renderMain(wrap); return;
          }
          hideEditor(); say('已儲存並套用。'); refreshStat();
        } catch (err) { say('JSON 格式錯誤：' + err.message, true); }
      }
    });
  }

  async function renderReview(wrap) {
    // 換一個新的 .box 元素：舊的事件處理器會跟著舊元素一起丟掉，避免重複觸發
    const oldBox = wrap.querySelector('.box');
    const box = oldBox.cloneNode(false);
    oldBox.replaceWith(box);
    box.className = 'box wide';
    if (!dict) { renderMain(wrap); return; }
    box.innerHTML = `
  <header><span>審核翻譯：${esc(langName())}</span><span class="row" style="margin:0"><button data-act="back">返回設定</button><button class="x" data-act="close" aria-label="關閉">×</button></span></header>
  <div class="toolbar">
    <div class="tabs"><button data-tab="todo">待翻譯</button><button data-tab="machine">機器翻譯</button><button data-tab="custom">已確認</button><button data-tab="all">全部</button></div>
    <input type="search" placeholder="搜尋原文或譯文…">
    <button data-act="mtall">機器翻譯全部待翻譯</button>
    <button data-act="acceptall">接受全部機器翻譯</button>
    <button data-act="cleanup" title="移除不是介面文字的項目、改用樣板的動態字串、已有內建譯文的項目">清理雜訊</button>
    <button data-act="reset" title="清除目前語言的自訂譯文、機器翻譯與收集紀錄，改用內建詞庫">重設</button>
  </div>
  <div class="body"></div>
  <div class="toolbar" style="border:0;border-top:1px solid var(--borderColor-muted,#d8dee4)"><span class="msg" style="margin:0;flex:1"></span><button data-act="export">匯出貢獻檔</button></div>`;
    const body = box.querySelector('.body'), msg = box.querySelector('.msg'), search = box.querySelector('input[type=search]');
    const say = (t, err) => { msg.textContent = t; msg.className = 'msg' + (err ? ' err' : ''); };
    let tab = 'todo', limit = 200, harvest = (await P.harvestGet()) || {};

    function rows() {
      const builtin = (allLocales()[lang] || {}).entries || {};
      const c = customDict[lang] || {}, m = autoDict[lang] || {};
      const keys = new Set([...Object.keys(harvest), ...Object.keys(m), ...Object.keys(c)]);
      const q = search.value.trim().toLowerCase();
      const out = [];
      for (const k of keys) {
        if (ignoreSet.has(k)) continue;
        const state = c[k] ? 'custom' : m[k] ? 'machine' : builtin[k] ? 'builtin' : 'todo';
        if (state === 'builtin') continue;
        if (tab !== 'all' && tab !== state) continue;
        const v = c[k] || m[k] || '';
        if (q && k.toLowerCase().indexOf(q) < 0 && v.toLowerCase().indexOf(q) < 0) continue;
        const e = harvest[k] || { n: 0, p: [] };
        out.push({ k, v, state, n: e.n, p: e.p });
      }
      out.sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
      return out;
    }
    function render() {
      box.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      const list = rows();
      if (!list.length) {
        body.innerHTML = `<div class="empty">${tab === 'todo' ? '目前沒有待翻譯的字串。瀏覽更多 GitHub 頁面後會自動收集。' : '沒有符合的項目。'}</div>`;
        return;
      }
      body.innerHTML = '<table><thead><tr><th>原文</th><th>譯文（Enter 儲存）</th><th></th></tr></thead><tbody>' +
        list.slice(0, limit).map((r) => `<tr data-k="${esc(r.k)}">
          <td class="src">${esc(r.k)}${r.state === 'machine' ? '<span class="tag m">機器</span>' : r.state === 'custom' ? '<span class="tag c">已確認</span>' : ''}
            <small>${r.n ? `出現 ${r.n} 次` : ''}${r.p && r.p.length ? ' · ' + esc(r.p.slice(0, 3).join('、')) : ''}</small></td>
          <td><input type="text" value="${esc(r.v)}" placeholder="輸入譯文"></td>
          <td class="act"><button data-act="ok" title="儲存為已確認">✓</button> <button data-act="ign" title="忽略（不是介面文字，不再收集）">忽略</button></td></tr>`).join('') +
        '</tbody></table>' + (list.length > limit ? `<div class="row" style="padding:8px 16px"><button data-act="more">再顯示 ${Math.min(200, list.length - limit)} 筆（共 ${list.length} 筆）</button></div>` : '');
      say(`共 ${list.length} 筆`);
    }
    function saveRow(tr) {
      const k = tr.dataset.k, v = tr.querySelector('input').value.trim();
      const all = Object.assign({}, customDict);
      const c = Object.assign({}, all[lang] || {});
      if (v) c[k] = v; else delete c[k];
      all[lang] = c;
      setCustomDict(all);
      tr.querySelector('td.src').querySelectorAll('.tag').forEach((n) => n.remove());
      if (v) tr.querySelector('td.src').insertAdjacentHTML('beforeend', '<span class="tag c">已確認</span>');
      say(v ? `已儲存：${k} → ${v}` : `已移除自訂譯文：${k}`);
    }

    box.addEventListener('click', async (e) => {
      const tb = e.target.closest && e.target.closest('[data-tab]');
      if (tb) { tab = tb.dataset.tab; limit = 200; render(); return; }
      const btn = e.target.closest && e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act, tr = btn.closest('tr');
      if (act === 'close') wrap.remove();
      else if (act === 'back') renderMain(wrap);
      else if (act === 'more') { limit += 200; render(); }
      else if (act === 'ok' && tr) saveRow(tr);
      else if (act === 'ign' && tr) {
        const k = tr.dataset.k;
        ignoreSet.add(k); setIgnore([...ignoreSet]);
        if (autoDict[lang] && autoDict[lang][k]) { const all = Object.assign({}, autoDict); all[lang] = Object.assign({}, all[lang]); delete all[lang][k]; setAutoDict(all); }
        tr.remove(); say('已忽略：' + k);
      } else if (act === 'export') {
        download(`GitHub多國語言-貢獻檔-${new Date().toISOString().slice(0, 10)}.json`, await exportContrib());
        say('已下載貢獻檔。');
      } else if (act === 'cleanup') {
        const m = await runCleanup();
        harvest = (await P.harvestGet()) || {};
        render(); say(m);
      } else if (act === 'reset') {
        if (!confirm(`清除「${langName()}」的所有自訂譯文、機器翻譯與收集紀錄，改回只用內建詞庫？此動作無法復原，建議先匯出貢獻檔。`)) return;
        await resetLang();
        harvest = {};
        render(); say('已重設，現在只使用內建詞庫。');
      } else if (act === 'acceptall') {
        const m = autoDict[lang] || {};
        const n = Object.keys(m).length;
        if (!n) { say('沒有機器翻譯可接受。', true); return; }
        if (!confirm(`將 ${n} 筆機器翻譯全部標記為已確認？`)) return;
        const all = Object.assign({}, customDict);
        all[lang] = Object.assign({}, m, all[lang] || {});
        setCustomDict(all);
        render(); say(`已接受 ${n} 筆。`);
      } else if (act === 'mtall') {
        const prevTab = tab; tab = 'todo';
        const keys = rows().map((r) => r.k);
        tab = prevTab;
        if (!keys.length) { say('沒有待翻譯的字串。', true); return; }
        btn.disabled = true;
        try {
          await translateNow(keys, (d, t) => say(`機器翻譯中… ${d}／${t}`));
          tab = 'machine'; render(); say(`機器翻譯完成，請檢查後按 ✓ 確認，或按「接受全部機器翻譯」。`);
        } catch (err) { say('翻譯失敗：' + err.message, true); }
        btn.disabled = false;
      }
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('td input')) { e.preventDefault(); saveRow(e.target.closest('tr')); }
    });
    let st = null;
    search.addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { limit = 200; render(); }, 150); });
    render();
  }

  /* ---------------- 啟動 ---------------- */
  function start() {
    root = document.documentElement;
    origHtmlLang = root.getAttribute('lang') || 'en';
    observe();
    full();
  }
  if (document.documentElement) start();
  else {
    // 極早期注入時 <html> 尚未建立，等它一出現就立刻開始
    const boot = new MutationObserver(() => {
      if (document.documentElement) { boot.disconnect(); start(); }
    });
    boot.observe(document, { childList: true });
  }
  let lastPath = location.pathname;
  const resetRecord = () => { if (location.pathname !== lastPath) { lastPath = location.pathname; recordDone.clear(); pageUntranslated.clear(); } };
  document.addEventListener('turbo:load', resetRecord);
  addEventListener('popstate', resetRecord);
  const rescan = () => { handle(observer.takeRecords()); doHtmlLang(); doTitle(); if (document.body) walk(document.body); observer.takeRecords(); };
  document.addEventListener('DOMContentLoaded', rescan);
  document.addEventListener('turbo:load', rescan);
  document.addEventListener('turbo:render', rescan);

  return {
    languages: languageList,
    getLang: () => lang,
    setLang, setCollect, setAutoMT, setCustomDict, setAutoDict, setExtraLocales, setIgnore,
    getCollect: () => collect,
    getAutoMT: () => autoMT,
    getCustomDict: () => customDict,
    getAutoDict: () => autoDict,
    getExtraLocales: () => extraLocales,
    untranslatedJSON, exportContrib, cleanupData, tokenize,
    stats: () => ({ page: pageUntranslated.size, machine: Object.keys(autoDict[lang] || {}).length, mtError, mtCount }),
    applySettings, openPanel,
  };
}
