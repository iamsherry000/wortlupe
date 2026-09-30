// P6（SPEC §5、§5.1）生字本／單字本：同一份清單（K1），以原形去重；每個字兩張卡（德→意思、意思→德），各自有熟悉度（K4）。
// 全部只存在這支手機（IndexedDB）。儲存後端可替換：瀏覽器用 idbBackend，單元測試用 memoryBackend。
import { newCard, answerCard, moveCard as moveCardState, buildQueue, GROUPS, dayNumber } from './leitner.js';

export class WordbookError extends Error {}

const DB_NAME = 'wortlupe';
const DB_VERSION = 1;

// ---------- 後端 ----------
export function memoryBackend() {
  const words = new Map();
  const meta = new Map();
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  return {
    async getAll() { return [...words.values()].map(clone); },
    async get(key) { return clone(words.get(key)); },
    async putMany(recs) { for (const r of recs) words.set(r.key, clone(r)); },
    async delete(key) { words.delete(key); },
    async getMeta(id) { return clone(meta.get(id)); },
    async putMeta(obj) { meta.set(obj.id, clone(obj)); },
  };
}

export function idbBackend(name = DB_NAME) {
  let dbp = null;
  const open = () => {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(name, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('words')) db.createObjectStore('words', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  };
  const run = async (store, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      let result;
      const req = fn(tx.objectStore(store), (v) => { result = v; });
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  };
  return {
    getAll: () => run('words', 'readonly', (s) => s.getAll()),
    get: (key) => run('words', 'readonly', (s) => s.get(key)),
    // 一次匯入＝一個交易：要嘛全部寫進去，要嘛全部沒寫（不會只寫一半還說成功）
    putMany: (recs) => run('words', 'readwrite', (s) => { for (const r of recs) s.put(r); }),
    delete: (key) => run('words', 'readwrite', (s) => s.delete(key)),
    getMeta: (id) => run('meta', 'readonly', (s) => s.get(id)),
    putMeta: (obj) => run('meta', 'readwrite', (s) => s.put(obj)),
  };
}

// ---------- 卡片內容 ----------
// 意思 → 德 的正面：Your note；沒有 note 就用字典英文第一個義項；兩個都沒有 → 這個字不出這個方向（SPEC §5.1 C）
export function reversePrompt(word) {
  if (word.notes && word.notes.length) return word.notes.join('\n');
  const d = word.dict;
  if (!d) return null;
  if (d.readings) for (const r of d.readings) if (r.glosses && r.glosses.length) return r.glosses[0];
  if (d.usage && d.usage.length && d.usage[0].gloss) return d.usage[0].gloss;
  return null;
}

function snapshot(entry) {
  return JSON.parse(JSON.stringify({
    display: entry.display, restored: entry.restored || null, status: entry.status, dict: entry.dict || null,
  }));
}

function freshWord(entry, now) {
  return {
    key: entry.key, ...snapshot(entry), notes: [], typed: [], contexts: [],
    createdAt: now, updatedAt: now, cards: { fwd: newCard(), rev: newCard() },
  };
}

function addUnique(list, v) {
  if (v !== null && v !== undefined && v !== '' && !list.includes(v)) list.push(v);
}

// 同一原形已經在本裡：不新增，解釋不同才加，寫法保留，熟悉度不動
function mergeInto(word, entry, now) {
  addUnique(word.notes, entry.note);
  addUnique(word.typed, entry.typed || entry.german);
  // 之前查不到、這次查得到（例：按了拼字建議）才補字典資料；查得到的不會被覆寫
  if (word.status !== 'found' && entry.status === 'found') Object.assign(word, snapshot(entry));
  word.updatedAt = now;
  return word;
}

const wrap = async (fn) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof WordbookError) throw e;
    throw new WordbookError(`Could not save to this phone’s storage (${e && (e.name || e.message) ? (e.name || e.message) : 'unknown error'}).`);
  }
};

export function createWordbook(backend, { today = () => dayNumber(new Date()), now = () => Date.now() } = {}) {
  const all = () => wrap(() => backend.getAll()).then((ws) => ws.sort((a, b) => a.createdAt - b.createdAt || (a.key < b.key ? -1 : 1)));

  async function introduced() {
    const m = await wrap(() => backend.getMeta('introduced'));
    return m && m.day === today() ? new Set(m.keys) : new Set();
  }
  // 「今天開始學的字」一個一個排隊寫（讀→改→寫），快速連答也不會漏記（每天新字上限靠它）
  let metaChain = Promise.resolve();
  function markIntroduced(key) {
    const p = metaChain.then(async () => {
      const keys = await introduced();
      if (keys.has(key)) return;
      keys.add(key);
      await wrap(() => backend.putMeta({ id: 'introduced', day: today(), keys: [...keys] }));
    });
    metaChain = p.catch(() => {});
    return p;
  }

  const wb = {
    all,
    get: (key) => wrap(() => backend.get(key)),

    // 預覽的每一筆 → 寫進本裡；回傳 { added, merged }。寫入失敗整批不算數（丟 WordbookError）
    async importEntries(entries) {
      const existing = new Map((await all()).map((w) => [w.key, w]));
      const touched = new Map();
      let added = 0, merged = 0;
      let t = now();
      for (const e of entries) {
        if (!e || !e.key) continue;
        const cur = touched.get(e.key) || existing.get(e.key);
        if (cur) {
          if (!touched.has(e.key) && existing.has(e.key)) merged++;
          touched.set(e.key, mergeInto(cur, e, t));
        } else {
          added++;
          touched.set(e.key, mergeInto(freshWord(e, t++), e, t));
        }
      }
      await wrap(() => backend.putMany([...touched.values()]));
      return { added, merged };
    },

    // 閱讀頁「存生字」（SPEC §5）：同一原形累加「原句＋日期」
    async saveFromReader(entry, sentence) {
      const cur = (await wb.get(entry.key)) || freshWord(entry, now());
      mergeInto(cur, { ...entry, note: null }, now());
      if (sentence && !cur.contexts.some((c) => c.sentence === sentence)) cur.contexts.push({ sentence, date: new Date(now()).toISOString().slice(0, 10) });
      await wrap(() => backend.putMany([cur]));
      return cur;
    },

    async queue() {
      const words = (await all()).map((w) => ({ key: w.key, cards: reversePrompt(w) === null ? { fwd: w.cards.fwd } : w.cards }));
      return buildQueue(words, today(), { introducedKeys: await introduced() });
    },

    // 翻面自評的結果寫回去；只動這個方向的卡
    async setCard(key, dir, card) {
      const w = await wb.get(key);
      if (!w) return null;
      const before = w.cards[dir];
      w.cards[dir] = card;
      await wb.saveAnswer(w, dir, before);
      return w;
    },
    // 複習畫面用：手上已經有整個字的最新狀態，直接整筆寫入（不先讀，連續作答不互相蓋掉）
    async saveAnswer(word, dir, before) {
      word.updatedAt = now();
      const put = wrap(() => backend.putMany([word]));
      const wasNew = !before || before.due === null || before.due === undefined;
      await Promise.all([put, wasNew && word.cards[dir].due !== null ? markIntroduced(word.key) : null]);
      return word;
    },
    async answer(key, dir, grade) {
      const w = await wb.get(key);
      if (!w) return null;
      return wb.setCard(key, dir, answerCard(w.cards[dir], grade, today()));
    },
    async moveCard(key, dir, box) {
      const w = await wb.get(key);
      if (!w) return null;
      w.cards[dir] = moveCardState(w.cards[dir], box, today());
      await wrap(() => backend.putMany([w]));
      return w;
    },
    remove: (key) => wrap(() => backend.delete(key)),

    // 分組頁：每組幾張卡（沒有反向提示的字只算正向）
    async counts() {
      const c = Object.fromEntries(GROUPS.map((g) => [g, 0]));
      for (const w of await all()) {
        c[GROUPS[w.cards.fwd.box]]++;
        if (reversePrompt(w) !== null) c[GROUPS[w.cards.rev.box]]++;
      }
      return c;
    },
    today,
  };
  return wb;
}

// ---------- 匯出（SPEC §5 ＋ §5.1 D）----------
// Markdown 表格：原形｜詞性｜英文｜原句，加「組別」與 Sherry 的解釋。
// 表格格子裡不能有換行與 |：換行寫成 <br>、| 寫成 \|（Markdown 的標準寫法，字本身不改）
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

export function exportMarkdown(words) {
  const head = '| Word | Part of speech | English | Your note | Group (German → meaning / meaning → German) | Sentences |';
  const rows = [head, '| --- | --- | --- | --- | --- | --- |'];
  for (const w of words) {
    const d = w.dict;
    let pos = '', english = '';
    if (!d) english = 'Not in dictionary';
    else if (d.readings) {
      pos = [...new Set(d.readings.map((r) => r.posLabel))].join(', ');
      english = [...new Set(d.readings.flatMap((r) => r.glosses))].slice(0, 3).join('; ');
    } else if (d.usage) {
      pos = 'phrase';
      english = d.usage.map((u) => `${u.pattern} — ${u.gloss}`).join('; ');
    }
    const group = `${GROUPS[w.cards.fwd.box]} / ${reversePrompt(w) === null ? '—' : GROUPS[w.cards.rev.box]}`;
    const sentences = (w.contexts || []).map((c) => cell(`${c.sentence} (${c.date})`)).join('<br>');
    rows.push(`| ${cell(w.display)} | ${cell(pos)} | ${cell(english)} | ${(w.notes || []).map(cell).join('<br>')} | ${group} | ${sentences} |`);
  }
  return rows.join('\n');
}
