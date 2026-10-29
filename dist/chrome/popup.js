(function () {
  'use strict';
  const BUILTIN = [
    ['zh-TW', '正體中文（台灣）'],
    ['zh-HK', '繁體中文（香港）'],
    ['zh-CN', '简体中文'],
    ['ja', '日本語'],
  ];
  const $ = (id) => document.getElementById(id);
  const msg = (t) => { $('msg').textContent = t; };
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  const activeTab = () => new Promise((res) => chrome.tabs.query({ active: true, currentWindow: true }, (t) => res(t && t[0])));

  chrome.storage.local.get(['lang', 'collect', 'autoMT', 'extraLocales', 'autoDict', 'customDict', 'harvest'], (s) => {
    const lang = s.lang || 'zh-TW';
    const list = BUILTIN.slice();
    for (const [id, L] of Object.entries(s.extraLocales || {})) if (!list.some((x) => x[0] === id)) list.push([id, (L && L.name) || id]);
    list.push(['en', '保持原文（English）']);
    for (const [id, name] of list) {
      const lab = document.createElement('label');
      const r = document.createElement('input');
      r.type = 'radio'; r.name = 'lang'; r.value = id; r.checked = id === lang;
      r.addEventListener('change', () => chrome.storage.local.set({ lang: id }));
      lab.append(r, document.createTextNode(name));
      $('langs').appendChild(lab);
    }
    $('collect').checked = s.collect !== false;
    $('automt').checked = !!s.autoMT;
    const h = s.harvest || {};
    const m = Object.keys((s.autoDict || {})[lang] || {}).length;
    const c = Object.keys((s.customDict || {})[lang] || {}).length;
    $('stat').textContent = `已收集 ${Object.keys(h).length} 筆 · 機器翻譯 ${m} 筆 · 已確認 ${c} 筆`;
  });
  $('collect').addEventListener('change', (e) => chrome.storage.local.set({ collect: e.target.checked }));
  $('automt').addEventListener('change', (e) => chrome.storage.local.set({ autoMT: e.target.checked }));
  $('options').addEventListener('click', () => { chrome.runtime.openOptionsPage(); window.close(); });
  $('review').addEventListener('click', async () => {
    const tab = await activeTab();
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'ghzh:panel', view: 'review' }, (r) => {
      if (chrome.runtime.lastError || !r) return msg('請先開啟任一 GitHub 頁面再按這裡。');
      window.close();
    });
  });
})();
