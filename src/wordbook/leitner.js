// P6（SPEC §5.1 B、C）熟悉度：看得見的五組 Leitner 盒子（K2 預設），不用算不出來的演算法。
// 純函式；日期一律用「本地日期的第幾天」整數（dayNumber），測試直接傳假日期。
export const GROUPS = ['New', 'Learning', 'Familiar', 'Almost', 'Known'];
const INTERVAL = [0, 1, 3, 7, 21]; // 進入這一組時，隔幾天再出
export const KNOWN_MAX = 180;
export const NEW_PER_DAY = 20; // K3 預設：每天新字上限（以字計）

export function dayNumber(date = new Date()) {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
}

// due = null：還沒複習過的新卡（受每天新字上限管）
export function newCard() {
  return { box: 0, due: null, interval: 0, reviews: 0, lapses: 0, last: null };
}

// grade：'know'（Know it）｜'unsure'（Not sure）｜'forgot'（Forgot）
export function answerCard(card, grade, today) {
  const c = { ...card, reviews: (card.reviews || 0) + 1, last: today };
  if (grade === 'forgot') {
    // 退回 Learning、明天再出（當次重出一次由 ReviewSession 負責）
    Object.assign(c, { box: 1, interval: INTERVAL[1], due: today + INTERVAL[1], lapses: (card.lapses || 0) + 1 });
  } else if (grade === 'unsure') {
    // 留在原組、明天再出；間隔不變（下次答對照原本的步調往上）
    c.due = today + 1;
  } else if (card.box >= 4) {
    // Known 再答對：留在 Known、間隔 ×2，上限 180 天
    c.interval = Math.min(Math.max(card.interval || INTERVAL[4], INTERVAL[4]) * 2, KNOWN_MAX);
    c.due = today + c.interval;
  } else {
    c.box = card.box + 1;
    c.interval = INTERVAL[c.box];
    c.due = today + c.interval;
  }
  return c;
}

// 手動移組（分組頁）：從今天起照那一組的間隔算
export function moveCard(card, box, today) {
  if (box <= 0) return { ...card, box: 0, due: null, interval: 0 };
  return { ...card, box, interval: INTERVAL[box], due: today + INTERVAL[box] };
}

// 可重現的洗牌（同一天同一份清單順序一樣，測試與畫面一致）
function shuffle(list, seed) {
  const a = [...list];
  let s = (seed >>> 0) || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // 同一個字的兩個方向不要緊接著出（剛看完答案馬上考反向沒有意義）：每次挑第一張跟上一張不同字的
  // （剩最多張的字優先，才不會最後剩下同一個字的兩張）
  const left = new Map();
  for (const x of a) left.set(x.key, (left.get(x.key) || 0) + 1);
  const out = [];
  while (a.length) {
    const last = out[out.length - 1];
    let k = -1;
    a.forEach((x, idx) => {
      if (last && x.key === last.key) return;
      if (k < 0 || left.get(x.key) > left.get(a[k].key)) k = idx;
    });
    if (k < 0) k = 0;
    const [x] = a.splice(k, 1);
    left.set(x.key, left.get(x.key) - 1);
    out.push(x);
  }
  return out;
}

// 今天要複習的卡：到期的舊卡先，再來是新字（每天上限 20 個字，一個字的兩個方向算一個）。
// words：[{ key, cards: { fwd, rev? } }]，rev 不存在＝這個字不出反向（SPEC §5.1 C）
// opts.introducedKeys：今天已經開始學的字（它們剩下的新卡不再佔額度）；或 opts.introducedToday（只給數量）
export function buildQueue(words, today, opts = {}) {
  const introduced = opts.introducedKeys || new Set();
  const used = opts.introducedKeys ? introduced.size : (opts.introducedToday || 0);
  let room = Math.max(0, (opts.newLimit ?? NEW_PER_DAY) - used);
  const due = [];
  const fresh = [];
  for (const w of words) {
    const dirs = ['fwd', 'rev'].filter((d) => w.cards && w.cards[d]);
    for (const d of dirs) {
      const c = w.cards[d];
      if (c.due !== null && c.due !== undefined && c.due <= today) due.push({ key: w.key, dir: d, due: c.due });
    }
    const newDirs = dirs.filter((d) => w.cards[d].due === null || w.cards[d].due === undefined);
    if (!newDirs.length) continue;
    if (!introduced.has(w.key)) {
      if (room <= 0) continue;
      room--;
    }
    for (const d of newDirs) fresh.push({ key: w.key, dir: d });
  }
  due.sort((a, b) => a.due - b.due);
  const strip = ({ key, dir }) => ({ key, dir });
  return [...shuffle(due.map(strip), today), ...shuffle(fresh, today + 7919)];
}

// 一次複習：翻面自評三個按鈕。Forgot 的卡在這次結束前再出一次、只一次；
// 重出那次只是練習，不再改組別與到期日（當天已經退回 Learning 了）
export class ReviewSession {
  constructor(items) {
    this.items = items.map((x) => ({ key: x.key, dir: x.dir, reshow: false }));
    this.i = 0;
    this.reshown = new Set();
    this.moves = [];
  }
  get current() { return this.items[this.i] || null; }
  get done() { return this.i >= this.items.length; }
  get remaining() { return Math.max(0, this.items.length - this.i); }

  answer(grade, card, today) {
    const item = this.current;
    if (!item) return card;
    this.i++;
    if (item.reshow) return card;
    const after = answerCard(card, grade, today);
    this.moves.push({ key: item.key, dir: item.dir, from: card.box, to: after.box, grade });
    const id = `${item.key}\t${item.dir}`;
    if (grade === 'forgot' && !this.reshown.has(id)) {
      this.reshown.add(id);
      this.items.push({ key: item.key, dir: item.dir, reshow: true });
    }
    return after;
  }

  summary() {
    const changes = Object.fromEntries(GROUPS.map((g) => [g, 0]));
    let up = 0, down = 0, stayed = 0;
    for (const m of this.moves) {
      // Forgot 一律算「退回」（New 按 Forgot 也是進 Learning，但不是往上）
      if (m.grade === 'forgot') down++; else if (m.to > m.from) up++; else stayed++;
      if (m.to !== m.from) { changes[GROUPS[m.from]]--; changes[GROUPS[m.to]]++; }
    }
    return { reviewed: this.moves.length, up, down, stayed, changes };
  }
}
