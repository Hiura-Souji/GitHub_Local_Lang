(function () {
  'use strict';
  const style = document.createElement('style');
  style.textContent = MT_FORM_CSS;
  document.head.appendChild(style);

  const send = (msg) => new Promise((res, rej) => chrome.runtime.sendMessage(msg, (r) => {
    if (chrome.runtime.lastError || !r) return rej(new Error('背景服務沒有回應'));
    if (!r.ok) return rej(new Error(r.error));
    res(r.result);
  }));
  // 連線權限必須在使用者點擊時要求
  function ensurePermission(cfg) {
    if (cfg.provider === 'google') return Promise.resolve();
    let origin;
    try { const u = new URL(cfg.provider === 'anthropic' ? 'https://api.anthropic.com' : cfg.endpoint); origin = u.protocol + '//' + u.hostname + '/*'; }
    catch (e) { return Promise.reject(new Error('API 網址格式不正確')); }
    return new Promise((res, rej) => chrome.permissions.request({ origins: [origin] }, (ok) => (ok ? res() : rej(new Error('沒有取得連線到 ' + origin.replace('/*', '') + ' 的權限')))));
  }

  chrome.storage.local.get(['mt', 'lang'], (s) => {
    const lang = s.lang && s.lang !== 'en' ? s.lang : 'zh-TW';
    mountMTForm(document.getElementById('mt'), {
      load: () => s.mt || MT_DEFAULT,
      save: (cfg) => new Promise((r) => chrome.storage.local.set({ mt: cfg }, r)),
      beforeRemote: ensurePermission,
      listModels: (cfg) => send({ type: 'ghzh:listModels', cfg }),
      test: () => send({ type: 'ghzh:translate', req: { lang, texts: ['Pull requests', 'Save changes', 'Copy permalink'] } }),
    });
  });
})();
