// Wortlupe 閱讀頁：貼上 → 斷詞 → 每個字可點 → 字卡。
// 啟動順序刻意讓「可以貼上」不等字典：介面先可用，字典在背景載入（T6 冷啟動 ≤ 2 秒）。
import { tokenize } from './tokenize.js';
import { createDictionary, StaleDictionaryError } from './dict.js';
import { buildCard, PREP_CASE_LABEL } from './card-model.js';
import { analyzeSentence } from './grammar/engine.js';
import { parseFragment, hasFragmentText } from './fragment.js';
import { mtText } from './mt-normalize.js';
import { mtReady, downloadMt, translateText, MT_SIZE_LABEL, MT_CACHE } from './translate.js';
import { initWordbook } from './wordbook/ui.js';
import { analyzeGerman } from './wordbook/parse.js';

const $ = (id) => document.getElementById(id);
const ui = {
  message: $('message'), hint: $('hint'), compose: $('compose'), reader: $('reader'), input: $('input'),
  read: $('read'), paste: $('paste'), edit: $('edit'), text: $('text'),
  card: $('card'), cardToken: $('card-token'), cardBody: $('card-body'), cardFoot: $('card-foot'),
  prev: $('prev'), next: $('next'), close: $('close'),
};
const DICT_ERROR = 'Dictionary could not be loaded. Reload the page; if it still fails, remove Wortlupe from the home screen and add it again.';

let dict = null;
let tokens = [];
let wordIdx = []; // 可點的 token 索引（◀ ▶ 用）
let current = -1; // 目前字卡對應的 token 索引
let openSeq = 0; // 快速連點時，只畫最後一次

// ---------- 小工具 ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
function showMessage(text, isError = false) {
  ui.message.textContent = text;
  ui.message.classList.toggle('error', isError);
  ui.message.hidden = !text;
}

// ---------- 輸入 ----------
function showCompose() {
  closeCard();
  ui.reader.hidden = true;
  ui.compose.hidden = false;
  ui.edit.hidden = true;
  if (!dict || !dict.error) showMessage('');
}

function showHint(text) {
  showCompose();
  ui.hint.textContent = text;
  ui.hint.hidden = false;
  ui.input.focus();
}

async function pasteFromClipboard() {
  ui.hint.hidden = true;
  const clip = navigator.clipboard;
  if (!clip || typeof clip.readText !== 'function') {
    showHint("This browser won't let Wortlupe read the clipboard. Please paste it into the box below by hand (long-press → Paste).");
    return;
  }
  try {
    const text = await clip.readText();
    if (!text || !text.trim()) {
      showHint('The clipboard is empty. Copy a message first, or paste it into the box below by hand.');
      return;
    }
    ui.input.value = text;
    readInput();
  } catch {
    showHint("Wortlupe wasn't allowed to read the clipboard. Please paste it into the box below by hand (long-press → Paste).");
  }
}

// P2.3（S11）：iOS 捷徑用 …/#t=<URL 編碼的文字> 打開（為什麼用 # 見 fragment.js）。
// 讀完馬上用 replaceState 把 #t=… 清掉，文字不留在瀏覽紀錄和分頁網址裡。
function readFromFragment() {
  if (!hasFragmentText(location.hash)) return;
  const r = parseFragment(location.hash);
  history.replaceState(null, '', location.pathname + location.search);
  if (r.kind === 'error') { showHint(r.message); return; }
  if (r.kind === 'none') { showCompose(); return; }
  ui.input.value = r.text;
  readInput();
}

// ---------- 閱讀頁 ----------
let wordbookUi = null;
function readInput() {
  // 從捷徑（#t=…）或還原進來時人可能在 Words 分頁：切回閱讀頁
  if (wordbookUi && document.body.dataset.tab === 'words') wordbookUi.setTab('read');
  const text = ui.input.value;
  ui.hint.hidden = true;
  tokens = tokenize(text);
  wordIdx = tokens.filter((t) => t.type === 'word').map((t) => t.index);
  renderText();
  ui.compose.hidden = true;
  ui.reader.hidden = false;
  ui.edit.hidden = false;
  window.scrollTo(0, 0);
  if (dict && dict.error) showMessage(DICT_ERROR, true);
  else if (!wordIdx.length) showMessage('No German words to look up in this text. Paste a message with some German in it.');
  else showMessage('');
  // 貼上後立刻在背景把這段文字需要的分片載好，點字時就不用等
  if (dict && !dict.error && wordIdx.length) dict.ensure(wordIdx.map((i) => tokens[i].text)).catch(() => {});
}

function renderText() {
  // 每句的 Grammar 按鈕放在句尾標點之後（沒有字的片段不放）
  const lastWord = new Map();
  for (const t of tokens) if (t.type === 'word') lastWord.set(t.sentence, t.index);
  const buttonAfter = new Map();
  for (const [s, k] of lastWord) {
    let j = k;
    while (tokens[j + 1] && tokens[j + 1].type === 'punct') j++;
    buttonAfter.set(j, s);
  }
  sentences = [...lastWord.keys()];

  // 句子最後一個字＋句尾標點＋Grammar 按鈕包成一組不斷行，按鈕不會掉到下一句的開頭、看起來像屬於下一句。
  // P2.1（M3）：最後一個字太長（Rindfleisch…gesetz）時整組不斷行會撐破頁寬 → 長字不進組，只有「標點＋按鈕」不斷行。
  // 12 個字母以內＋標點＋按鈕在 320px 寬的螢幕也放得下。
  // P2.2（可延後項）：長字不進組，句點緊貼長字（長字本身可以斷行），<wbr> 只放在「句點」和「按鈕」之間，
  // 句點不會單獨掉到下一行
  const groupStart = new Set([...lastWord.values()].filter((k) => tokens[k].text.length <= 12));
  const lastWordIdx = new Set(lastWord.values());
  const frag = document.createDocumentFragment();
  let target = frag;
  // P2.7 加修（Sherry 9/29：「Read 之後就有整句翻譯，然後可以繼續點字、點文法」）：每一段（換行分段）後面放一個翻譯區塊
  paragraphs = [];
  let para = new Set();
  const endParagraph = () => {
    if (!para.size) return;
    const el = h('div', { class: 'para-tr', 'data-p': paragraphs.length, lang: 'en', hidden: true });
    paragraphs.push({ sentences: [...para], el });
    frag.append(el);
    para = new Set();
  };
  for (const t of tokens) {
    if (t.type === 'word') para.add(t.sentence);
    if (t.type === 'space' && t.text.includes('\n') && target === frag) {
      // 換行字元保留在原文裡（複製／比對原文要一字不差，S11），翻譯區塊接在換行後面
      const cut = t.text.indexOf('\n') + 1;
      frag.append(t.text.slice(0, cut));
      endParagraph();
      frag.append(t.text.slice(cut));
      continue;
    }
    if (groupStart.has(t.index)) {
      // 長字後面緊貼著標點，中間沒有可以換行的地方 → 放一個 <wbr>，讓「標點＋按鈕」必要時換到下一行
      if (t.index > 0 && tokens[t.index - 1].type === 'word' && !lastWordIdx.has(t.index)) frag.append(document.createElement('wbr'));
      const g = h('span', { class: 's-end' });
      frag.append(g);
      target = g;
    }
    if (t.type === 'word') {
      target.append(h('span', { class: 'w', role: 'button', tabindex: '0', 'data-i': t.index }, t.text));
    } else if (t.type === 'space') {
      target.append(t.text);
    } else {
      target.append(h('span', { class: 'nw', 'data-type': t.type }, t.text));
    }
    if (buttonAfter.has(t.index)) {
      if (target === frag) { // 長字後面沒有標點、直接接按鈕：同樣先放 <wbr> 再包組
        frag.append(document.createElement('wbr'));
        const g = h('span', { class: 's-end' });
        frag.append(g);
        target = g;
      }
      target.append(h('button', { class: 'g-btn', type: 'button', 'data-s': buttonAfter.get(t.index), 'aria-label': 'Grammar of this sentence' }, 'Grammar'));
      target = frag;
    }
  }
  endParagraph();
  ui.text.replaceChildren(frag);
  // 翻譯列的位置當下就留好（固定高度），之後查完快取只換內容，版面不會在使用者點字時往下跳
  const banner = mtBanner();
  banner.hidden = !paragraphs.length;
  banner.replaceChildren();
  fillTranslations();
}

// ---------- P2.7 加修：閱讀頁的整句翻譯 ----------
// 模型下載好了：貼上後在背景一句一句翻，填進每段下面（不擋點字）；還沒下載：閱讀頁上方一條下載列。
// Hide/Show 記在這支手機（想先自己猜意思時用）。
let paragraphs = [];
let fillSeq = 0;
const HIDE_KEY = 'wortlupe-hide-translation';
const mtHidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };
function mtBanner() {
  let el = document.getElementById('mt-banner');
  if (!el) {
    el = h('div', { id: 'mt-banner', class: 'mt-banner' });
    ui.text.before(el);
  }
  return el;
}
function applyHidden() {
  const hide = mtHidden();
  ui.text.classList.toggle('mt-hidden', hide);
  const b = document.getElementById('mt-toggle');
  if (b) b.textContent = hide ? 'Show translation' : 'Hide translation';
}
async function fillTranslations() {
  const seq = ++fillSeq;
  const banner = mtBanner();
  if (!paragraphs.length) { banner.replaceChildren(); return; }
  if (!(await mtReady())) {
    if (seq !== fillSeq) return;
    // 一行放得下（固定高度，不推動下面的原文）：進度直接寫在按鈕上
    const label = `Download translation (${MT_SIZE_LABEL}, once)`;
    const btn = h('button', { type: 'button', class: 'mt-download' }, navigator.onLine ? label : 'Translation: go online to download once');
    btn.disabled = !navigator.onLine;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await downloadMt((done, total) => { btn.textContent = `Downloading… ${(done / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB`; });
        fillTranslations();
      } catch {
        btn.disabled = false;
        btn.textContent = 'Download failed — tap to try again';
      }
    });
    banner.replaceChildren(btn);
    return;
  }
  if (seq !== fillSeq) return;
  // 口語還原要查字典（freu mich → freue mich）：字典還在載就等它，載不起來照原文翻
  try {
    if (dict && !dict.error) await dict.ensure(wordIdx.map((i) => tokens[i].text));
  } catch { /* 字典壞了也照原文翻 */ }
  if (seq !== fillSeq) return;
  const toggle = h('button', { type: 'button', id: 'mt-toggle', class: 'mt-toggle' });
  toggle.addEventListener('click', () => {
    try { localStorage.setItem(HIDE_KEY, mtHidden() ? '0' : '1'); } catch { /* 存不了就只切這一次 */ }
    ui.text.classList.toggle('mt-hidden');
    toggle.textContent = ui.text.classList.contains('mt-hidden') ? 'Show translation' : 'Hide translation';
  });
  // 「可能翻錯」的完整說明在 Grammar 面板的翻譯下面；這裡只留一行
  banner.replaceChildren(h('span', { class: 'muted small' }, 'English = machine translation'), toggle);
  applyHidden();
  for (const p of paragraphs) {
    p.el.hidden = false;
    p.el.textContent = '…';
    const out = [];
    try {
      for (const s of p.sentences) {
        const src = mtText(tokens, s, dict || { colloquial: {} });
        if (!src) continue;
        out.push(await translateText(src.text));
        if (seq !== fillSeq) return; // 換了新文字就停
      }
      p.el.textContent = out.join(' ');
    } catch {
      if (seq !== fillSeq) return;
      p.el.textContent = 'Translation failed for this part.';
      p.el.classList.add('failed');
    }
  }
}

function tokenEl(i) {
  return ui.text.querySelector(`.w[data-i="${i}"]`);
}

// ---------- 字卡／文法面板（同一個底部面板，data-mode = word | grammar）----------
const MARK_CLASS = { v2: 'g-v2', 'end-verb': 'g-end', clause: 'g-clause', focus: 'g-focus', 'sep-verb': 'sep-verb', 'sep-prefix': 'sep-prefix' };
const ALL_MARKS = ['active', ...Object.values(MARK_CLASS)];
let mode = 'word';
let currentSentence = -1;
let sentences = [];

function closeCard() {
  ui.card.hidden = true;
  setTopPad(0);
  ui.card.classList.remove('top');
  ui.card.removeAttribute('data-i');
  ui.card.removeAttribute('data-state');
  ui.card.removeAttribute('data-mode');
  clearMarks();
  current = -1;
  currentSentence = -1;
}

function clearMarks() {
  ui.text.querySelectorAll(ALL_MARKS.map((c) => `.${c}`).join(',')).forEach((el) => el.classList.remove(...ALL_MARKS));
  const line = $('sep-line');
  if (line) line.remove();
}

async function openCard(i) {
  const tok = tokens[i];
  if (!tok || tok.type !== 'word') return;
  const seq = ++openSeq;
  mode = 'word';
  current = i;
  currentSentence = -1;
  clearMarks();
  const el = tokenEl(i);
  if (el) el.classList.add('active');
  ui.card.hidden = false;
  ui.card.dataset.mode = 'word';
  ui.card.dataset.i = String(i);
  ui.card.dataset.token = tok.text;
  ui.cardToken.textContent = tok.text;
  const pos = wordIdx.indexOf(i);
  ui.prev.disabled = pos <= 0;
  ui.next.disabled = pos >= wordIdx.length - 1;

  if (!dict || dict.error) return renderError();
  if (!dict.isReadyFor(tok.text)) {
    ui.card.dataset.state = 'loading';
    ui.cardBody.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
    ui.cardFoot.hidden = true;
    try {
      await dict.ensure([tok.text]);
    } catch {
      if (seq === openSeq) renderError();
      return;
    }
    if (seq !== openSeq) return;
  }
  let model;
  try {
    model = buildCard(tokens, i, dict);
  } catch {
    return renderError();
  }
  renderCard(model);
  placeCard(el);
  if (model.separable) drawSeparable(model.separable.verbIndex, model.separable.prefixIndex);
}

// P2.6（§6.1）：快取混到兩個版本的字典 → 清掉快取、重新安裝 service worker、重新載入一次（原文先存起來，回來再讀）。
// 每個分頁只試一次，避免無限重新載入；離線時只能請使用者連上網路再開。
const RESTORE_KEY = 'wortlupe-restore';
const STALE_ERROR = 'Wortlupe’s dictionary was updated and the saved copy on this phone is mixed. Connect to the internet and open Wortlupe again.';
function recoverStale() {
  let tried = false;
  try { tried = sessionStorage.getItem('wortlupe-stale-reload') === '1'; } catch { /* 無法存取就當沒試過 */ }
  if (tried || !navigator.onLine) return false;
  try {
    sessionStorage.setItem('wortlupe-stale-reload', '1');
    sessionStorage.setItem(RESTORE_KEY, ui.input.value || '');
  } catch { /* 存不了就不還原原文 */ }
  (async () => {
    try {
      if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
      if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    } catch { /* 清不掉也照樣重新載入 */ }
    location.reload();
  })();
  return true;
}

function renderError(el) {
  ui.card.dataset.state = 'error';
  if (dict && dict.error instanceof StaleDictionaryError) {
    const reloading = recoverStale();
    ui.cardBody.replaceChildren(h('p', { class: 'card-error' }, reloading ? 'Updating the dictionary…' : STALE_ERROR));
    ui.cardFoot.hidden = true;
    placeCard(el || tokenEl(current));
    return;
  }
  ui.cardBody.replaceChildren(h('p', { class: 'card-error' }, DICT_ERROR));
  ui.cardFoot.hidden = true;
  placeCard(el || tokenEl(current));
}

// 句子的 Grammar 面板：列出命中的規則（What → Why → Pattern），並在句中標記
async function openGrammar(s) {
  const words = tokens.filter((t) => t.type === 'word' && t.sentence === s);
  if (!words.length) return;
  const seq = ++openSeq;
  mode = 'grammar';
  current = -1;
  currentSentence = s;
  clearMarks();
  const firstEl = tokenEl(words[0].index);
  ui.card.hidden = false;
  ui.card.dataset.mode = 'grammar';
  ui.card.removeAttribute('data-i');
  ui.card.dataset.token = '';
  ui.cardToken.textContent = 'Grammar';
  const pos = sentences.indexOf(s);
  ui.prev.disabled = pos <= 0;
  ui.next.disabled = pos >= sentences.length - 1;
  ui.cardFoot.hidden = true;

  if (!dict || dict.error) return renderError(firstEl);
  if (!words.every((t) => dict.isReadyFor(t.text))) {
    ui.card.dataset.state = 'loading';
    ui.cardBody.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
    try {
      await dict.ensure(words.map((t) => t.text));
    } catch {
      if (seq === openSeq) renderError(firstEl);
      return;
    }
    if (seq !== openSeq) return;
  }
  let matches;
  try {
    matches = analyzeSentence(tokens, s, dict);
  } catch {
    return renderError(firstEl);
  }
  renderGrammar(matches);
  for (const m of matches) for (const k of m.marks || []) {
    const el = tokenEl(k.index);
    if (el && MARK_CLASS[k.kind]) el.classList.add(MARK_CLASS[k.kind]);
  }
  placeCard(firstEl);
  const sep = matches.find((m) => m.id === 'G06');
  if (sep) drawSeparable(sep.data.verbIndex, sep.data.prefixIndex);
}

const LEGEND = {
  v2: ['g-v2', 'conjugated verb'],
  'end-verb': ['g-end', 'verb at the end'],
  clause: ['g-clause', 'subordinate clause'],
  'sep-verb': ['sep-verb', 'separable verb'],
};

function renderRule(m) {
  return h('section', { class: 'rule', 'data-rule': m.id },
    h('h3', {}, h('span', { class: 'rule-id' }, m.id), ` ${m.title}`),
    h('p', { class: 'what' }, m.what),
    h('p', { class: 'why' }, h('span', { class: 'label' }, 'Why: '), m.why),
    h('p', { class: 'pattern' }, h('span', { class: 'label' }, 'Pattern: '), m.pattern));
}

// P2.7：整句翻譯只在閱讀頁每段下面（Sherry 9/29：「點 Grammar 之後就不要顯示 Translation，它不是已經在外面了嗎」）
function renderGrammar(matches) {
  if (!matches.length) {
    ui.card.dataset.state = 'norule';
    ui.cardBody.replaceChildren(
      h('p', { class: 'no-rule' }, 'No rule matched for this sentence'),
      h('p', { class: 'muted small' }, 'Wortlupe only explains patterns it can detect with confidence.'));
    return;
  }
  ui.card.dataset.state = 'rules';
  const kinds = new Set(matches.flatMap((m) => (m.marks || []).map((k) => k.kind)));
  const legend = Object.entries(LEGEND).filter(([k]) => kinds.has(k));
  ui.cardBody.replaceChildren(
    legend.length ? h('p', { class: 'legend small' }, ...legend.flatMap(([, [cls, label]], n) => [n ? '  ' : '', h('span', { class: cls }, label)])) : '',
    ...matches.map(renderRule));
}

function renderCard(m) {
  ui.card.dataset.state = m.status;
  const body = [];
  if (m.status === 'notfound') {
    body.push(h('p', { class: 'notfound' }, 'Not in dictionary'));
    body.push(h('p', { class: 'muted small' }, 'Wortlupe only shows what its offline dictionary knows. Names, rare words and typos are not included.'));
    ui.cardBody.replaceChildren(...body);
    ui.cardFoot.hidden = true;
    return;
  }
  if (m.contraction) {
    // P2.1（M4）：im = in + dem，下面兩個讀法就是這兩個字的解釋
    body.push(h('div', { class: 'contraction' }, h('span', { class: 'label' }, 'Short for '),
      h('b', {}, m.contraction.parts.join(' + '))));
  }
  if (m.colloquial) {
    body.push(h('div', { class: 'colloquial' }, h('span', { class: 'label' }, 'Colloquial for '),
      ...m.colloquial.expansions.flatMap((e, k) => [k ? ' / ' : '', h('b', {}, e)])));
  }
  if (m.lowercaseNote) {
    // P2.2 加修：WhatsApp 小寫名詞（zeit → die Zeit）
    body.push(h('div', { class: 'lowercase-note' }, m.lowercaseNote));
  }
  if (m.separable) {
    const s = m.separable;
    body.push(h('div', { class: 'separable-hint' },
      h('span', { class: 'label' }, 'Separable verb: '), h('b', {}, s.verb),
      ` — “${tokens[s.verbIndex].text} … ${s.prefix}”`,
      s.glosses[0] ? h('div', {}, s.glosses[0]) : null));
  }
  const main = m.readings.filter((r) => !r.other);
  const others = m.readings.filter((r) => r.other);
  for (const r of main) body.push(renderReading(r, m.token, false));
  // 字形規則（G15–G20）：這個字為什麼長這樣
  if (m.wordRules && m.wordRules.length) {
    body.push(h('section', { class: 'why-form' }, h('h3', { class: 'why-title' }, 'Why this form'), ...m.wordRules.map(renderRule)));
  }
  if (others.length) {
    body.push(h('details', { class: 'others' }, h('summary', {}, `Other readings (${others.length})`),
      ...others.map((r) => renderReading(r, m.token, true))));
  }
  ui.cardBody.replaceChildren(...body);
  ui.cardFoot.hidden = false;
  // SPEC §5（Sherry 9/30）：存生字啟用，每張新字卡重新可按
  const save = $('save');
  save.disabled = false;
  save.textContent = 'Save word';
  save.dataset.i = String(m.index);
}

// 欄位順序照 SPEC §4.1：原形 → 這個形 → 詞性 → 名詞 → 動詞 → 形容詞 → 介系詞 →（複合詞 P3）→ 解釋
function renderReading(r, token, other) {
  const f = [];
  const article = r.header !== r.lemma ? r.header.slice(0, r.header.length - r.lemma.length).trim() : null;
  f.push(h('h2', { 'data-field': 'lemma' }, article ? h('span', { class: 'article' }, article) : null, article ? ' ' : null, h('span', { class: 'lemma' }, r.lemma)));

  const forms = r.formDescriptions.filter((d) => d !== 'dictionary form');
  const formLabel = h('span', { class: 'label' }, `${r.formToken || token} = `);
  // P2.6（SPEC §4.5 A）：句子決定得了就只講這句裡的形，其他收起來；決定不了而且超過兩個，也收起來不整串攤開
  const moreForms = (list, title) => h('details', { class: 'more-forms' }, h('summary', {}, title),
    h('ul', {}, ...list.map((d) => h('li', {}, d))));
  if (!other && r.contextForm) {
    f.push(h('div', { class: 'field', 'data-field': 'form' },
      h('p', {}, formLabel, r.contextForm.join('; '), ' ', h('span', { class: 'in-sentence' }, 'in this sentence')),
      r.otherForms && r.otherForms.length ? moreForms(r.otherForms, `Other possible forms (${r.otherForms.length})`) : null));
  } else if (!other && forms.length > 2) {
    f.push(h('div', { class: 'field', 'data-field': 'form' },
      moreForms(forms, `${forms.length} possible forms — the sentence doesn’t decide`)));
  } else if (forms.length) {
    f.push(h('p', { class: 'field', 'data-field': 'form' }, formLabel, forms.slice(0, 6).join('; '),
      forms.length > 6 ? ` (+${forms.length - 6} more)` : null));
  }
  // P2.6：對得上這句的用法直接放在形的下面（它就是這句裡的意思），不用捲到卡片底部
  const usage = !other && r.usage ? r.usage : [];
  const hit = usage.find((u) => u.match);
  const usageItem = (u) => h('li', { class: u.match ? 'match' : null },
    h('p', { class: 'usage-pattern' }, h('b', {}, u.pattern), ` — ${u.gloss}`),
    u.example ? h('p', { class: 'usage-example' }, h('i', { lang: 'de' }, u.example[0]), ` — ${u.example[1]}`) : null);
  if (hit) {
    f.push(h('div', { class: 'field usage usage-hit', 'data-field': 'usage-hit' },
      h('h3', { class: 'usage-title' }, 'Meaning in this sentence'), h('ul', {}, usageItem(hit))));
  }
  f.push(h('p', { class: 'field', 'data-field': 'pos' }, r.posLabel));

  if (r.pos === 'noun') {
    let txt = null;
    if (r.pluralOnly) txt = 'plural only';
    else if (r.plural) txt = `plural: ${r.plural.join(', ')}`;
    else if (r.noPlural) txt = 'no plural';
    if (txt) f.push(h('p', { class: 'field', 'data-field': 'noun' }, txt));
  }
  if (r.verb) {
    const v = r.verb, parts = [];
    if (v.separable === true) parts.push(`separable (${v.prefix}-)`);
    const pp = v.principalParts ? [v.principalParts.present3sg, v.principalParts.preterite, v.principalParts.participle].filter(Boolean).join(' – ') : '';
    if (v.irregular === true) parts.push(`irregular${pp ? `: ${pp}` : ''}`);
    else if (v.irregular === false) parts.push(`regular${pp ? `: ${pp}` : ''}`);
    else if (pp) parts.push(pp);
    if (v.auxiliary && v.auxiliary.length) parts.push(`perfect with ${v.auxiliary.join(' or ')}`);
    if (parts.length) f.push(h('p', { class: 'field', 'data-field': 'verb' }, parts.join(' · ')));
  }
  if (r.adj && (r.adj.comparative || r.adj.superlative)) {
    f.push(h('p', { class: 'field', 'data-field': 'adj' }, [r.lemma, (r.adj.comparative || []).join('/'), (r.adj.superlative || []).join('/')].filter(Boolean).join(' – ')));
  }
  if (r.prepCase) f.push(h('p', { class: 'field', 'data-field': 'prep' }, PREP_CASE_LABEL[r.prepCase] || r.prepCase));
  if (r.glosses.length) f.push(h('ol', { class: 'field', 'data-field': 'glosses' }, ...r.glosses.map((g) => h('li', {}, g))));
  // P2.6（SPEC §4.5 B）：用法句型（Wiktionary 的 reflexive／+obj），對得上這句的那條排第一
  const rest = usage.filter((u) => u !== hit);
  if (rest.length) {
    f.push(h('div', { class: 'field usage', 'data-field': 'usage' },
      h('h3', { class: 'usage-title' }, hit ? 'Other ways it’s used' : 'How it’s used'),
      h('ul', {}, ...rest.map(usageItem))));
  }
  return h('section', { class: other ? 'reading other' : 'reading' }, ...f);
}

// 卡片貼上方時，頁面頂端墊出同樣高度的空白：最上面幾行可以捲到卡片下方，不會永遠被蓋住。
// 墊空白的同時把頁面往下捲同樣距離，畫面上的字不會跳。
let topPad = 0;
function setTopPad(px) {
  if (px === topPad) return;
  const delta = px - topPad;
  document.body.style.paddingTop = px ? `${px}px` : '';
  topPad = px;
  window.scrollBy(0, delta);
}

// 卡片預設在底部；會蓋住被點的字就改貼上方；兩邊都蓋到（卡片太高）就把字捲到卡片上方
function placeCard(el) {
  setTopPad(0);
  ui.card.classList.remove('top');
  if (!el) return;
  const vh = window.innerHeight;
  const ch = ui.card.getBoundingClientRect().height;
  let r = el.getBoundingClientRect();
  // 字在畫面外（◀ ▶ 移過去、或被頂端擋住）→ 先捲進畫面
  if (r.top < 0 || r.bottom > vh) { el.scrollIntoView({ block: 'center' }); r = el.getBoundingClientRect(); }
  if (r.bottom <= vh - ch - 4) return;
  if (r.top >= ch + 4) {
    ui.card.classList.add('top');
    setTopPad(Math.ceil(ch));
    return;
  }
  window.scrollBy(0, r.bottom - (vh - ch) + 12);
}

// 可分離動詞：句尾前綴用虛線連回動詞
function drawSeparable(verbIndex, prefixIndex) {
  const verbEl = tokenEl(verbIndex), preEl = tokenEl(prefixIndex);
  if (!verbEl || !preEl) return;
  verbEl.classList.add('sep-verb');
  preEl.classList.add('sep-prefix');
  const box = ui.text.getBoundingClientRect();
  const a = verbEl.getBoundingClientRect(), b = preEl.getBoundingClientRect();
  const x1 = a.left + a.width / 2 - box.left, y1 = a.bottom - box.top + 2;
  const x2 = b.left + b.width / 2 - box.left, y2 = b.bottom - box.top + 2;
  const dip = Math.max(y1, y2) + 12;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'sep-line';
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${dip}, ${x2} ${dip}, ${x2} ${y2}`);
  path.setAttribute('stroke-dasharray', '4 4');
  svg.append(path);
  ui.text.append(svg);
}

function step(delta) {
  if (mode === 'grammar') {
    const s = sentences[sentences.indexOf(currentSentence) + delta];
    if (s !== undefined) openGrammar(s);
    return;
  }
  const pos = wordIdx.indexOf(current);
  const next = wordIdx[pos + delta];
  if (next === undefined) return;
  const el = tokenEl(next);
  if (el) el.scrollIntoView({ block: 'nearest' });
  openCard(next);
}

// ---------- 事件 ----------
ui.read.addEventListener('click', readInput);
ui.paste.addEventListener('click', pasteFromClipboard);
ui.edit.addEventListener('click', () => { showCompose(); ui.input.focus(); });
ui.text.addEventListener('click', (e) => {
  const g = e.target.closest('.g-btn');
  if (g) { openGrammar(Number(g.dataset.s)); return; }
  const el = e.target.closest('.w');
  if (el) openCard(Number(el.dataset.i));
});
ui.text.addEventListener('keydown', (e) => {
  const el = e.target.closest('.w');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCard(Number(el.dataset.i)); }
});
// ---------- 存生字（SPEC §5，Sherry 9/30 拍板隨 P6 接上）----------
// 存進單字本同一本（以原形去重）、New 組、Your note 空白；這句話當例句（原句＋日期）
function sentenceOf(i) {
  const s = tokens[i].sentence;
  const ws = tokens.filter((t) => t.type === 'word' && t.sentence === s);
  let end = ws[ws.length - 1].index;
  while (tokens[end + 1] && tokens[end + 1].type === 'punct') end++;
  return ui.input.value.slice(ws[0].start, tokens[end].end).replace(/\s+/g, ' ').trim();
}
$('save').addEventListener('click', async () => {
  const save = $('save');
  const i = Number(save.dataset.i);
  if (!dict || !wordbookUi || !tokens[i]) return;
  save.disabled = true;
  try {
    const model = buildCard(tokens, i, dict);
    const main = model.readings.filter((r) => !r.other);
    // 可分離動詞存重組後的原形（rufe … an → anrufen）；其他存第一個讀法的原形
    const target = (model.separable && model.separable.verb) || (main[0] || model.readings[0] || {}).lemma;
    if (!target) throw new Error('not found');
    await dict.ensure([target]);
    const entry = analyzeGerman(target, dict);
    if (entry.status !== 'found') throw new Error('not found');
    await wordbookUi.wordbook.saveFromReader({ ...entry, german: tokens[i].text, typed: tokens[i].text }, sentenceOf(i));
    save.textContent = `Saved ✓ ${entry.display}`;
  } catch (e) {
    save.disabled = false;
    save.textContent = e && /^Could not save/.test(e.message) ? 'Could not save — try again' : 'Save word';
  }
});

ui.prev.addEventListener('click', () => step(-1));
ui.next.addEventListener('click', () => step(1));
ui.close.addEventListener('click', closeCard);
document.addEventListener('keydown', (e) => {
  if (ui.card.hidden) return;
  if (e.key === 'Escape') closeCard();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
});

// 頁面已經開著（SW 接管、片段改變不會重新載入）時也要讀
window.addEventListener('hashchange', readFromFragment);

// P6（SPEC §5.1）：Words 分頁（單字本）。共用同一份字典；切過去時把閱讀頁的字卡收起來
wordbookUi = initWordbook({ getDict: () => dict, onEnter: closeCard });

// ---------- 啟動 ----------
readFromFragment();
// P2.6：混版字典自動重新載入前存下的原文，回來直接讀
try {
  const saved = sessionStorage.getItem(RESTORE_KEY);
  if (saved !== null) {
    sessionStorage.removeItem(RESTORE_KEY);
    if (saved.trim()) { ui.input.value = saved; readInput(); }
  }
} catch { /* 無法存取 sessionStorage 就不還原 */ }
document.documentElement.dataset.ready = '1';
document.documentElement.dataset.readyAt = String(Math.round(performance.now()));

// 字典在介面可用之後才開始載，不擋貼上
setTimeout(() => {
  dict = createDictionary({ base: './' });
  dict.ready().then(() => { document.documentElement.dataset.dictReady = '1'; }, () => {
    showMessage(DICT_ERROR, true);
    if (current >= 0) renderError();
  });
}, 0);

// 9/28：About 顯示這支手機實際裝好的版本（service worker 快取名稱），Sherry 對照 Charles 給的版本號就知道是不是最新
async function showVersion() {
  const el = document.getElementById('version');
  if (!el) return;
  try {
    const keys = window.caches ? (await caches.keys()).filter((k) => k.startsWith('wortlupe-') && k !== MT_CACHE) : [];
    el.textContent = keys.length ? keys.map((k) => k.replace(/^wortlupe-/, '')).join(', ') : 'not saved for offline use yet';
  } catch {
    el.textContent = 'unknown';
  }
}
showVersion();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 沒有 SW 仍可線上使用 */ });
  navigator.serviceWorker.addEventListener('controllerchange', showVersion);
  // 字卡開著時換版本不要打斷；下次開啟生效
}
