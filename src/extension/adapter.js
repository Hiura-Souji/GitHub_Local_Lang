/* 瀏覽器擴充轉接層：用 localStorage 鏡像讓設定能「同步」讀取，確保 document_start 即可翻譯
 * 注意：翻譯服務的 API 金鑰只存在 chrome.storage，由背景服務使用，不經過網頁 */
(function () {
  'use strict';
  const KEY = 'ghzh:settings';
  const KEYS = ['lang', 'collect', 'autoMT', 'customDict', 'autoDict', 'extraLocales', 'ignore'];
  let mirror = {};
  try { mirror = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { mirror = {}; }
  const saveMirror = () => { try { localStorage.setItem(KEY, JSON.stringify(mirror)); } catch (e) { /* 忽略 */ } };
  const send = (msg) => new Promise((res, rej) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => {
        if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message)); else res(r);
      });
    } catch (e) { rej(e); }
  });

  const api = GitHubZhCore({
    get: (k, d) => (k in mirror ? mirror[k] : d),
    set: (k, v) => { mirror[k] = v; saveMirror(); chrome.storage.local.set({ [k]: v }); },
    clip: (t) => navigator.clipboard.writeText(t),
    harvestAdd: (d) => send({ type: 'ghzh:harvestAdd', data: d }).catch(() => {}),
    harvestGet: () => send({ type: 'ghzh:harvestGet' }).then((r) => r || {}).catch(() => ({})),
    harvestClear: () => send({ type: 'ghzh:harvestClear' }),
    translate: (req) => send({ type: 'ghzh:translate', req }).then((r) => {
      if (!r || !r.ok) throw new Error((r && r.error) || '背景服務沒有回應');
      return r.result;
    }),
    listModels: () => Promise.resolve([]),
    mtInPage: false,
    openOptions: () => send({ type: 'ghzh:openOptions' }).catch(() => {}),
  });

  function merge(src) {
    const diff = {};
    for (const k of KEYS) {
      if (!(k in src)) continue;
      if (JSON.stringify(src[k]) !== JSON.stringify(mirror[k])) { diff[k] = src[k]; mirror[k] = src[k]; }
    }
    if (Object.keys(diff).length) { saveMirror(); api.applySettings(diff); }
  }

  chrome.storage.local.get(KEYS, (s) => merge(s || {}));
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    const s = {};
    for (const k of Object.keys(ch)) if (KEYS.indexOf(k) >= 0) s[k] = ch[k].newValue;
    merge(s);
  });
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg) return;
    if (msg.type === 'ghzh:stats') reply(api.stats());
    else if (msg.type === 'ghzh:panel') { api.openPanel(msg.view); reply({ ok: true }); }
  });
})();
