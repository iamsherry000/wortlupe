// P0 查詢：字形 → 候選原形清單。純函式、無 I/O，瀏覽器與 Node 共用（資料由呼叫端載入後傳入）。
//
// 回傳 { token, found, candidates, ambiguous }
//   candidates：[{ lemma, pos, tags, gender?, entry, form }]，每個候選對應 lexicon 裡的一個條目
//   ambiguous：候選指向一個以上的條目（例 Band 有 das/der/die 三個）→ UI 必須全部列出，不擅自挑一個（SPEC §4.1-10）
//
// 大小寫規則（德文名詞一律大寫，所以大小寫本身就是資訊）：
//   - 小寫字：只查小寫，而且不回傳大寫開頭的原形（esse 不可變成 Esse「煙囪」）
//   - 句首大寫：原樣＋小寫都查（Kommst → kommen）
//   - 句中大寫：先查原樣；原樣完全查不到才退回小寫（Die Vereinigten Staaten 的形容詞）
//   - 全大寫（ACHTUNG）：原樣、首字大寫、小寫都查

// forms 的每筆記錄可以是 P0 正本格式 {lemma, pos, tags, i}，
// 或執行期分片的精簡格式 [lemma, pos, tagset 編號, i]（需同時傳 tagsets）。
export function createLookup({ forms, lexicon, tagsets }) {
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const decode = (r) => (Array.isArray(r) ? { lemma: r[0], pos: r[1], tags: tagsets[r[2]] || [], i: r[3] } : r);

  function collect(key) {
    if (!hasOwn(forms, key)) return [];
    const out = [];
    for (const rec of forms[key]) {
      const r = decode(rec);
      const entry = hasOwn(lexicon, r.lemma) ? lexicon[r.lemma][r.i] : undefined;
      if (!entry) continue; // 資料不一致時寧可不給，不編
      const c = { lemma: r.lemma, pos: r.pos, tags: r.tags, entry, form: key, i: r.i };
      if (entry.gender) c.gender = entry.gender;
      out.push(c);
    }
    return out;
  }

  return function lookup(token, { sentenceInitial = false } = {}) {
    const t = String(token ?? '').normalize('NFC').trim();
    const empty = { token: t, found: false, candidates: [], ambiguous: false };
    if (!t || !/^\p{L}/u.test(t)) return empty;

    const lower = t.toLowerCase();
    const firstUpper = /^\p{Lu}/u.test(t);
    const allCaps = t.length > 1 && t === t.toUpperCase() && t !== lower;
    const cap = lower.charAt(0).toUpperCase() + lower.slice(1);

    let candidates;
    if (allCaps) {
      candidates = [...collect(t), ...collect(cap), ...collect(lower)];
    } else if (firstUpper && sentenceInitial) {
      candidates = t === lower ? collect(t) : [...collect(t), ...collect(lower)];
    } else if (firstUpper) {
      candidates = collect(t);
      if (!candidates.length) candidates = collect(lower);
    } else {
      candidates = collect(t).filter((c) => !/^\p{Lu}/u.test(c.lemma));
    }

    const entries = new Set(candidates.map((c) => `${c.lemma}\t${c.i}`));
    return { token: t, found: candidates.length > 0, candidates, ambiguous: entries.size > 1 };
  };
}
