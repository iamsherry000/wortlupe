// 執行期字典：啟動時載入原形表與小檔（背景進行，不擋貼上），變化形分片用到才載入。
// 瀏覽器用 fetch（離線時由 service worker 快取回應）；Node 測試可傳入讀檔版 fetchImpl。
import { createLookup } from './lookup.js';
import { shardOf, shardName, fingerprint, FINGERPRINT_KEY } from './shard.js';
import { CONTRACTIONS } from './grammar/german.js';

export class DictionaryError extends Error {}
// P2.6（§6.1）：分片跟標籤表不是同一次建置（手機快取混版）
export class StaleDictionaryError extends DictionaryError {}

export function createDictionary({ base = './', fetchImpl = (u) => fetch(u) } = {}) {
  const forms = Object.create(null); // 已載入分片合併在這裡（不同分片的鍵不會重複）
  const shardPromises = new Map();
  const dict = {
    lexicon: null, tagsets: null, colloquial: {}, prepositions: {}, glossOverrides: {},
    error: null, lookup: null,
  };

  async function getText(path) {
    let res;
    try {
      res = await fetchImpl(base + path);
    } catch (e) {
      throw new DictionaryError(`${path}: ${e.message}`);
    }
    if (!res.ok) throw new DictionaryError(`${path}: HTTP ${res.status}`);
    return res.text();
  }
  function parse(path, text) {
    try {
      return JSON.parse(text);
    } catch {
      throw new DictionaryError(`${path}: file is damaged`);
    }
  }
  const getJSON = async (path) => parse(path, await getText(path));

  let tagsetsPrint = null;
  const getTagsets = async () => {
    const text = await getText('data/runtime/tagsets.json');
    tagsetsPrint = fingerprint(text);
    return parse('data/runtime/tagsets.json', text);
  };

  const readyPromise = (async () => {
    const [lexicon, tagsets, colloquial, prepositions, glossOverrides, closed, lowercaseNouns, usage] = await Promise.all([
      getJSON('data/lexicon.json'), getTagsets(), getJSON('data/colloquial.json'),
      getJSON('data/prepositions.json'), getJSON('data/gloss-overrides.json'), getJSON('data/closed-class.json'),
      getJSON('data/lowercase-nouns.json'), // P2.2 加修：WhatsApp 小寫名詞（zeit → Zeit）
      getJSON('data/usage.json'), // P2.6（§4.5 B）：用法句型（sich freuen auf + Akk）
    ]);
    if (!lexicon || typeof lexicon !== 'object' || !Array.isArray(tagsets)) throw new DictionaryError('dictionary format is damaged');
    Object.assign(dict, { lexicon, tagsets, colloquial, prepositions, glossOverrides, closed, lowercaseNouns: (lowercaseNouns && lowercaseNouns.forms) || {},
      usage: (usage && usage.entries) || {} });
    dict.lookup = createLookup({ forms, lexicon, tagsets });
  })();
  readyPromise.catch((e) => { dict.error = e; });

  const loaded = new Set();
  function loadShard(n) {
    if (!shardPromises.has(n)) {
      const p = Promise.all([getJSON(`data/runtime/${shardName(n)}`), readyPromise]).then(([data]) => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new DictionaryError(`${shardName(n)}: format is damaged`);
        const print = data[FINGERPRINT_KEY];
        delete data[FINGERPRINT_KEY];
        // 沒帶指紋的舊分片也當混版：寧可重新載入，不用對不上的標籤表解讀（§4.4 零編造）
        if (print !== tagsetsPrint) {
          const e = new StaleDictionaryError(`${shardName(n)}: built with a different tag table`);
          dict.error = e;
          throw e;
        }
        Object.assign(forms, data);
        loaded.add(n);
      });
      p.catch(() => shardPromises.delete(n)); // 失敗的分片下次可以重試
      shardPromises.set(n, p);
    }
    return shardPromises.get(n);
  }

  // 確保這些字（與它們的口語還原）查得到：原形表已載入＋所需分片已載入
  dict.ensure = async (words) => {
    await readyPromise;
    await Promise.all([...shardsFor(words)].map(loadShard));
  };

  function shardsFor(words) {
    const need = new Set();
    for (const w of words) {
      need.add(shardOf(w));
      const exp = dict.colloquial[String(w).toLowerCase()];
      if (Array.isArray(exp)) for (const e of exp) for (const part of e.split(/\s+/)) need.add(shardOf(part));
      // P2.1（M4）：縮寫字卡要查還原後的兩個字（im → in, dem），它們可能在別的分片
      const parts = CONTRACTIONS[String(w).toLowerCase()];
      if (parts) for (const part of parts) need.add(shardOf(part));
    }
    return need;
  }

  // 同步判斷「這個字現在就能查」：能的話介面直接畫卡片，不用等下一個 tick（T6）
  dict.isReadyFor = (w) => !!dict.lookup && [...shardsFor([w])].every((n) => loaded.has(n));
  dict.ready = () => readyPromise;
  return dict;
}
