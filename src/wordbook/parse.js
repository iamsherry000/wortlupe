// P6（SPEC §5.1 A）單字本批次貼上：一大塊德英中夾雜的文字 → 預覽的一筆一筆。
// 純函式（不碰 DOM、不碰儲存），字典由呼叫端傳入；Node 單元測試與瀏覽器共用。
//
// 硬規則（SPEC §5.1、§4.4）：
//   - Sherry 寫的解釋一字不改：note 一律是原文的切片（只去掉頭尾空白與行首的 =）
//   - 查不到就是查不到：status 'notfound' 時 dict = null，不生任何文法欄位
//   - 拼字建議只放在 flags.suggestion，沒按 acceptSuggestion 之前不採用
//   - 德文接德文、沒有 = → 各自一筆，不自己合併（mergeHint 只是提示，合併要 Sherry 按）
import { tokenize } from '../tokenize.js';
import { buildCard } from '../card-model.js';
import { closedList } from '../grammar/closed.js';
import { CONTRACTIONS } from '../grammar/german.js';
import { suggestSpelling } from './fuzzy.js';

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
// 同一行的分隔符號（SPEC §5.1 A）：第一個出現的那個左邊是德文、右邊是解釋
const SEPARATORS = [' - ', ' – ', '—', ':', '=', '|', '\t'];
const ARTICLE = { m: 'der', f: 'die', n: 'das', pl: 'die' };
const ARTICLES = new Set(['der', 'die', 'das']);
// 片語還原只換實詞（lebe → leben）；冠詞、代名詞、介系詞照她打的（die 不會變成 der）
const RESTORE_POS = new Set(['verb', 'noun', 'adj']);
// 德文段裡的字「也是常見英文字」時，德文讀法夠常見（原形詞頻前 5000）才算分界不確定（will、also）；
// 罕見的德文讀法（bill＝bellen 的命令式，名次 6863）當英文，分界清楚（Golden K：die Rechnung ‖ bill 帳單）
const COMMON_RANK = 5000;
const ENGLISH_MIN_COUNT = 3; // 在字典英文解釋裡出現 ≥ 3 次才算英文字（排除解釋裡偶爾引用的德文字，例 gehen 1 次）

let nextId = 1;
const englishCache = new WeakMap();

// 離線的英文字表：從字典自己的英文解釋收集（不另外下載英文字典）
function englishVocab(dict) {
  let v = englishCache.get(dict);
  if (v) return v;
  const count = new Map();
  for (const lemma in dict.lexicon) {
    for (const e of dict.lexicon[lemma]) {
      for (const g of e.glosses || []) for (const w of g.toLowerCase().match(/[a-z]+/g) || []) count.set(w, (count.get(w) || 0) + 1);
    }
  }
  v = new Set([...count].filter(([, n]) => n >= ENGLISH_MIN_COUNT).map(([w]) => w));
  englishCache.set(dict, v);
  return v;
}

function makeCtx(dict) {
  const english = englishVocab(dict);
  const isEnglish = (w) => /^[A-Za-z]+$/.test(w) && english.has(w.toLowerCase());
  // 這個字是不是字典查得到的德文（跟字卡同一套查法：變化形、封閉詞類、口語縮寫、介系詞縮寫、小寫名詞）
  const germanInfo = (w, initial) => {
    const lower = w.toLowerCase();
    const closed = closedList(dict.closed, w, initial);
    if (closed && closed.length) return { common: true };
    if (CONTRACTIONS[lower] || (dict.colloquial && dict.colloquial[lower])) return { common: true };
    const r = dict.lookup(w, { sentenceInitial: initial });
    if (r.found) {
      const rank = Math.min(...r.candidates.map((c) => c.entry.rank || Infinity));
      return { common: rank <= COMMON_RANK };
    }
    if (dict.lowercaseNouns && dict.lowercaseNouns[lower]) return { common: false };
    return null;
  };
  return { dict, isEnglish, germanInfo, memo: new Map() };
}

function findSeparator(line) {
  let best = null;
  for (const s of SEPARATORS) {
    const k = line.indexOf(s);
    if (k >= 0 && (!best || k < best.index)) best = { index: k, len: s.length };
  }
  return best;
}

const trimGerman = (s) => s.replace(/[\s\-–—:=|,;/]+$/u, '').trim();
const wordsOf = (line) => tokenize(line).filter((t) => t.type === 'word').map((t) => ({ text: t.text, start: t.start }));

// 沒有分隔符號的一行：從行首往後，字典查得到的德文算德文段；第一個中文字或查不到的字起全部是解釋
function greedy(line, words, ctx) {
  const { germanInfo, isEnglish } = ctx;
  const w0 = words[0];
  if (CJK.test(w0.text)) return { kind: 'note', text: line };
  let end = 1;
  let ambiguous = false;
  if (!germanInfo(w0.text, true)) {
    // 整行是英文 → 解釋行（bald ⏎ soon）
    if (isEnglish(w0.text)) return { kind: 'note', text: line };
    // 字典沒有、也不是英文 → 當成打錯的德文（feiren abend、Kündigunsfrist），交給拼字建議
    while (end < words.length && !CJK.test(words[end].text)
      && !(isEnglish(words[end].text) && !germanInfo(words[end].text, false))) end++;
  } else {
    while (end < words.length) {
      const w = words[end];
      if (CJK.test(w.text)) break;
      const g = germanInfo(w.text, false);
      if (!g) break;
      if (isEnglish(w.text)) {
        if (!g.common) break;
        ambiguous = true; // 常見德文＋常見英文（will、also）：可能屬於任一邊
      }
      end++;
    }
  }
  if (end >= words.length) return { kind: 'entry', german: line, note: null, checkSplit: false };
  const cut = words[end].start;
  return { kind: 'entry', german: trimGerman(line.slice(0, cut)), note: line.slice(cut).trim() || null, checkSplit: ambiguous };
}

function allGerman(text, ctx) {
  const ws = wordsOf(text);
  return ws.length > 0 && ws.every((w, k) => !CJK.test(w.text) && ctx.germanInfo(w.text, k === 0));
}

function parseLine(raw, ctx) {
  const line = raw.trim();
  if (!line) return { kind: 'blank' };
  if (line.startsWith('=')) return { kind: 'note', text: line.replace(/^=\s*/, ''), eq: true };
  const words = wordsOf(line);
  if (!words.length) return { kind: 'skip' }; // 只有 emoji／數字／網址／標點
  const sep = findSeparator(line);
  if (sep) {
    const left = line.slice(0, sep.index).trim();
    const right = line.slice(sep.index + sep.len).trim();
    if (!left || !wordsOf(left).length) return { kind: 'note', text: right };
    return { kind: 'entry', german: left, note: right || null, checkSplit: false };
  }
  // K5（預設）：有逗號、而且每一段都查得到才拆成多筆；否則當一筆、標 Check split
  if (line.includes(',') && !CJK.test(line)) {
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length > 1 && parts.every((p) => p && allGerman(p, ctx))) return { kind: 'multi', parts };
    if (parts.length > 1) return { ...greedy(line, words, ctx), checkSplit: true };
  }
  return greedy(line, words, ctx);
}

// ---------- 德文段 → 字典資料 ----------
function snapReading(r) {
  const o = { lemma: r.lemma, pos: r.pos, posLabel: r.posLabel, header: r.header, glosses: [...(r.glosses || [])] };
  for (const k of ['gender', 'plural', 'noPlural', 'pluralOnly', 'prepCase']) if (r[k] !== undefined) o[k] = Array.isArray(r[k]) ? [...r[k]] : r[k];
  if (r.verb) o.verb = JSON.parse(JSON.stringify(r.verb));
  if (r.adj) o.adj = JSON.parse(JSON.stringify(r.adj));
  return o;
}
const mainOf = (card) => card.readings.filter((r) => !r.other);

function notFound(german) {
  return { status: 'notfound', display: german, key: german, restored: null, from: null, dict: null, article: null };
}

export function analyzeGerman(german, dict) {
  const toks = tokenize(german);
  const wt = toks.filter((t) => t.type === 'word');
  if (!wt.length || wt.some((t) => CJK.test(t.text))) return notFound(german);
  let cards;
  try {
    cards = wt.map((t) => buildCard(toks, t.index, dict));
  } catch {
    return notFound(german);
  }
  // 片語裡有一個字查不到 → 整筆查不到（零編造：不拿查得到的那幾個字撐場面）
  if (cards.some((c) => c.status !== 'found' || !c.readings.length)) return notFound(german);

  let typed = null;
  let body = wt, bodyCards = cards;
  if (wt.length === 2 && ARTICLES.has(wt[0].text.toLowerCase()) && mainOf(cards[1]).some((r) => r.pos === 'noun')) {
    typed = wt[0].text.toLowerCase();
    body = [wt[1]];
    bodyCards = [cards[1]];
  }

  if (body.length === 1) {
    const card = bodyCards[0];
    const main = mainOf(card).length ? mainOf(card) : card.readings;
    const primary = (typed && main.find((r) => r.pos === 'noun')) || main[0];
    const same = main.filter((r) => r.lemma === primary.lemma && (!typed || r.pos === 'noun'));
    let display = primary.lemma;
    let article = null;
    if (primary.pos === 'noun') {
      const nouns = same.filter((r) => r.pos === 'noun' && r.gender);
      const arts = [...new Set(nouns.flatMap((r) => r.gender.map((g) => ARTICLE[g])))];
      if (arts.length) display = `${arts.join('/')} ${primary.lemma}`;
      if (typed && arts.length) {
        const allowed = new Set(arts);
        // 她打的是複數形（die Häuser）：die 也對
        const res = dict.lookup(body[0].text, { sentenceInitial: false });
        if (res.candidates.some((c) => c.lemma === primary.lemma && c.tags.includes('plural'))) allowed.add('die');
        if (!allowed.has(typed)) article = { dict: arts.join('/'), wrote: typed };
      }
    }
    const token = body[0].text;
    return {
      status: 'found', display, key: primary.lemma, restored: null, article,
      from: token.toLowerCase() !== primary.lemma.toLowerCase() ? token : null,
      dict: { kind: 'word', readings: same.map(snapReading) },
    };
  }

  // 片語（兩個字以上，SPEC §5.1 A 9/30）：正面照她打的，底下是還原成原形的版本；背面逐字拆解＋對得上的用法句型
  const breakdown = [];
  const restoredWords = [];
  const usage = [];
  const seenUsage = new Set();
  wt.forEach((t, k) => {
    const card = cards[k];
    const main = mainOf(card).length ? mainOf(card) : card.readings;
    const r = main[0];
    const forms = (r.formDescriptions || []).filter((d) => d !== 'dictionary form');
    breakdown.push({
      token: t.text, lemma: r.lemma, header: r.header, posLabel: r.posLabel, pos: r.pos,
      contextForm: r.contextForm ? [...r.contextForm] : null, forms,
      prepCase: r.prepCase || null, gloss: (r.glosses || [])[0] || null,
    });
    const keep = !RESTORE_POS.has(r.pos) || r.lemma.toLowerCase() === t.text.toLowerCase();
    restoredWords.push(keep ? t.text : r.lemma);
    for (const rr of main) for (const u of rr.usage || []) {
      if (!u.match || seenUsage.has(u.pattern)) continue;
      seenUsage.add(u.pattern);
      usage.push({ pattern: u.pattern, gloss: u.gloss, example: u.example ? [...u.example] : null });
    }
  });
  const restored = restoredWords.join(' ');
  return {
    status: 'found', display: german, key: restored, restored: restored !== german ? restored : null, from: null, article: null,
    dict: { kind: 'phrase', breakdown, usage },
  };
}

// ---------- 預覽的一筆 ----------
function noteOf(e) {
  const parts = [e.sameNote, ...e.attached].filter((x) => x !== null && x !== undefined && x !== '');
  return parts.length ? parts.join('\n') : null;
}

function finish(e, dict, ctx) {
  // 同一次貼上裡重複的德文段只查一次（300 行常有重複，TK 效能）
  let hit = ctx.memo.get(e.german);
  if (!hit) {
    const a0 = analyzeGerman(e.german, dict);
    let sug = null;
    if (a0.status === 'notfound') {
      const ws = wordsOf(e.german).map((w) => w.text);
      sug = suggestSpelling(ws, dict, (w) => !!ctx.germanInfo(w, false));
      if (sug === e.german) sug = null;
    }
    hit = { a: a0, suggestion: sug };
    ctx.memo.set(e.german, hit);
  }
  const a = { ...hit.a, dict: hit.a.dict ? JSON.parse(JSON.stringify(hit.a.dict)) : null };
  const note = noteOf(e);
  const suggestion = hit.suggestion;
  const hasMeaning = !!note || !!(a.dict && ((a.dict.readings && a.dict.readings.some((r) => r.glosses.length)) || (a.dict.usage && a.dict.usage.length)));
  return {
    ...e, ...a, note,
    splitWords: wordsOf(e.line),
    flags: { ...e.flags, article: a.article, suggestion, noMeaning: !hasMeaning },
  };
}

function newEntry(fields) {
  return {
    id: nextId++, line: fields.line, german: fields.german, sameNote: fields.note ?? null, attached: [],
    typed: fields.german,
    flags: { checkSplit: !!fields.checkSplit, mergeHint: !!fields.mergeHint, firstLineNote: !!fields.firstLineNote },
  };
}

// 整塊文字 → { entries, skipped }。字典要先 ready；這裡會把用到的分片載好
export async function importPreview(text, dict) {
  await dict.ready();
  const all = String(text ?? '');
  const words = tokenize(all).filter((t) => t.type === 'word' && !CJK.test(t.text)).map((t) => t.text);
  await dict.ensure([...new Set(words)]);
  const ctx = makeCtx(dict);
  const raw = [];
  let skipped = 0;
  // 上一筆是不是「只有一行德文、沒有解釋」：下一行又是德文時提示可以合併（不自動合併）
  let prevBare = false;
  for (const line of all.split(/\r\n|\r|\n/)) {
    const p = parseLine(line, ctx);
    if (p.kind === 'blank') continue;
    if (p.kind === 'skip') { skipped++; continue; }
    if (p.kind === 'note') {
      const prev = raw[raw.length - 1];
      if (prev) {
        prev.attached.push(p.text);
        prevBare = false;
      } else {
        // 第一行就是解釋（上面沒有德文）→ 當一筆、標 Check split
        raw.push(newEntry({ line: p.text, german: p.text, note: null, checkSplit: true, firstLineNote: true }));
        prevBare = false;
      }
      continue;
    }
    if (p.kind === 'multi') {
      for (const part of p.parts) raw.push(newEntry({ line: part, german: part, note: null }));
      prevBare = false;
      continue;
    }
    raw.push(newEntry({ line: line.trim(), german: p.german, note: p.note, checkSplit: p.checkSplit, mergeHint: prevBare }));
    prevBare = !p.note;
  }
  return { entries: raw.map((e) => finish(e, dict, ctx)), skipped };
}

async function refresh(e, dict) {
  await dict.ensure(wordsOf(`${e.german}`).map((w) => w.text));
  return finish(e, dict, makeCtx(dict));
}

// Merge into previous：這一筆（德文行＋掛在它下面的解釋行）整段變成上一筆的解釋
export async function mergeIntoPrevious(entries, i, dict) {
  if (i <= 0 || i >= entries.length) return entries;
  const prev = entries[i - 1], cur = entries[i];
  const text = [cur.line, ...cur.attached].join('\n');
  const merged = await refresh({ ...prev, attached: [...prev.attached, text] }, dict);
  return [...entries.slice(0, i - 1), merged, ...entries.slice(i + 1)];
}

// Split into new word：把掛錯的解釋拆出來成新的一筆（最後一行掛上來的解釋；沒有的話是同一行分出來的解釋）
export async function splitIntoNew(entries, i, dict) {
  const e = entries[i];
  if (!e) return entries;
  let text, rest;
  if (e.attached.length) {
    text = e.attached[e.attached.length - 1];
    rest = { ...e, attached: e.attached.slice(0, -1) };
  } else if (e.sameNote) {
    text = e.sameNote;
    rest = { ...e, sameNote: null, line: e.german };
  } else return entries;
  const ctx = makeCtx(dict);
  await dict.ensure(wordsOf(text).map((w) => w.text));
  const p = parseLine(text, ctx);
  const fresh = newEntry({ line: text, german: p.kind === 'entry' ? p.german : text, note: p.kind === 'entry' ? p.note : null, checkSplit: p.kind === 'entry' && p.checkSplit });
  return [...entries.slice(0, i), await refresh(rest, dict), await refresh(fresh, dict), ...entries.slice(i + 1)];
}

// Check split：Sherry 點第 k 個字 → 那個字起是解釋；k ≥ 字數 → 整行都是德文
export async function splitAt(entries, i, k, dict) {
  const e = entries[i];
  if (!e) return entries;
  const ws = wordsOf(e.line);
  let german, note;
  if (k >= ws.length || k <= 0) { german = e.line; note = null; } else { german = trimGerman(e.line.slice(0, ws[k].start)); note = e.line.slice(ws[k].start).trim() || null; }
  const next = await refresh({ ...e, german, typed: german, sameNote: note, flags: { ...e.flags, checkSplit: false, firstLineNote: false } }, dict);
  return [...entries.slice(0, i), next, ...entries.slice(i + 1)];
}

// 按了 "Did you mean …?" 才換；她原本打的寫法留在 typed
export async function acceptSuggestion(entries, i, dict) {
  const e = entries[i];
  if (!e || !e.flags.suggestion) return entries;
  const next = await refresh({ ...e, german: e.flags.suggestion, flags: { ...e.flags, suggestion: null } }, dict);
  return [...entries.slice(0, i), next, ...entries.slice(i + 1)];
}

export function removeEntry(entries, i) {
  return entries.filter((_, k) => k !== i);
}
