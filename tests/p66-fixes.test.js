// P6.6（SPEC §5.1 F）：Tester P6 驗收不通過（LifeOS/…/docs/tester/P6-acceptance.md）的失敗輸入，逐條寫成測試。
// 只用報告裡列出的失敗輸入；集外組本身不看（下一輪 Tester 另寫）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDictionary } from '../src/dict.js';
import { importPreview, acceptSuggestion, mergeIntoPrevious, splitAt } from '../src/wordbook/parse.js';

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
const pv = (text) => importPreview(text, dict);
const pair = (e) => (e.note ? `${e.german} ‖ ${e.note}` : e.german);

describe('F1 切錯卻沒標（Tester 報告的 5 筆）', () => {
  it('F1 Kita ⏎ daycare → Kita ‖ daycare（daycare 是英文，離線英文詞表認得）', async () => {
    const { entries } = await pv('Kita\ndaycare');
    expect(entries.map(pair)).toEqual(['Kita ‖ daycare']);
  });
  it('F1 Ausweis ⏎ ID card ⏎ =身分證 → Ausweis ‖ ID card⏎身分證（ID 不可當成德文 das Id）', async () => {
    const { entries } = await pv('Ausweis\nID card\n=身分證');
    expect(entries).toHaveLength(1);
    expect(entries[0].german).toBe('Ausweis');
    expect(entries[0].note).toBe('ID card\n身分證');
  });
  it('F1 Termn appointmnet → Termn ‖ appointmnet、Check split、Did you mean Termin', async () => {
    const { entries } = await pv('Termn appointmnet');
    expect(entries).toHaveLength(1);
    expect(pair(entries[0])).toBe('Termn ‖ appointmnet');
    expect(entries[0].flags.checkSplit).toBe(true);
    expect(entries[0].flags.suggestion).toBe('Termin');
  });
  it('F1 Kühlschrnak fridge → Kühlschrnak ‖ fridge、Did you mean Kühlschrank', async () => {
    const { entries } = await pv('Kühlschrnak fridge');
    expect(entries).toHaveLength(1);
    expect(pair(entries[0])).toBe('Kühlschrnak ‖ fridge');
    expect(entries[0].flags.suggestion).toBe('Kühlschrank');
  });
  it('F1 Mama mom → Mama ‖ mom 或標 Check split（mom 不可被當成德文片語的一部分又不標）', async () => {
    const { entries } = await pv('Mama mom');
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(pair(e) === 'Mama ‖ mom' || e.flags.checkSplit).toBe(true);
    expect(e.german).not.toBe('Mama mom');
  });
});

describe('F1 不確定就標：沒有「切了但沒把握又沒標」的路徑（§5.1 F）', () => {
  // 沒有分隔符號的行，只要有任何一個字德文查不到也不是英文 → 一律 Check split
  for (const line of ['Party feirn', 'Termn appointmnet', 'Kündigunsfrist', 'Rechnug', 'Blarkenschaft', 'Arzt blorp zzz']) {
    it(`F1 有查不到也不是英文的字就標：${line}`, async () => {
      const { entries } = await pv(line);
      expect(entries.every((e) => e.flags.checkSplit)).toBe(true);
    });
  }
  // 德英同形的字落在分界上 → 一律標（包含詞頻低的 bill）
  for (const line of ['die Rechnung bill 帳單', 'gehen will go', 'bald also soon']) {
    it(`F1 德英同形在分界上就標：${line}`, async () => {
      const { entries } = await pv(line);
      expect(entries[0].flags.checkSplit).toBe(true);
    });
  }
  it('F1 die Rechnung bill 帳單 分界仍照 Golden K（標了也要切對）', async () => {
    const { entries } = await pv('die Rechnung bill 帳單');
    expect(pair(entries[0])).toBe('die Rechnung ‖ bill 帳單');
  });
});

describe('F2 拼字建議只修德文段', () => {
  it('F2 Kühlschrnak fridge 按建議 → Kühlschrank ‖ fridge（fridge 仍是 note，不會變成 Bridge）', async () => {
    let { entries } = await pv('Kühlschrnak fridge');
    entries = await acceptSuggestion(entries, 0, dict);
    expect(pair(entries[0])).toBe('Kühlschrank ‖ fridge');
    expect(entries[0].display).toBe('der Kühlschrank');
    expect(JSON.stringify(entries[0].dict)).not.toMatch(/Bridge/);
  });
  it('F2 拆開寫的複合詞只在整行沒有英文、沒有中文時嘗試（feiren abend 照舊建議 Feierabend）', async () => {
    const { entries } = await pv('feiren abend');
    expect(entries[0].flags.suggestion).toBe('Feierabend');
  });
});

describe('F3 每一筆都救得回來（解析層）', () => {
  it('F3 有 note 的那筆也能併進上一筆', async () => {
    let { entries } = await pv('Ausweis\nId - card');
    expect(entries).toHaveLength(2);
    entries = await mergeIntoPrevious(entries, 1, dict);
    expect(entries.map(pair)).toEqual(['Ausweis ‖ Id - card']);
  });
  it('F3 Termn appointmnet 可以點字重選分界（全部當德文）', async () => {
    let { entries } = await pv('Termn appointmnet');
    entries = await splitAt(entries, 0, 2, dict);
    expect(pair(entries[0])).toBe('Termn appointmnet');
  });
});

describe('F6 數字要真（解析層）', () => {
  it('F6 = ⏎ : nothing ⏎ | x → 不產生德文空白的一筆', async () => {
    const { entries } = await pv('=\n: nothing\n| x');
    expect(entries.every((e) => e.german && e.german.trim() && e.key)).toBe(true);
  });
});

describe('F7 行首條列符號去掉再解析', () => {
  const cases = [
    ['- Wohnung - apartment', 'Wohnung ‖ apartment', 'die Wohnung'],
    ['• Miete rent 房租', 'Miete ‖ rent 房租', 'die Miete'],
    ['1. Hose trousers', 'Hose ‖ trousers', 'die Hose'],
    ['* Termin: appointment', 'Termin ‖ appointment', 'der Termin'],
  ];
  for (const [line, want, display] of cases) {
    it(`F7 ${line}`, async () => {
      const { entries } = await pv(line);
      expect(entries).toHaveLength(1);
      expect(pair(entries[0])).toBe(want);
      expect(entries[0].display).toBe(display);
    });
  }
});

describe('§5.1 F 前後空白（含全形空白）去掉、中間一字不動', () => {
  it('Lampe - 　全形　空白　 → 全形　空白', async () => {
    const { entries } = await pv('Lampe - 　全形　空白　');
    expect(entries[0].note).toBe('全形　空白');
  });
});
