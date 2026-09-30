// P2.7（SPEC §4.6）：離線整句翻譯（主執行緒）。
// 模型約 41 MB，不放進 App 安裝快取：第一次按下載才抓，存在自己的快取（wortlupe-mt），之後離線。
// service worker 換版時不會清掉這個快取（sw.js activate）。
export const MT_CACHE = 'wortlupe-mt';
export const MT_SIZE_LABEL = '41 MB';
const BASE = 'mt/';

let worker = null, loaded = null, nextId = 0;
const pending = new Map();

async function openCache() {
  if (!self.caches) throw new Error('This browser can’t store the translation model.');
  return caches.open(MT_CACHE);
}

// 已經下載好了嗎（manifest 最後才寫，所以有 manifest＝全部都在）。只讀本機快取，不發請求
export async function mtReady() {
  try {
    const c = await openCache();
    const m = await c.match(`${BASE}manifest.json`);
    if (!m) return false;
    const manifest = await m.json();
    const parts = Object.values(manifest.files).flatMap((f) => f.parts);
    for (const p of parts) if (!(await c.match(BASE + p))) return false;
    return true;
  } catch {
    return false;
  }
}

// 下載（有進度），完成後請瀏覽器盡量不要清掉
export async function downloadMt(onProgress = () => {}) {
  const c = await openCache();
  const res = await fetch(`${BASE}manifest.json`, { cache: 'reload' });
  if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
  const manifest = await res.clone().json();
  const total = manifest.totalBytes;
  let done = 0;
  for (const f of Object.values(manifest.files)) {
    for (const p of f.parts) {
      const hit = await c.match(BASE + p);
      if (hit) { done += (await hit.arrayBuffer()).byteLength; onProgress(done, total); continue; }
      const r = await fetch(BASE + p, { cache: 'reload' });
      if (!r.ok || !r.body) throw new Error(`${p}: HTTP ${r.status}`);
      const chunks = [];
      const reader = r.body.getReader();
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        chunks.push(value);
        done += value.byteLength;
        onProgress(done, total);
      }
      await c.put(BASE + p, new Response(new Blob(chunks)));
    }
  }
  await c.put(`${BASE}manifest.json`, res);
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* 不支援就算了 */ }
}

async function readFile(c, f) {
  const bufs = [];
  for (const p of f.parts) {
    const r = await c.match(BASE + p);
    if (!r) throw new Error(`${p} is missing — download the translation again`);
    bufs.push(new Uint8Array(await r.arrayBuffer()));
  }
  const out = new Uint8Array(f.bytes);
  let off = 0;
  for (const b of bufs) { out.set(b, off); off += b.byteLength; }
  if (off !== f.bytes) throw new Error('translation model is damaged — download it again');
  return out.buffer;
}

function load() {
  if (loaded) return loaded;
  loaded = (async () => {
    const c = await openCache();
    const m = await c.match(`${BASE}manifest.json`);
    if (!m) throw new Error('translation is not downloaded');
    const { files } = await m.json();
    const [model, lex, vocab, wasm, glue] = await Promise.all(['model', 'lex', 'vocab', 'wasm', 'glue'].map((k) => readFile(c, files[k])));
    worker = new Worker('src/mt-worker.js');
    worker.onmessage = (e) => {
      const d = e.data;
      const p = pending.get(d.id === undefined ? 'load' : d.id);
      if (!p) return;
      pending.delete(d.id === undefined ? 'load' : d.id);
      if (d.type === 'error') p.reject(new Error(d.message)); else p.resolve(d);
    };
    await new Promise((resolve, reject) => {
      pending.set('load', { resolve, reject });
      const text = new TextDecoder().decode(glue);
      worker.postMessage({ type: 'load', files: { model, lex, vocab, wasm, glue: text } }, [model, lex, vocab, wasm]);
    });
  })();
  loaded.catch(() => { loaded = null; if (worker) worker.terminate(); worker = null; });
  return loaded;
}

export async function translateText(text) {
  await load();
  const id = nextId++;
  const d = await new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ type: 'translate', id, text });
  });
  return d.text;
}
