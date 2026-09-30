// 測試用靜態伺服器（只在開發／測試用，上線不需要）。
// 會記下每一個打到伺服器的請求，TN 用它量「service worker 裝好後，網路請求數 = 0」：
// 從伺服器這端數，比從瀏覽器事件推測可靠（瀏覽器端分不清哪些由 SW 快取回應）。
// 離線測試（S07、T6）直接把伺服器關掉＝真的斷網，比 Playwright 的 setOffline 可靠（WebKit 在 setOffline 下 reload 會內部錯誤）。
//   GET  /__stats  → { count, paths }（不計入）
//   POST /__reset  → 歸零（不計入）
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};
// 只開放上線會用到的路徑，node_modules、build/raw 不給
const ALLOWED = /^\/(index\.html|setting(-en)?\.html|sw\.js|mt\/[\w.-]+|manifest\.webmanifest|src\/([\w-]+\/)?[\w.-]+\.(js|css)|data\/[\w.-]+\.json|data\/runtime\/[\w.-]+\.json|icons\/[\w.-]+)?$/;

export function startServer(port) {
  const state = { count: 0, paths: [] };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/__stats') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(state)); }
    if (url.pathname === '/__reset') { state.count = 0; state.paths = []; return res.end('ok'); }
    state.count++;
    state.paths.push(url.pathname);
    const p = decodeURIComponent(url.pathname);
    if (!ALLOWED.test(p)) { res.statusCode = 404; return res.end('not found'); }
    const file = normalize(join(ROOT, p === '/' ? 'index.html' : p));
    if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
    try {
      await stat(file);
      res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream');
      res.setHeader('cache-control', 'no-cache');
      res.end(await readFile(file));
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, () => resolve({
      url: `http://localhost:${port}`,
      state,
      reset() { state.count = 0; state.paths = []; },
      close() { server.closeAllConnections(); return new Promise((r) => server.close(() => r())); },
    }));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  const port = Number(process.env.PORT) || 4173;
  startServer(port).then((s) => console.log(`wortlupe test server ${s.url}`));
}
