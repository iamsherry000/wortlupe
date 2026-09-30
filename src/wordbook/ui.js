// P6（SPEC §5.1）單字本畫面：Words 分頁（首頁／批次貼上預覽／複習／本次統計／清單）。
// 規則都在 parse.js、leitner.js、store.js；這裡只負責畫與接事件。介面文字英文（SPEC §1）。
import { importPreview, mergeIntoPrevious, splitIntoNew, splitAt, acceptSuggestion, removeEntry } from './parse.js';
import { createWordbook, idbBackend, reversePrompt, exportMarkdown } from './store.js';
import { GROUPS, ReviewSession, dayNumber } from './leitner.js';
import { PREP_CASE_LABEL } from '../card-model.js';

const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false && c !== '') el.append(c);
  return el;
}
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const GROUP_HINT = ['not reviewed yet', 'every day', 'every 3 days', 'every 7 days', 'every 21+ days'];
// 片語拆解只替實詞標原形（lebe → leben）；das → der、All → all 這種對學習者只是雜訊（跟 parse.js 的還原規則一致）
const restorable = (b) => ['verb', 'noun', 'adj'].includes(b.pos) && b.lemma.toLowerCase() !== b.token.toLowerCase();
const DIR_LABEL ={ fwd: 'German → meaning', rev: 'meaning → German' };
const DICT_ERROR = 'Dictionary could not be loaded. Reload the page; if it still fails, remove Wortlupe from the home screen and add it again.';

export function initWordbook({ getDict, onEnter = () => {} }) {
  // 測試用的假時鐘（Playwright 設 window.__wortlupeDayOffset）；正常使用是 0
  const today = () => dayNumber(new Date()) + (Number(window.__wortlupeDayOffset) || 0);
  const wb = createWordbook(idbBackend(), { today });
  const ui = {
    words: $('words'), message: $('wb-message'),
    home: $('wb-home'), imp: $('wb-import'), review: $('wb-review'), summary: $('wb-summary'), list: $('wb-list'),
    due: $('wb-due'), dueNote: $('wb-due-note'), start: $('wb-start'), groups: $('wb-groups'),
    input: $('wb-input'), previewBtn: $('wb-preview-btn'), preview: $('wb-preview'), skipped: $('wb-skipped'), commit: $('wb-commit'),
    card: $('wb-card'), grade: document.querySelector('#wb-review .wb-grade'), progress: $('wb-progress'),
    items: $('wb-items'), listTitle: $('wb-list-title'), exportBox: $('wb-export-box'), exportText: $('wb-export-text'),
  };
  const views = [ui.home, ui.imp, ui.review, ui.summary, ui.list];
  const show = (v) => { for (const x of views) x.hidden = x !== v; window.scrollTo(0, 0); };
  function say(text, isError = false) {
    ui.message.textContent = text || '';
    ui.message.classList.toggle('error', !!isError);
    ui.message.hidden = !text;
  }

  // SPEC §2：本機資料要請求持久儲存（iOS 才不會隨便清掉生字本）
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch { /* 不支援就算了 */ }

  // ---------- 分頁 ----------
  function setTab(tab) {
    document.body.dataset.tab = tab;
    $('tab-read').setAttribute('aria-selected', String(tab === 'read'));
    $('tab-words').setAttribute('aria-selected', String(tab === 'words'));
    ui.words.hidden = tab !== 'words';
    if (tab === 'words') {
      onEnter();
      show(null); // 舊畫面（可能是上次的首頁數字）先收起來，讀好再秀
      goHome();
    }
  }
  $('tab-read').addEventListener('click', () => setTab('read'));
  $('tab-words').addEventListener('click', () => setTab('words'));

  // ---------- 首頁 ----------
  // P6.6（§5.1 F）：先把新數字讀好、畫好，才把首頁秀出來——不先閃舊數字
  async function goHome(keepMessage = false) {
    if (!keepMessage) say('');
    ui.exportBox.hidden = true;
    try {
      const [counts, queue] = await Promise.all([wb.counts(), wb.queue()]);
      show(ui.home);
      ui.due.replaceChildren(h('span', { class: 'num' }, String(queue.length)), ' due today');
      ui.start.disabled = queue.length === 0;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      ui.dueNote.textContent = total === 0 ? 'Your word list is empty. Tap “Add words” and paste a list.'
        : queue.length === 0 ? 'Nothing due right now. Come back tomorrow.' : 'Old words first, then up to 20 new words a day.';
      ui.groups.replaceChildren(...GROUPS.map((g, k) => h('li', { class: 'wb-group', 'data-group': g, role: 'button', tabindex: '0' },
        h('span', { class: 'g-name' }, g), h('span', { class: 'g-hint' }, GROUP_HINT[k]), h('span', { class: 'count' }, String(counts[g])))));
    } catch (e) {
      show(ui.home);
      say(e.message || 'Could not read your word list on this phone.', true);
    }
  }
  const openGroupEl = (el) => { if (el) openList(el.dataset.group); };
  ui.groups.addEventListener('click', (e) => openGroupEl(e.target.closest('.wb-group')));
  ui.groups.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGroupEl(e.target.closest('.wb-group')); } });
  $('wb-add').addEventListener('click', () => { say(''); show(ui.imp); ui.input.focus(); });
  $('wb-all').addEventListener('click', () => openList(null));
  $('wb-home-link').addEventListener('click', () => goHome());
  $('wb-back').addEventListener('click', () => goHome());
  $('wb-done').addEventListener('click', () => goHome());

  $('wb-export').addEventListener('click', async () => {
    try {
      ui.exportText.value = exportMarkdown(await wb.all());
      ui.exportBox.hidden = false;
    } catch (e) {
      say(e.message, true);
    }
  });
  $('wb-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ui.exportText.value);
      say('Copied as Markdown.');
    } catch {
      ui.exportText.select();
      say('Select all and copy by hand (long-press → Copy).');
    }
  });

  // ---------- 批次貼上＋預覽 ----------
  let entries = [];
  let skipped = 0;
  let existing = new Set();

  async function waitDict() {
    while (!getDict()) await new Promise((r) => setTimeout(r, 20));
    const d = getDict();
    await d.ready();
    return d;
  }

  async function runPreview() {
    say('');
    ui.preview.dataset.state = 'loading';
    ui.previewBtn.disabled = true;
    ui.previewBtn.textContent = 'Reading…';
    try {
      const dict = await waitDict();
      const r = await importPreview(ui.input.value, dict);
      entries = r.entries;
      skipped = r.skipped;
      hadRows = entries.length > 0;
      openFix.clear();
      existing = new Set((await wb.all().catch(() => [])).map((w) => w.key));
      renderPreview();
      ui.preview.dataset.state = 'ready';
    } catch {
      entries = [];
      renderPreview();
      ui.preview.dataset.state = 'error';
      say(DICT_ERROR, true);
    } finally {
      ui.previewBtn.disabled = false;
      ui.previewBtn.textContent = 'Preview';
    }
  }

  function dictSummary(e) {
    if (e.status !== 'found' || !e.dict) {
      return h('div', { class: 'pv-dict notfound' }, h('span', { class: 'nf' }, 'Not in dictionary'),
        e.flags.suggestion ? h('button', { type: 'button', class: 'pv-suggest', 'data-act': 'suggest' }, `Did you mean ${e.flags.suggestion}?`) : null);
    }
    // 字典形跟她打的一樣就不重複印（Rechnung → die Rechnung 才顯示）
    const parts = [e.display !== e.german ? h('span', { class: 'pv-display' }, e.display) : null];
    if (e.from) parts.push(h('span', { class: 'pv-from' }, `${e.from} → ${e.key}`));
    if (e.restored) parts.push(h('span', { class: 'pv-restored' }, e.restored));
    const d = e.dict;
    if (d.readings) {
      const r = d.readings[0];
      const facts = [h('span', { 'data-dict-field': 'pos' }, r.posLabel)];
      if (r.pluralOnly) facts.push(h('span', { 'data-dict-field': 'plural' }, 'plural only'));
      else if (r.plural && r.plural.length) facts.push(h('span', { 'data-dict-field': 'plural' }, `plural: ${r.plural.join(', ')}`));
      else if (r.noPlural) facts.push(h('span', { 'data-dict-field': 'plural' }, 'no plural'));
      const gl = [...new Set(d.readings.flatMap((x) => x.glosses))].slice(0, 3);
      parts.push(h('span', { class: 'pv-facts' }, ...facts.flatMap((f, k) => [k ? ' · ' : '', f])));
      if (gl.length) parts.push(h('span', { class: 'pv-gloss', 'data-dict-field': 'glosses' }, gl.join('; ')));
    } else if (d.breakdown) {
      parts.push(h('span', { class: 'pv-facts', 'data-dict-field': 'breakdown' },
        d.breakdown.map((b) => (restorable(b) ? `${b.token} → ${b.lemma}` : b.token)).join(' · ')));
      if (d.usage.length) parts.push(h('span', { class: 'pv-gloss', 'data-dict-field': 'usage' }, d.usage.map((u) => `${u.pattern} — ${u.gloss}`).join('; ')));
    }
    return h('div', { class: 'pv-dict' }, ...parts);
  }

  // Check split 的原因（SPEC §5.1 F：不確定就標，而且講清楚為什麼）
  const CHECK_TEXT = {
    boundary: 'a word here is both German and English — tap the word where your note starts:',
    unknown: 'a word is neither in the dictionary nor in the English word list — tap the word where your note starts:',
    typo: 'the German word isn’t in the dictionary — maybe a typo (see the suggestion). Tap the word where your note starts:',
    maybeNote: 'this line could also be your note for the line above — use Fix if it is.',
    note: 'a line below was read as your note but contains a German word — use Fix if that’s wrong.',
    first: 'this looks like a meaning with no German word above it — use Fix.',
    comma: 'not every part is in the dictionary — tap the word where your note starts:',
  };
  const splitChips = (e) => h('div', { class: 'split-words' },
    ...e.splitWords.map((w, k) => h('button', { type: 'button', class: 'split-word', 'data-act': 'split', 'data-k': String(k), disabled: k === 0 }, w.text)),
    h('button', { type: 'button', class: 'split-all', 'data-act': 'split', 'data-k': String(e.splitWords.length) }, 'All German'));

  let hadRows = false; // 這次預覽原本有筆數（被刪光 → 按鈕停用並說明；一開始就沒有 → 不顯示按鈕）
  const openFix = new Set();

  // 「Add N words」是去重後實際會新增的字數；併進既有字的另外寫（SPEC §5.1 F：數字要真）
  function commitCounts() {
    const keys = new Set(entries.filter((e) => e.key && String(e.german || '').trim()).map((e) => e.key));
    let fresh = 0, merged = 0;
    for (const k of keys) if (existing.has(k)) merged++; else fresh++;
    return { fresh, merged };
  }
  function updateCommit() {
    const { fresh, merged } = commitCounts();
    const note = $('wb-commit-note');
    ui.commit.hidden = !hadRows;
    ui.commit.disabled = fresh + merged === 0;
    ui.commit.textContent = fresh || !merged ? `Add ${plural(fresh, 'word')}` : `Update ${plural(merged, 'word')}`;
    note.hidden = !hadRows;
    note.textContent = fresh + merged === 0 ? 'Nothing to add — every line was removed.'
      : merged ? `${merged} merged into existing (your notes are added, familiarity stays)` : '';
  }

  function renderPreview() {
    ui.skipped.hidden = !skipped;
    ui.skipped.textContent = skipped ? `Skipped ${plural(skipped, 'line')} (only symbols, emoji, numbers or links).` : '';
    ui.input.classList.toggle('compact', entries.length > 0);
    if (!entries.length) {
      ui.preview.replaceChildren();
      updateCommit();
      if (!hadRows && ui.preview.dataset.state !== 'error') say('Nothing to add. Paste words, one per line.');
      return;
    }
    ui.preview.replaceChildren(...entries.map((e, i) => {
      const f = e.flags;
      const cls = ['pv-row', f.checkSplit ? 'check' : '', f.article ? 'bad-article' : '', e.status === 'notfound' ? 'nf' : ''].filter(Boolean).join(' ');
      const fixing = openFix.has(e.id);
      const row = h('li', { class: cls, 'data-i': String(i), style: `--i:${Math.min(i, 12)}` },
        h('div', { class: 'pv-german' }, h('span', { class: 'pv-typed', lang: 'de' }, e.german),
          existing.has(e.key) ? h('span', { class: 'flag-dup' }, 'Already in your list — your note will be added') : null),
        e.note !== null ? h('div', { class: 'pv-note' }, h('span', { class: 'label' }, 'Your note'), h('span', { class: 'pv-note-text' }, e.note)) : null,
        dictSummary(e),
        f.article ? h('p', { class: 'flag-article' }, `Article: ${f.article.dict} (you wrote ${f.article.wrote})`) : null,
        f.checkSplit ? h('div', { class: 'flag-check' },
          h('p', {}, h('b', {}, 'Check split'), ` — ${CHECK_TEXT[f.checkReason] || CHECK_TEXT.boundary}`),
          ['note', 'first', 'maybeNote'].includes(f.checkReason) || fixing ? null : splitChips(e)) : null,
        f.noMeaning ? h('p', { class: 'flag-nomeaning' }, 'No meaning yet — only German → meaning will be quizzed') : null,
        h('div', { class: 'pv-actions' },
          // SPEC §5.1 E（P6.5）：已有 Your note 的那筆外面不給 Merge（收在 Fix 裡，§5.1 F）；沒 note 的才給、普通樣式
          i > 0 && e.note === null ? h('button', { type: 'button', class: 'pv-merge', 'data-act': 'merge' }, 'Merge into previous') : null,
          h('button', { type: 'button', class: fixing ? 'pv-fix open' : 'pv-fix', 'data-act': 'fix', 'aria-expanded': String(fixing) }, 'Fix'),
          h('button', { type: 'button', class: 'pv-remove', 'data-act': 'remove', 'aria-label': `Remove ${e.german}` }, 'Remove')),
        // SPEC §5.1 F：每一筆都救得回來——重選分界、併到上一筆當解釋、拆出掛錯的解釋、刪除
        fixing ? h('div', { class: 'fix-panel' },
          h('p', { class: 'fix-title' }, 'Where does your note start?'), splitChips(e),
          h('div', { class: 'fix-actions' },
            i > 0 ? h('button', { type: 'button', class: 'fix-merge', 'data-act': 'merge' }, 'Use this whole entry as the note of the one above') : null,
            e.note !== null ? h('button', { type: 'button', class: 'fix-splitnew', 'data-act': 'splitnew' }, 'Move the last note line out as a new word') : null,
            h('button', { type: 'button', class: 'fix-delete', 'data-act': 'remove' }, 'Delete this entry'))) : null);
      return row;
    }));
    updateCommit();
  }

  ui.previewBtn.addEventListener('click', runPreview);
  ui.preview.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const i = Number(btn.closest('.pv-row').dataset.i);
    const dict = getDict();
    const act = btn.dataset.act;
    if (act === 'fix') {
      const id = entries[i].id;
      if (openFix.has(id)) openFix.delete(id); else openFix.add(id);
      renderPreview();
      return;
    }
    ui.preview.dataset.state = 'busy';
    openFix.delete(entries[i] && entries[i].id); // 做完一個修正就把 Fix 收起來
    try {
      if (act === 'remove') entries = removeEntry(entries, i);
      else if (act === 'merge') entries = await mergeIntoPrevious(entries, i, dict);
      else if (act === 'splitnew') entries = await splitIntoNew(entries, i, dict);
      else if (act === 'split') entries = await splitAt(entries, i, Number(btn.dataset.k), dict);
      else if (act === 'suggest') entries = await acceptSuggestion(entries, i, dict);
    } catch {
      say(DICT_ERROR, true);
    }
    renderPreview();
    ui.preview.dataset.state = 'ready';
  });

  ui.commit.addEventListener('click', async () => {
    ui.commit.disabled = true;
    try {
      const r = await wb.importEntries(entries);
      entries = [];
      hadRows = false;
      ui.input.value = '';
      ui.preview.replaceChildren();
      ui.preview.dataset.state = 'empty';
      await goHome(true);
      say(`Added ${plural(r.added, 'word')}${r.merged ? `, updated ${plural(r.merged, 'word')} already in your list` : ''}.`);
      updateCommit();
    } catch (e) {
      // 寫入失敗：預覽留著、講清楚沒存進去（TESTS §12 對抗性：不可假裝已匯入）
      say(`${e && /^Could not save/.test(e.message) ? e.message : 'Could not save.'} Nothing was added — your preview is still here, try again.`, true);
      updateCommit();
    }
  });

  // ---------- 複習 ----------
  let session = null;
  let byKey = new Map();

  async function startReview() {
    say('');
    try {
      const [queue, all] = await Promise.all([wb.queue(), wb.all()]);
      if (!queue.length) { say('Nothing due today.'); return; }
      byKey = new Map(all.map((w) => [w.key, w]));
      session = new ReviewSession(queue);
      show(ui.review);
      showCard();
    } catch (e) {
      say(e.message, true);
    }
  }

  function dictBlock(w) {
    const d = w.dict;
    if (!d || w.status !== 'found') return [h('p', { class: 'notfound' }, 'Not in dictionary')];
    const out = [];
    if (d.readings) {
      for (const r of d.readings) {
        const article = r.header !== r.lemma ? r.header.slice(0, r.header.length - r.lemma.length).trim() : null;
        const f = [h('p', { class: 'd-head', 'data-dict-field': 'lemma', lang: 'de' }, article ? h('span', { class: 'article' }, `${article} `) : null, r.lemma),
          h('p', { class: 'd-pos', 'data-dict-field': 'pos' }, r.posLabel)];
        if (r.pos === 'noun') {
          const t = r.pluralOnly ? 'plural only' : r.plural && r.plural.length ? `plural: ${r.plural.join(', ')}` : r.noPlural ? 'no plural' : null;
          if (t) f.push(h('p', { 'data-dict-field': 'plural' }, t));
        }
        if (r.verb) {
          const v = r.verb, pp = v.principalParts ? [v.principalParts.present3sg, v.principalParts.preterite, v.principalParts.participle].filter(Boolean).join(' – ') : '';
          const bits = [];
          if (v.separable === true) bits.push(`separable (${v.prefix}-)`);
          if (v.irregular === true) bits.push(`irregular${pp ? `: ${pp}` : ''}`); else if (pp) bits.push(pp);
          if (v.auxiliary && v.auxiliary.length) bits.push(`perfect with ${v.auxiliary.join(' or ')}`);
          if (bits.length) f.push(h('p', { 'data-dict-field': 'verb' }, bits.join(' · ')));
        }
        if (r.adj && (r.adj.comparative || r.adj.superlative)) {
          f.push(h('p', { 'data-dict-field': 'adj' }, [r.lemma, (r.adj.comparative || []).join('/'), (r.adj.superlative || []).join('/')].filter(Boolean).join(' – ')));
        }
        if (r.prepCase) f.push(h('p', { 'data-dict-field': 'prep' }, PREP_CASE_LABEL[r.prepCase] || r.prepCase));
        if (r.glosses.length) f.push(h('ol', { 'data-dict-field': 'glosses' }, ...r.glosses.map((g) => h('li', {}, g))));
        out.push(h('div', { class: 'd-reading' }, ...f));
      }
    } else if (d.breakdown) {
      out.push(h('ul', { class: 'd-breakdown', 'data-dict-field': 'breakdown' }, ...d.breakdown.map((b) => {
        const form = b.contextForm ? b.contextForm.join('; ') : b.forms.length && b.forms.length <= 2 ? b.forms.join('; ')
          : b.forms.length ? `${b.forms.length} possible forms` : '';
        return h('li', {}, h('b', { lang: 'de' }, b.token), restorable(b) ? ` → ${b.lemma}` : '',
          h('span', { class: 'muted' }, [` · ${b.posLabel}`, form ? ` · ${form}` : '', b.prepCase ? ` · ${PREP_CASE_LABEL[b.prepCase] || b.prepCase}` : ''].join('')),
          b.gloss ? h('div', { class: 'd-gloss' }, b.gloss) : null);
      })));
      if (d.usage.length) {
        out.push(h('ul', { class: 'd-usage', 'data-dict-field': 'usage' }, ...d.usage.map((u) => h('li', {}, h('b', {}, u.pattern), ` — ${u.gloss}`,
          u.example ? h('div', { class: 'muted small' }, h('i', { lang: 'de' }, u.example[0]), ` — ${u.example[1]}`) : null))));
      }
    }
    return out;
  }

  function sections(w) {
    const out = [];
    if (w.notes.length) {
      out.push(h('section', { class: 'sec sec-note' }, h('h3', { class: 'section-title' }, 'Your note'),
        h('p', { class: 'your-note' }, w.notes.join('\n'))));
    }
    out.push(h('section', { class: 'sec sec-dict' }, h('h3', { class: 'section-title' }, 'Dictionary'), ...dictBlock(w)));
    return out;
  }

  function showCard() {
    const item = session && session.current;
    if (!item) { finish(); return; }
    const w = byKey.get(item.key);
    if (!w) { session.i++; showCard(); return; }
    ui.card.dataset.dir = item.dir;
    ui.card.dataset.side = 'front';
    ui.card.classList.toggle('again', item.reshow);
    const front = ui.card.querySelector('.front');
    const back = ui.card.querySelector('.back');
    const restored = w.restored ? h('p', { class: 'restored', lang: 'de' }, w.restored) : null;
    // replaceChildren 不濾 null（會印出 "null"，P2.7 踩過同一個坑）→ 一律先濾掉
    const fill = (el, ...kids) => el.replaceChildren(...kids.filter((k) => k !== null && k !== undefined));
    if (item.dir === 'fwd') {
      fill(front, h('p', { class: 'dir-label' }, item.reshow ? 'Again · What does it mean?' : 'What does it mean?'),
        h('p', { class: 'prompt de', lang: 'de' }, w.display), restored, h('p', { class: 'tap-hint' }, 'Tap to flip'));
      back.replaceChildren(h('p', { class: 'mini', lang: 'de' }, w.display), h('div', { class: 'answer' }, ...sections(w)));
    } else {
      const fromNote = w.notes.length > 0;
      fill(front, h('p', { class: 'dir-label' }, item.reshow ? 'Again · What’s the German?' : 'What’s the German?'),
        h('p', { class: 'prompt meaning' }, reversePrompt(w)),
        h('p', { class: 'prompt-src' }, fromNote ? 'Your note' : 'Dictionary meaning'),
        h('p', { class: 'tap-hint' }, 'Tap to flip'));
      fill(back, h('p', { class: 'answer de', lang: 'de' }, w.display), restored ? restored.cloneNode(true) : null, ...sections(w));
    }
    front.hidden = false;
    back.hidden = true;
    ui.grade.hidden = true;
    const done = session.i;
    ui.progress.textContent = `${done + 1} / ${session.items.length}`;
  }

  function flip() {
    if (!session || session.done) return;
    const toBack = ui.card.dataset.side !== 'back';
    ui.card.dataset.side = toBack ? 'back' : 'front';
    ui.card.querySelector('.front').hidden = toBack;
    ui.card.querySelector('.back').hidden = !toBack;
    ui.grade.hidden = !toBack;
  }
  ui.card.addEventListener('click', flip);
  ui.card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });

  // 按下去馬上換下一張（不等儲存）；儲存照順序排隊，失敗就明講這個答案沒存到
  let pending = 0;
  function grade(g) {
    const item = session && session.current;
    if (!item || ui.card.dataset.side !== 'back') return;
    const w = byKey.get(item.key);
    const before = w.cards[item.dir];
    const after = session.answer(g, before, today());
    if (!item.reshow) {
      w.cards[item.dir] = after;
      pending++;
      ui.review.dataset.pending = String(pending);
      // 整個字（兩個方向的最新狀態）一次寫進去，不先讀：同一個字連著答兩個方向也不會互相蓋掉
      wb.saveAnswer(w, item.dir, before).catch((e) => {
        say(`${e.message} This answer was not saved.`, true);
      }).finally(() => {
        pending--;
        ui.review.dataset.pending = String(pending);
      });
    }
    showCard();
  }
  $('wb-forgot').addEventListener('click', () => grade('forgot'));
  $('wb-unsure').addEventListener('click', () => grade('unsure'));
  $('wb-know').addEventListener('click', () => grade('know'));
  document.addEventListener('keydown', (e) => {
    if (ui.review.hidden || ui.words.hidden || ui.card.dataset.side !== 'back') return;
    const g = { 1: 'forgot', 2: 'unsure', 3: 'know' }[e.key];
    if (g) grade(g);
  });
  ui.start.addEventListener('click', startReview);
  $('wb-quit').addEventListener('click', () => { if (session && session.moves.length) finish(); else goHome(); });

  function finish() {
    const s = session.summary();
    session = null;
    show(ui.summary);
    ui.summary.querySelector('.wb-sum-main').textContent =
      `Reviewed ${plural(s.reviewed, 'card')} · ${s.up} up · ${s.stayed} stayed · ${s.down} back to Learning`;
    const moved = GROUPS.filter((g) => s.changes[g] !== 0);
    ui.summary.querySelector('.wb-sum-groups').replaceChildren(...(moved.length ? moved.map((g) => h('li', {},
      h('span', {}, g), h('b', { class: s.changes[g] > 0 ? 'plus' : 'minus' }, s.changes[g] > 0 ? `+${s.changes[g]}` : String(s.changes[g]))))
      : [h('li', { class: 'muted' }, 'No group changed.')]));
  }

  // ---------- 清單（全部／某一組）：移組、刪除 ----------
  function dueText(c) {
    if (c.due === null || c.due === undefined) return 'new';
    const n = c.due - today();
    if (n <= 0) return 'due today';
    if (n === 1) return 'due tomorrow';
    return `due in ${n} days`;
  }
  let listGroup = null;
  async function openList(group) {
    listGroup = group;
    say('');
    show(ui.list);
    ui.listTitle.textContent = group ? `${group}` : 'All words';
    // 先清掉上一次的清單，免得在新清單畫好之前點到舊的那一份
    ui.items.replaceChildren();
    ui.items.dataset.state = 'loading';
    try {
      const rows = [];
      for (const w of await wb.all()) {
        for (const dir of ['fwd', 'rev']) {
          if (dir === 'rev' && reversePrompt(w) === null) continue;
          const c = w.cards[dir];
          if (group && GROUPS[c.box] !== group) continue;
          rows.push(h('li', { class: 'wb-item', 'data-key': w.key, 'data-dir': dir },
            h('div', { class: 'wb-word' }, h('b', { lang: 'de' }, w.display), w.status !== 'found' ? h('span', { class: 'nf-tag' }, 'Not in dictionary') : null),
            w.notes.length ? h('div', { class: 'wb-note' }, w.notes.join(' / ')) : null,
            h('div', { class: 'wb-meta' }, h('span', { class: 'dir' }, DIR_LABEL[dir]), ' · ', h('span', { class: 'due' }, dueText(c))),
            h('div', { class: 'wb-controls' },
              h('select', { 'aria-label': `Group for ${w.display} (${DIR_LABEL[dir]})` }, ...GROUPS.map((g, k) => {
                const o = h('option', { value: g }, g);
                if (k === c.box) o.selected = true;
                return o;
              })),
              h('button', { type: 'button', class: 'wb-delete' }, 'Delete'))));
        }
      }
      ui.items.replaceChildren(...(rows.length ? rows : [h('li', { class: 'muted empty' }, group ? `No cards in ${group}.` : 'No words yet.')]));
    } catch (e) {
      say(e.message, true);
    }
    ui.items.dataset.state = 'ready';
  }
  ui.items.addEventListener('change', async (e) => {
    const sel = e.target.closest('select');
    if (!sel) return;
    const li = sel.closest('.wb-item');
    try {
      await wb.moveCard(li.dataset.key, li.dataset.dir, GROUPS.indexOf(sel.value));
      const w = await wb.get(li.dataset.key);
      li.querySelector('.due').textContent = dueText(w.cards[li.dataset.dir]);
    } catch (err) {
      say(err.message, true);
    }
  });
  ui.items.addEventListener('click', async (e) => {
    const del = e.target.closest('.wb-delete');
    if (!del) return;
    // 刪除要按兩下（手機上誤觸很常見）
    if (!del.classList.contains('confirm')) {
      del.classList.add('confirm');
      del.textContent = 'Tap again to delete';
      return;
    }
    try {
      await wb.remove(del.closest('.wb-item').dataset.key);
      await openList(listGroup);
    } catch (err) {
      say(err.message, true);
    }
  });

  return { setTab, wordbook: wb };
}
