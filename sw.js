// Wortlupe service worker：安裝時預先快取全部程式與字典，之後完全離線（TN：App 發出的網路請求數 = 0）。
// 改了任何檔案就把 VERSION 加一，舊快取會在啟用時清掉。
// 分片數必須跟 src/shard.js 的 SHARD_COUNT 一致；新增 src/ 下的檔案（例如一條新規則）要加進清單。
// 兩者都由 tests/p1-unit.test.js 的 TN 測試檢查。
// P2.6（§6.1）：DATA_BUILD 由 build/stamp-runtime.mjs 自動寫入（標籤表指紋），資料重建就自動換版，不用手動記得加一
const DATA_BUILD = '5ffb86ce';
const VERSION = `wortlupe-p6-beta-10-${DATA_BUILD}`;
// P2.7：翻譯模型（41 MB）存在自己的快取，第一次按下載才抓；換版時不清（src/translate.js）
const MT_CACHE = 'wortlupe-mt';
const SHARD_COUNT = 64; // 要跟 src/shard.js 一致（P2.5）

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './src/style.css',
  './src/app.js',
  './src/tokenize.js',
  './src/fragment.js',
  './src/chat-prefix.js',
  './src/dict.js',
  './src/lookup.js',
  './src/shard.js',
  './src/card-model.js',
  './src/context-form.js',
  './src/mt-normalize.js',
  './src/translate.js',
  './src/mt-worker.js',
  // P6 單字本（SPEC §5.1）
  './src/wordbook/parse.js',
  './src/wordbook/fuzzy.js',
  './src/wordbook/leitner.js',
  './src/wordbook/store.js',
  './src/wordbook/ui.js',
  './src/grammar/engine.js',
  './src/grammar/german.js',
  './src/grammar/sentence.js',
  './src/grammar/closed.js',
  './src/rules/index.js',
  './src/rules/g01-v2.js',
  './src/rules/g02-subordinate-verb-end.js',
  './src/rules/g03-relative-clause.js',
  './src/rules/g04-modal-infinitive.js',
  './src/rules/g05-perfect.js',
  './src/rules/g06-separable.js',
  './src/rules/g07-preposition-case.js',
  './src/rules/g08-contraction.js',
  './src/rules/g09-yes-no-question.js',
  './src/rules/g10-imperative.js',
  './src/rules/g11-negation.js',
  './src/rules/g12-konjunktiv2.js',
  './src/rules/g13-passive.js',
  './src/rules/g14-zu-infinitive.js',
  './src/rules/g15-article-case.js',
  './src/rules/g16-adjective-ending.js',
  './src/rules/g17-noun-suffix-gender.js',
  './src/rules/g18-verb-ending.js',
  './src/rules/g19-dative-plural-n.js',
  './src/rules/g20-genitive-s.js',
  './data/lexicon.json',
  './data/colloquial.json',
  './data/prepositions.json',
  './data/gloss-overrides.json',
  './data/closed-class.json',
  './data/lowercase-nouns.json',
  './data/usage.json',
  './data/english-words.json', // P6.6：單字本的離線英文詞表（SCOWL）
  './data/runtime/tagsets.json',
  ...Array.from({ length: SHARD_COUNT }, (_, n) => `./data/runtime/f-${String(n).padStart(2, '0')}.json`),
];

self.addEventListener('install', (event) => {
  // P2.6（§6.1）：繞過瀏覽器 HTTP 快取，否則新版快取可能混進舊的分片或標籤表
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION && key !== MT_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // 9/28 修：原本所有沒快取的頁面都回 App 本體，/setting 教學頁在已裝過 Wortlupe 的 Safari 永遠打不開。
    // 只有 App 自己的網址退回 index.html；其他頁面照常上網抓，離線時才退回 App
    if (req.mode === 'navigate') {
      const path = new URL(req.url).pathname;
      const appPath = path === self.registration.scope.replace(self.location.origin, '') || path.endsWith('/index.html');
      if (appPath) return (await cache.match('./index.html')) || fetch(req);
      try { return await fetch(req); } catch { return (await cache.match('./index.html')) || Response.error(); }
    }
    return fetch(req);
  })());
});
