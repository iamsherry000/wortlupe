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
import { suggestSpelling, closestLemma } from './fuzzy.js';

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
// 同一行的分隔符號（SPEC §5.1 A）：第一個出現的那個左邊是德文、右邊是解釋
const SEPARATORS = [' - ', ' – ', '—', ':', '=', '|', '\t'];
const ARTICLE = { m: 'der', f: 'die', n: 'das', pl: 'die' };
const ARTICLES = new Set(['der', 'die', 'das']);
// 片語還原只換實詞（lebe → leben）；冠詞、代名詞、介系詞照她打的（die 不會變成 der）
const RESTORE_POS = new Set(['verb', 'noun', 'adj']);
// 「常見德文」＝原形詞頻前 5000。只用在「整行都是英文字時，要不要當解釋行」：
// 常見德文（bald、Gift、Mama）照樣當一筆德文；罕見德文讀法（ID＝das Id）當英文解釋行
const COMMON_RANK = 5000;
// 行首條列符號（SPEC §5.1 F）：- • * · 1. 1)，後面要有空白
// P6.7：en dash – 也算（– Lampe lamp）
const BULLET = /^(?:[-–•*·‣▪]|\d{1,3}[.)])\s+/u;

let nextId = 1;

// P6.6（SPEC §5.1 F）：英文字＝離線英文詞表（SCOWL，data/english-words.json）裡有的字，
// 取代 P6 的「字典英文解釋裡出現過」（daycare、ID、fridge 都不在字典解釋裡）
const EN_SUFFIX = new Set(['s', 'm', 're', 've', 'll', 'd', 't']);
function makeCtx(dict, english) {
  // P6.8 N-a：英文縮寫（it's、I'm、where's、don't、can't）也算英文字
  const isEnglish = (w) => {
    const m = /^([A-Za-z]+)['’]([A-Za-z]{1,2})$/.exec(w);
    if (m) {
      const base = m[1].toLowerCase(), suf = m[2].toLowerCase();
      if (!EN_SUFFIX.has(suf)) return false;
      if (suf === 't') return english.has(base) || (base.endsWith('n') && english.has(base.slice(0, -1)));
      return english.has(base);
    }
    return /^[A-Za-z]+$/.test(w) && english.has(w.toLowerCase());
  };
  // 這個字是不是字典查得到的德文（跟字卡同一套查法：變化形、封閉詞類、口語縮寫、介系詞縮寫、小寫名詞）
  const germanInfo = (w, initial) => {
    const lower = w.toLowerCase();
    const closed = closedList(dict.closed, w, initial);
    if (closed && closed.length) return { common: true, closed: true };
    if (CONTRACTIONS[lower]) return { common: true };
    // 口語縮寫（mom＝Moment、hab）是德文，但不算「常見德文」：跟英文同形時（Mama mom）優先當英文解釋、照樣標
    if (dict.colloquial && dict.colloquial[lower]) return { common: false };
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

// P6.8 F3：括號、引號裡的東西屬於同一側。切點落在沒關上的 ( 或引號裡 → 退到那個符號前面
function safeCut(line, cut) {
  const left = line.slice(0, cut);
  let at = -1;
  const opens = (left.match(/\(/g) || []).length - (left.match(/\)/g) || []).length;
  if (opens > 0) at = left.lastIndexOf('(');
  if ((left.match(/"/g) || []).length % 2 === 1) at = Math.max(at, left.lastIndexOf('"'));
  if ((left.match(/„/g) || []).length > (left.match(/[“”]/g) || []).length) at = Math.max(at, left.lastIndexOf('„'));
  return at > 0 && left.slice(0, at).trim() ? at : cut;
}
// 括號、引號外面的字（判斷「整行是不是英文」時不看括號裡的補充：GP (BrE) 的 BrE）
function wordsOutside(line, words) {
  const inside = new Array(line.length).fill(false);
  let depth = 0, dq = false;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (ch === '(') depth++;
    if (ch === '"') dq = !dq;
    inside[k] = depth > 0 || dq;
    if (ch === ')' && depth > 0) depth--;
  }
  return words.filter((w) => !inside[w.start]);
}

// 沒有分隔符號的一行（SPEC §5.1 A＋F，P6.8 統一判準）。
// 原則：分界有一點不確定就標 Check split，不存在「切了但沒把握又沒標」的路徑。
//   1. 行尾字跟前一個字不分大小寫同拼法（Angst angst、Rucksack rucksack）→ 行尾是英文解釋、不標
//   2. 上一筆後面：括號外、中文外的每個字都是英文字 → 預設當上一筆的解釋；其中有字也查得到德文（Bank account、
//      Mode fashion）→ 上一筆標 Check split（note：這行也可能是新的德文字）。
//      例外：只有一個字、而且是常見德文（bald）→ 照 TESTS Golden K／S20 各自一筆，但標（maybeNote）
//   3. 沒有上一筆：第一個字不是德文、整行英文 → 沒有主人的解釋（呼叫端標 first）；單獨的德英同形字（Mama）→ 一筆德文、不標
//   4. 第一個字查不到也不是英文 → 打錯的德文：整行沒有英文、沒有中文時試「拆開寫的複合詞」（feiren abend）；
//      否則只有第一個字是德文段、後面是解釋（Termn ‖ appointmnet），一律標
//   5. 從第一個德文字往後吃查得到的德文；遇到英文（不是德文）→ 分界清楚；查不到也不是英文 → 切、標；
//      德英同形（will、also、bill、mom）→ 在它前面切、標（後面還有非德文、或德文讀法罕見、或它是行尾的非封閉詞類）；
//      否則照樣當德文、標。上一筆後面、第一個字德英同形（Party machen）→ 也可能是解釋，標
function greedy(line, words, ctx) {
  const { germanInfo, isEnglish } = ctx;
  const w0 = words[0];
  if (CJK.test(w0.text)) return { kind: 'note', text: line };
  const hasCJK = CJK.test(line);
  const englishOnly = (w) => isEnglish(w.text) && !germanInfo(w.text, false);
  const g0 = germanInfo(w0.text, true);
  const cutAt = (end, checkSplit, reason) => {
    if (end >= words.length) return { kind: 'entry', german: line, note: null, checkSplit, reason };
    const cut = safeCut(line, words[end].start);
    return { kind: 'entry', german: trimGerman(line.slice(0, cut)), note: line.slice(cut).trim() || null, checkSplit, reason };
  };
  // 1. 行尾同拼法
  const n = words.length;
  if (n >= 2 && g0 && words[n - 1].text.toLowerCase() === words[n - 2].text.toLowerCase() && words[n - 1].text !== words[n - 2].text) {
    return cutAt(n - 1, false, null);
  }
  // 2／3. 整行（括號外、中文外）都是英文字
  const outside = wordsOutside(line, words).filter((w) => !CJK.test(w.text));
  const englishLine = outside.length > 0 && outside.every((w) => isEnglish(w.text));
  if (englishLine && ctx.hasPrev) {
    const germanPossible = words.some((w, k) => !CJK.test(w.text) && germanInfo(w.text, k === 0));
    if (n === 1 && g0 && g0.common && !hasCJK) return cutAt(1, true, 'maybeNote');
    return { kind: 'note', text: line, germanInside: germanPossible };
  }
  if (englishLine && !ctx.hasPrev && !g0) return { kind: 'note', text: line };
  const prevAmbiguous = ctx.hasPrev && g0 && isEnglish(w0.text);
  if (!g0) {
    const anyEnglish = words.some(englishOnly);
    if (!anyEnglish && !hasCJK && words.length > 1 && closestLemma(words.map((w) => w.text).join(''), ctx.dict)) {
      // 拆開寫的複合詞（feiren abend → Feierabend）：整段當德文段、照樣標
      return { ...cutAt(words.length, true, 'typo'), compound: true };
    }
    // 第一個字打錯（有拼字建議）→ typo；連建議都沒有 → unknown（P6.7 N1：理由要對得上真正原因）
    return cutAt(1, true, closestLemma(w0.text, ctx.dict) ? 'typo' : 'unknown');
  }
  let end = 1;
  let unsure = null;
  while (end < words.length) {
    const w = words[end];
    if (CJK.test(w.text)) break;
    const g = germanInfo(w.text, false);
    const en = isEnglish(w.text);
    if (!g) {
      if (!en) unsure = 'unknown'; // 查不到也不是英文：可能是打錯的德文，也可能是解釋
      break;
    }
    if (en) {
      unsure = 'boundary'; // 德英同形
      const restNotGerman = words.slice(end + 1).some((x) => CJK.test(x.text) || !germanInfo(x.text, false));
      // 行尾最後一個字德英同形、又不是封閉詞類（Mama mom 的 mom）：多半是她寫的英文解釋 → 在前面切（照樣標）
      const lastOpen = end === words.length - 1 && !g.closed;
      if (restNotGerman || !g.common || lastOpen) break;
    }
    end++;
  }
  if (!unsure && prevAmbiguous) unsure = 'maybeNote';
  return cutAt(end, !!unsure, unsure);
}

function allGerman(text, ctx) {
  const ws = wordsOf(text);
  return ws.length > 0 && ws.every((w, k) => !CJK.test(w.text) && ctx.germanInfo(w.text, k === 0));
}

function parseLine(raw, ctx) {
  // 前後空白（含全形空白）去掉不算改字；行首條列符號去掉再解析（SPEC §5.1 F）
  const line = raw.trim().replace(BULLET, '').trim();
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
    if (parts.length > 1) {
      const g = greedy(line, words, ctx);
      return g.kind === 'entry' ? { ...g, checkSplit: true, reason: g.reason || 'comma' } : g;
    }
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
      // 只修德文段、逐字建議；拆開寫的複合詞只在整行沒有英文、沒有中文時才試（SPEC §5.1 F：不把 fridge「修」成 Bridge）
      const ws = wordsOf(e.german).map((w) => w.text);
      const lineWords = wordsOf(e.line || e.german);
      const allowCompound = !CJK.test(e.line || '') && !lineWords.some((w) => ctx.isEnglish(w.text) && !ctx.germanInfo(w.text, false));
      // P6.7 N2：英文字不給建議（so what → "so Chat"、self photo → "elf Photon"、soon → "Sohn" 都不准出現）
      sug = suggestSpelling(ws, dict, (w) => !!ctx.germanInfo(w, false) || ctx.isEnglish(w), allowCompound);
      // 建議跟她打的字一樣（只差標點，Na und? so what? → Na und so what）＝沒有建議
      if (sug === e.german || sug === ws.join(' ')) sug = null;
    }
    hit = { a: a0, suggestion: sug };
    ctx.memo.set(e.german, hit);
  }
  // 重複的德文段共用同一份字典資料（唯讀；存進本裡時 store 會另外複製）。
  // P6.8：原本每一筆都深拷貝一份，貼 2000 行時記憶體暴增，之後每載一片字典都卡 2–5 秒（GC）
  const a = hit.a;
  const note = noteOf(e);
  const suggestion = hit.suggestion;
  const hasMeaning = !!note || !!(a.dict && ((a.dict.readings && a.dict.readings.some((r) => r.glosses.length)) || (a.dict.usage && a.dict.usage.length)));
  // P6.8 F2：理由只寫畫面上真的有的東西——說 typo 就要有建議，沒有建議就是「查不到」
  const checkReason = e.flags.checkReason === 'typo' && !suggestion ? 'unknown' : e.flags.checkReason;
  return {
    ...e, ...a, note,
    splitWords: wordsOf(e.line),
    flags: { ...e.flags, checkReason, article: a.article, suggestion, noMeaning: !hasMeaning },
  };
}

function newEntry(fields) {
  return {
    id: nextId++, line: fields.line, german: fields.german, sameNote: fields.note ?? null, attached: [],
    typed: fields.german,
    flags: {
      checkSplit: !!fields.checkSplit, checkReason: fields.checkSplit ? (fields.reason || 'boundary') : null,
      mergeHint: !!fields.mergeHint, firstLineNote: !!fields.firstLineNote,
    },
  };
}

async function ctxFor(dict) {
  return makeCtx(dict, await dict.english());
}

// 整塊文字 → { entries, skipped }。字典要先 ready；這裡會把用到的分片載好
export async function importPreview(text, dict) {
  await dict.ready();
  const all = String(text ?? '');
  const words = tokenize(all).filter((t) => t.type === 'word' && !CJK.test(t.text)).map((t) => t.text);
  await dict.ensure([...new Set(words)]);
  const ctx = await ctxFor(dict);
  const raw = [];
  let skipped = 0;
  // 上一筆是不是「只有一行德文、沒有解釋」：下一行又是德文時提示可以合併（不自動合併）
  let prevBare = false;
  for (const rawLine of all.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim().replace(BULLET, '').trim();
    ctx.hasPrev = raw.length > 0;
    const p = parseLine(line, ctx);
    if (p.kind === 'blank') continue;
    if (p.kind === 'skip') { skipped++; continue; }
    if (p.kind === 'note') {
      const prev = raw[raw.length - 1];
      if (!p.text) { skipped++; continue; } // 只有 = 或分隔符號、沒有字：不生出德文空白的一筆（F6）
      if (prev) {
        prev.attached.push(p.text);
        // 當成解釋的這一行裡有德文字（ID＝das Id）：分界不是百分之百，標給她看
        if (p.germanInside) Object.assign(prev.flags, { checkSplit: true, checkReason: prev.flags.checkReason || 'note' });
        prevBare = false;
      } else {
        // 第一行就是解釋（上面沒有德文）→ 當一筆、標 Check split
        raw.push(newEntry({ line: p.text, german: p.text, note: null, checkSplit: true, reason: 'first', firstLineNote: true }));
        prevBare = false;
      }
      continue;
    }
    if (p.kind === 'multi') {
      for (const part of p.parts) raw.push(newEntry({ line: part, german: part, note: null }));
      prevBare = false;
      continue;
    }
    raw.push(newEntry({ line, german: p.german, note: p.note, checkSplit: p.checkSplit, reason: p.reason, mergeHint: prevBare }));
    prevBare = !p.note;
  }
  return { entries: raw.map((e) => finish(e, dict, ctx)), skipped };
}

async function refresh(e, dict) {
  await dict.ensure(wordsOf(`${e.german} ${e.line || ''}`).map((w) => w.text));
  return finish(e, dict, await ctxFor(dict));
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
  const ctx = await ctxFor(dict);
  await dict.ensure(wordsOf(text).map((w) => w.text));
  // 她按了「拆成新的一筆」＝她說這行是德文行：不再套「上一筆後面的整行英文＝解釋」那條（P6.8）
  ctx.hasPrev = false;
  const p = parseLine(text, ctx);
  // 拆出來的那行看起來是解釋（self photo）→ 照樣成一筆，但標 Check split（像第一行就是解釋）
  const fresh = p.kind === 'entry'
    ? newEntry({ line: text, german: p.german, note: p.note, checkSplit: p.checkSplit, reason: p.reason })
    : newEntry({ line: text, german: text, note: null, checkSplit: true, reason: 'first' });
  return [...entries.slice(0, i), await refresh(rest, dict), await refresh(fresh, dict), ...entries.slice(i + 1)];
}

// Check split：Sherry 點第 k 個字 → 那個字起是解釋；k ≥ 字數 → 整行都是德文
export async function splitAt(entries, i, k, dict) {
  const e = entries[i];
  if (!e) return entries;
  const ws = wordsOf(e.line);
  let german, note;
  if (k >= ws.length || k <= 0) { german = e.line; note = null; } else {
    const cut = safeCut(e.line, ws[k].start); // 點到括號裡的字 → 整個括號一起當解釋（P6.8 F3）
    german = trimGerman(e.line.slice(0, cut));
    note = e.line.slice(cut).trim() || null;
  }
  const next = await refresh({ ...e, german, typed: german, sameNote: note, flags: { ...e.flags, checkSplit: false, checkReason: null, firstLineNote: false } }, dict);
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
