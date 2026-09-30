// P6.2 生字本儲存層（SPEC §5、§5.1；K1：閱讀頁存生字與批次貼上是同一本，以原形去重；K4：雙向卡各自計熟悉度）。
// 儲存後端可替換：瀏覽器用 IndexedDB（E2E 驗），這裡用記憶體後端驗邏輯。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDictionary } from '../src/dict.js';
import { importPreview, acceptSuggestion } from '../src/wordbook/parse.js';
import { createWordbook, memoryBackend, WordbookError, reversePrompt, exportMarkdown } from '../src/wordbook/store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fileFetch = async (url) => {
  const body = readFileSync(join(ROOT, url.replace(/^\.?\//, '')), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};
let dict;
beforeAll(async () => {
  dict = createDictionary({ base: './', fetchImpl: fileFetch });
  await dict.ready();
});

const TODAY = 20000;
let clock = TODAY;
const book = (backend = memoryBackend()) => createWordbook(backend, { today: () => clock });
async function importText(wb, text) {
  const { entries } = await importPreview(text, dict);
  return wb.importEntries(entries);
}

describe('匯入與去重', () => {
  it('S13 變化形存原形：gingen 存成 gehen', async () => {
    const wb = book();
    await importText(wb, 'gingen');
    const all = await wb.all();
    expect(all.map((w) => w.key)).toEqual(['gehen']);
    expect(all[0].typed).toEqual(['gingen']);
  });

  it('S17 重複的字不新增、熟悉度不歸零', async () => {
    clock = TODAY;
    const wb = book();
    await importText(wb, 'gehen');
    await wb.moveCard('gehen', 'fwd', 3); // 放到 Almost
    const r = await importText(wb, 'ging - 走（過去式）');
    expect(r).toEqual({ added: 0, merged: 1 });
    const all = await wb.all();
    expect(all).toHaveLength(1);
    expect(all[0].key).toBe('gehen');
    expect(all[0].notes).toEqual(['走（過去式）']);
    expect(all[0].cards.fwd.box).toBe(3);
    expect(all[0].typed).toEqual(['gehen', 'ging']);
  });
  it('去重：同樣的解釋不重複加，不同的才加', async () => {
    const wb = book();
    await importText(wb, 'Rechnung - 帳單');
    await importText(wb, 'die Rechnung - 帳單');
    await importText(wb, 'Rechnungen - invoice');
    const [w] = await wb.all();
    expect(w.notes).toEqual(['帳單', 'invoice']);
  });
  it('S14 查不到的字照原樣存，沒有任何字典欄位', async () => {
    const wb = book();
    await importText(wb, 'Blarkenschaft - 亂打的');
    const [w] = await wb.all();
    expect(w.status).toBe('notfound');
    expect(w.dict).toBe(null);
    expect(w.notes).toEqual(['亂打的']);
  });
  it('S21 拼字建議不按就不採用：存 feiren abend、查不到', async () => {
    const wb = book();
    await importText(wb, 'feiren abend');
    const [w] = await wb.all();
    expect(w.key).toBe('feiren abend');
    expect(w.status).toBe('notfound');
    expect(w.dict).toBe(null);
  });
  it('S20 按了建議才換：存 Feierabend，她打的 feiren abend 留在寫法裡', async () => {
    const wb = book();
    let { entries } = await importPreview('feiren abend', dict);
    entries = await acceptSuggestion(entries, 0, dict);
    await wb.importEntries(entries);
    const [w] = await wb.all();
    expect(w.key).toBe('Feierabend');
    expect(w.typed).toEqual(['feiren abend']);
  });
  it('片語以原形版本去重，她打過的不同寫法都保留', async () => {
    const wb = book();
    await importText(wb, 'lebe seit');
    await importText(wb, 'lebt seit - live since');
    const all = await wb.all();
    expect(all.map((w) => w.key)).toEqual(['leben seit']);
    expect(all[0].typed).toEqual(['lebe seit', 'lebt seit']);
  });
  it('TK 原樣：存進去讀出來逐字相同（含換行）', async () => {
    const wb = book();
    await importText(wb, 'bald\n= soon\n= 很快！！ Typo teh');
    const [w] = await wb.all();
    expect(w.notes).toEqual(['soon\n很快！！ Typo teh']);
  });
});

describe('K1 閱讀頁存生字（S08）跟批次貼上是同一本', () => {
  it('S08 存過 gingen，再從另一句存 ging → 只有一筆 gehen，底下兩個原句', async () => {
    const wb = book();
    const a = await importPreview('gingen', dict);
    await wb.saveFromReader(a.entries[0], 'Wir gingen nach Hause.');
    const b = await importPreview('ging', dict);
    await wb.saveFromReader(b.entries[0], 'Er ging schnell.');
    const all = await wb.all();
    expect(all).toHaveLength(1);
    expect(all[0].key).toBe('gehen');
    expect(all[0].contexts.map((c) => c.sentence)).toEqual(['Wir gingen nach Hause.', 'Er ging schnell.']);
    await importText(wb, 'gehen - 走');
    expect((await wb.all())).toHaveLength(1);
  });
});

describe('K4 雙向卡（S23）', () => {
  it('S23 有 note 的字：反向卡正面是 note', async () => {
    const wb = book();
    await importText(wb, 'die Rechnung - 帳單\nKündigungsfrist');
    const all = await wb.all();
    const r = all.find((w) => w.key === 'Rechnung');
    const k = all.find((w) => w.key === 'Kündigungsfrist');
    expect(reversePrompt(r)).toBe('帳單');
    expect(reversePrompt(k)).toBe(k.dict.readings[0].glosses[0]); // 沒有 note → 字典英文第一個義項
  });
  it('S23 note 和字典都沒有 → 不出反向卡', async () => {
    const wb = book();
    await importText(wb, 'Blarkenschaft');
    const [w] = await wb.all();
    expect(reversePrompt(w)).toBe(null);
    const q = await wb.queue();
    expect(q).toEqual([{ key: 'Blarkenschaft', dir: 'fwd' }]);
  });
  it('S23 反向卡按 Know it 只移動反向卡的組別，正向卡的組別不變', async () => {
    clock = TODAY;
    const wb = book();
    await importText(wb, 'die Rechnung - 帳單');
    await wb.answer('Rechnung', 'rev', 'know');
    const [w] = await wb.all();
    expect(w.cards.rev.box).toBe(1);
    expect(w.cards.fwd.box).toBe(0);
    expect(w.cards.fwd.due).toBe(null);
  });
  it('S23 佇列裡兩個方向都有', async () => {
    const wb = book();
    await importText(wb, 'die Rechnung - 帳單\nKündigungsfrist');
    const q = await wb.queue();
    expect(q.filter((x) => x.dir === 'rev').map((x) => x.key).sort()).toEqual(['Kündigungsfrist', 'Rechnung']);
    expect(q.filter((x) => x.dir === 'fwd').map((x) => x.key).sort()).toEqual(['Kündigungsfrist', 'Rechnung']);
  });
});

describe('S18 答對往上、答錯退回（儲存層）', () => {
  it('S18 Familiar 按 Know it → Almost，7 天後到期；再按 Forgot → Learning', async () => {
    clock = TODAY;
    const wb = book();
    await importText(wb, 'die Rechnung - 帳單');
    await wb.moveCard('Rechnung', 'fwd', 2);
    await wb.answer('Rechnung', 'fwd', 'know');
    let [w] = await wb.all();
    expect(w.cards.fwd.box).toBe(3);
    expect(w.cards.fwd.due).toBe(TODAY + 7);
    clock = TODAY + 7;
    await wb.answer('Rechnung', 'fwd', 'forgot');
    [w] = await wb.all();
    expect(w.cards.fwd.box).toBe(1);
    clock = TODAY;
  });
  it('新字上限跨次複習累計（今天已經學過的新字算進去）', async () => {
    clock = TODAY;
    const wb = book();
    await importText(wb, Array.from({ length: 25 }, (_, k) => ['Rechnung', 'Termin', 'Arzt', 'Wohnung', 'Bank', 'Haus', 'Kind', 'Tisch', 'Stuhl', 'Buch',
      'Auto', 'Stadt', 'Land', 'Frau', 'Mann', 'Hund', 'Katze', 'Baum', 'Blume', 'Wasser', 'Brot', 'Milch', 'Zug', 'Weg', 'Tag'][k]).join('\n'));
    const q1 = await wb.queue();
    expect(new Set(q1.map((x) => x.key)).size).toBe(20);
    for (const key of [...new Set(q1.map((x) => x.key))].slice(0, 5)) await wb.answer(key, 'fwd', 'know');
    const q2 = await wb.queue();
    expect(new Set(q2.filter((x) => (x.dir === 'fwd' ? true : true)).map((x) => x.key)).size).toBe(20); // 5 個已開始＋15 個新字
    clock = TODAY + 1;
    const q3 = await wb.queue(); // 隔天：新字額度重算
    expect(q3.length).toBeGreaterThan(0);
    clock = TODAY;
  });
  it('分組頁：每組幾張卡、手動移組、刪除', async () => {
    const wb = book();
    await importText(wb, 'die Rechnung - 帳單\nTermin');
    await wb.moveCard('Termin', 'fwd', 4);
    const c = await wb.counts();
    expect(c.Known).toBe(1);
    expect(c.New).toBe(3); // Rechnung 兩張、Termin 反向一張（Termin 有字典英文）
    await wb.remove('Termin');
    expect((await wb.all()).map((w) => w.key)).toEqual(['Rechnung']);
  });
});

describe('匯出（SPEC §5.1 D）', () => {
  it('Markdown 有組別與 Sherry 的解釋，解釋逐字相同', async () => {
    const wb = book();
    await importText(wb, 'die Rechnung bill 帳單\nKündigungsfrist\nBlarkenschaft - 亂打的！');
    const md = exportMarkdown(await wb.all());
    const lines = md.split('\n');
    expect(lines[0]).toMatch(/Word.*Your note.*Group/);
    const row = lines.find((l) => l.includes('die Rechnung'));
    expect(row).toContain('| bill 帳單 |');
    expect(row).toContain('New');
    expect(md).toContain('| 亂打的！ |');
    expect(md).toContain('Not in dictionary');
  });
  it('多行解釋用 <br>、| 跳脫，還原後跟原文相同', async () => {
    const wb = book();
    await importText(wb, 'bald\n= soon | bald\n= 很快');
    const md = exportMarkdown(await wb.all());
    const row = md.split('\n').find((l) => l.startsWith('| bald'));
    expect(row).toContain('soon \\| bald<br>很快');
  });
});

describe('對抗性：IndexedDB 寫入失敗', () => {
  it('寫入失敗 → 明確錯誤，不假裝已匯入', async () => {
    const backend = memoryBackend();
    backend.putMany = async () => { throw new Error('QuotaExceededError'); };
    const wb = book(backend);
    const { entries } = await importPreview('Rechnung - 帳單', dict);
    await expect(wb.importEntries(entries)).rejects.toBeInstanceOf(WordbookError);
    expect(await wb.all()).toEqual([]);
  });
});
