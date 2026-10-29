/* 背景服務：機器翻譯（避開網頁 CORS、保護 API 金鑰）與收集紀錄的集中儲存 */
'use strict';
const MT = GitHubZhMT(async (url, opt) => {
  const r = await fetch(url, { method: opt.method || 'GET', headers: opt.headers, body: opt.body, credentials: 'omit' });
  return { status: r.status, text: await r.text() };
});

// 收集紀錄由背景統一寫入，避免多個分頁同時寫入互相覆蓋
let chain = Promise.resolve();
function harvestAdd(d) {
  chain = chain.then(() => new Promise((res) => {
    chrome.storage.local.get('harvest', (s) => {
      const h = mergeHarvest((s && s.harvest) || {}, d || {});
      chrome.storage.local.set({ harvest: h }, res);
    });
  }));
  return chain;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'ghzh:translate') {
    chrome.storage.local.get('mt', async (s) => {
      try { reply({ ok: true, result: await MT.translate(s.mt, msg.req) }); }
      catch (e) { reply({ ok: false, error: String((e && e.message) || e) }); }
    });
    return true;
  }
  if (msg.type === 'ghzh:listModels') {
    MT.listModels(msg.cfg).then((result) => reply({ ok: true, result }), (e) => reply({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'ghzh:harvestAdd') { harvestAdd(msg.data).then(() => reply({ ok: true })); return true; }
  if (msg.type === 'ghzh:harvestGet') { chain.then(() => chrome.storage.local.get('harvest', (s) => reply((s && s.harvest) || {}))); return true; }
  if (msg.type === 'ghzh:harvestClear') { chain = chain.then(() => new Promise((r) => chrome.storage.local.set({ harvest: {} }, r))); chain.then(() => reply({ ok: true })); return true; }
  if (msg.type === 'ghzh:openOptions') { chrome.runtime.openOptionsPage(); reply({ ok: true }); }
});
