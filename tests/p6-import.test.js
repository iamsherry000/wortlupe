// P6.1 單字本批次貼上：解析器（SPEC §5.1 A、TESTS §12 Golden Set K、S12–S16、S20–S22、TK 原樣／零編造／效能）。
// 純函式層：切筆、分隔符號、片語還原、拼字建議、去重鍵。畫面層在 tests/e2e/wordbook.spec.js。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDictionary } from '../src/dict.js';
import {
  importPreview, mergeIntoPrevious, splitIntoNew, splitAt, acceptSuggestion, removeEntry,
} from '../src/wordbook/parse.js';
import { suggestSpelling } from '../src/wordbook/fuzzy.js';

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
// 「德文段 ‖ Your note」：TESTS §12 Golden Set K 的寫法
const pair = (e) => (e.note ? `${e.german} ‖ ${e.note}` : e.german);

describe('Golden Set K — 單行分界', () => {
  const golden = [
    ['die Rechnung bill 帳單', 'die Rechnung ‖ bill 帳單'],
    ['aufstehen - 起床', 'aufstehen ‖ 起床'],
    ['der Termin: appointment', 'der Termin ‖ appointment'],
    ['sich freuen auf\tto look forward to', 'sich freuen auf ‖ to look forward to'],
    ['Kündigungsfrist', 'Kündigungsfrist ‖'],
    ['Kündigungsfrist 解約期限', 'Kündigungsfrist ‖ 解約期限'],
    ['anrufen = call someone', 'anrufen ‖ call someone'],
    ['Bescheid sagen let sb know 通知', 'Bescheid sagen ‖ let sb know 通知'],
    ['die Wohnung | apartment', 'die Wohnung ‖ apartment'],
    ['schon – already 已經', 'schon ‖ already 已經'],
    ['Gift poison', 'Gift ‖ poison'],
    ['Bank bench / bank', 'Bank ‖ bench / bank'],
  ];
  for (const [line, want] of golden) {
    it(`K ${line.replace('\t', '⇥')}`, async () => {
      const { entries } = await pv(line);
      expect(entries).toHaveLength(1);
      expect(pair(entries[0])).toBe(want.replace(/ ‖$/, ''));
      // 分界清楚：不標 Check split。P6.6（SPEC §5.1 F）起德英同形落在分界上一律標 → bill（bellen 的命令式）那行要標
      expect(entries[0].flags.checkSplit).toBe(line === 'die Rechnung bill 帳單');
    });
  }

  it('K gehen will go → Check split（will 也是德文 wollen 的形）', async () => {
    const { entries } = await pv('gehen will go');
    expect(entries).toHaveLength(1);
    expect(entries[0].flags.checkSplit).toBe(true);
  });
  it('K bald also soon → Check split（also 也是德文）', async () => {
    const { entries } = await pv('bald also soon');
    expect(entries).toHaveLength(1);
    expect(entries[0].flags.checkSplit).toBe(true);
  });
  it('K Arzt,Termin,Rechnung → 三筆（K5：每段都查得到才拆）', async () => {
    const { entries } = await pv('Arzt,Termin,Rechnung');
    expect(entries.map((e) => e.german)).toEqual(['Arzt', 'Termin', 'Rechnung']);
    expect(entries.every((e) => !e.flags.checkSplit)).toBe(true);
  });
  it('K Arzt, Termin, blabla → 一筆 Check split', async () => {
    const { entries } = await pv('Arzt, Termin, blabla');
    expect(entries).toHaveLength(1);
    expect(entries[0].flags.checkSplit).toBe(true);
  });
  it('K 只有 😊、15、https://x.de 的行 → 略過 3 行', async () => {
    const r = await pv('😊\n15\nhttps://x.de');
    expect(r.entries).toEqual([]);
    expect(r.skipped).toBe(3);
  });
});

describe('Golden Set K — 多行（空行不算分隔）', () => {
  it('K bald ⏎ soon → bald ‖ soon', async () => {
    const { entries } = await pv('bald\nsoon');
    expect(entries.map(pair)).toEqual(['bald ‖ soon']);
  });
  it('K Rechnung ⏎ ⏎ 帳單 → Rechnung ‖ 帳單', async () => {
    const { entries } = await pv('Rechnung\n\n帳單');
    expect(entries.map(pair)).toEqual(['Rechnung ‖ 帳單']);
  });
  it('K feiern ⏎ Party machen → 兩筆（沒有 =）', async () => {
    const { entries } = await pv('feiern\nParty machen');
    expect(entries.map(pair)).toEqual(['feiern', 'Party machen']);
  });
  it('K feiern ⏎ = Party machen → feiern ‖ Party machen', async () => {
    const { entries } = await pv('feiern\n= Party machen');
    expect(entries.map(pair)).toEqual(['feiern ‖ Party machen']);
  });
  it('K feiern ⏎ ⏎ =Party machen（= 後沒空白）→ feiern ‖ Party machen', async () => {
    const { entries } = await pv('feiern\n\n=Party machen');
    expect(entries.map(pair)).toEqual(['feiern ‖ Party machen']);
  });
  it('K bald ⏎ = soon ⏎ = 很快 → bald ‖ soon⏎很快（多行解釋都掛上去，保留換行）', async () => {
    const { entries } = await pv('bald\n= soon\n= 很快');
    expect(entries).toHaveLength(1);
    expect(entries[0].german).toBe('bald');
    expect(entries[0].note).toBe('soon\n很快');
  });
  it('K 第一行就是 = soon → Check split', async () => {
    const { entries } = await pv('= soon');
    expect(entries).toHaveLength(1);
    expect(entries[0].flags.checkSplit).toBe(true);
  });
  it('K lebe seit ⏎ bald → 兩筆，第二筆標 Merge into previous', async () => {
    const { entries } = await pv('lebe seit\nbald');
    expect(entries.map((e) => e.german)).toEqual(['lebe seit', 'bald']);
    expect(entries[1].flags.mergeHint).toBe(true);
    expect(entries[0].flags.mergeHint).toBe(false);
  });
  it('K 第一行就是 soon → Check split', async () => {
    const { entries } = await pv('soon');
    expect(entries).toHaveLength(1);
    expect(entries[0].flags.checkSplit).toBe(true);
  });
});

describe('Golden Set K — 拼字建議', () => {
  it('K feiren abend → Did you mean Feierabend', async () => {
    const { entries } = await pv('feiren abend');
    expect(entries).toHaveLength(1);
    expect(entries[0].flags.suggestion).toBe('Feierabend');
  });
  it('K Kündigunsfrist → Did you mean Kündigungsfrist', async () => {
    const { entries } = await pv('Kündigunsfrist');
    expect(entries[0].flags.suggestion).toBe('Kündigungsfrist');
  });
  it('K Blarkenschaft → 沒有建議（字典裡沒有距離 ≤ 2 的）', async () => {
    const { entries } = await pv('Blarkenschaft');
    expect(entries[0].flags.suggestion).toBe(null);
    expect(suggestSpelling(['Blarkenschaft'], dict)).toBe(null);
  });
});

describe('BDD S12–S16、S20–S22（解析層）', () => {
  it('S12 夾雜輸入切出德文與原樣解釋', async () => {
    const { entries } = await pv('die Rechnung bill 帳單\naufstehen - 起床\nder Termin: appointment');
    expect(entries.map((e) => [e.display, e.note])).toEqual([
      ['die Rechnung', 'bill 帳單'], ['aufstehen', '起床'], ['der Termin', 'appointment'],
    ]);
  });

  it('S13 沒附解釋的字由字典補，變化形存原形', async () => {
    const { entries } = await pv('Kündigungsfrist\ngingen');
    const [k, g] = entries;
    expect(k.display).toBe('die Kündigungsfrist');
    expect(k.note).toBe(null);
    expect(k.dict.readings[0].plural.length).toBeGreaterThan(0);
    expect(k.dict.readings[0].glosses.length).toBeGreaterThan(0);
    expect(g.from).toBe('gingen');
    expect(g.key).toBe('gehen');
    expect(g.display).toBe('gehen');
  });

  it('S14 查不到的字不編造（Blarkenschaft - 亂打的）', async () => {
    const { entries } = await pv('Blarkenschaft - 亂打的');
    const e = entries[0];
    expect(e.status).toBe('notfound');
    expect(e.dict).toBe(null);
    expect(e.note).toBe('亂打的');
    expect(e.flags.suggestion).toBe(null);
  });

  it('S15 冠詞打錯不默默改', async () => {
    const { entries } = await pv('der Rechnung - 帳單');
    const e = entries[0];
    expect(e.flags.article).toEqual({ dict: 'die', wrote: 'der' });
    expect(e.note).toBe('帳單');
    expect(e.display).toBe('die Rechnung');
    expect(e.german).toBe('der Rechnung'); // 她打的保留
  });
  it('S15 冠詞對的不標（die Rechnung、複數 die Häuser）', async () => {
    const { entries } = await pv('die Rechnung\ndie Häuser');
    expect(entries.map((e) => e.flags.article)).toEqual([null, null]);
  });
  it('S15 名詞沒打冠詞 → 從字典補（Rechnung → die Rechnung）', async () => {
    const { entries } = await pv('Rechnung');
    expect(entries[0].display).toBe('die Rechnung');
    expect(entries[0].key).toBe('Rechnung');
  });

  it('S16 德英同形不猜分界', async () => {
    const { entries } = await pv('gehen will go');
    expect(entries[0].flags.checkSplit).toBe(true);
  });

  it('S20 Sherry 9/30 真實樣本', async () => {
    const text = 'lebe seit\n\nbald\n\nsoon\n\nfeiern\n\nParty machen\n\nfeiren abend\n\nAll das';
    let { entries } = await pv(text);
    expect(entries.map(pair)).toEqual(['lebe seit', 'bald ‖ soon', 'feiern', 'Party machen', 'feiren abend', 'All das']);
    const fe = entries[4];
    expect(fe.flags.suggestion).toBe('Feierabend');
    expect(fe.status).toBe('notfound');
    expect(fe.dict).toBe(null); // 沒按之前沒有任何字典欄位
    expect(entries[0].display).toBe('lebe seit');
    expect(entries[0].restored).toBe('leben seit');
    entries = await mergeIntoPrevious(entries, 3, dict);
    entries = await acceptSuggestion(entries, 3, dict);
    expect(entries.map(pair)).toEqual(['lebe seit', 'bald ‖ soon', 'feiern ‖ Party machen', 'Feierabend', 'All das']);
    expect(entries[3].status).toBe('found');
    expect(entries[3].display).toBe('der Feierabend');
  });

  it('S20 片語背面逐字拆解（lebe → leben；seit ＋ Dativ）', async () => {
    const { entries } = await pv('lebe seit');
    const b = entries[0].dict.breakdown;
    expect(b.map((x) => [x.token, x.lemma])).toEqual([['lebe', 'leben'], ['seit', 'seit']]);
    expect(b[1].prepCase).toBe('Dat');
    expect(entries[0].key).toBe('leben seit');
  });
  it('S20 片語有用法表對得上的句型就列出（sich freuen auf）', async () => {
    const { entries } = await pv('sich freuen auf\tto look forward to');
    expect(entries[0].dict.usage.map((u) => u.pattern).join(' | ')).toMatch(/sich freuen auf/);
  });

  it('S21 拼字建議不按就不採用', async () => {
    const { entries } = await pv('feiren abend');
    expect(entries[0].german).toBe('feiren abend');
    expect(entries[0].status).toBe('notfound');
    expect(entries[0].dict).toBe(null);
  });

  it('S22 行首 = 一定掛到上一筆', async () => {
    const { entries } = await pv('feiern\n\n= Party machen');
    expect(entries).toHaveLength(1);
    expect(entries[0].german).toBe('feiern');
    expect(entries[0].note).toBe('Party machen');
  });
});

describe('預覽操作：Check split 決定分界、Split into new word、刪除', () => {
  it('Check split：點 will 當解釋開頭 → gehen ‖ will go', async () => {
    const { entries } = await pv('gehen will go');
    const words = entries[0].splitWords.map((w) => w.text);
    expect(words).toEqual(['gehen', 'will', 'go']);
    const next = await splitAt(entries, 0, 1, dict);
    expect(pair(next[0])).toBe('gehen ‖ will go');
    expect(next[0].flags.checkSplit).toBe(false);
  });
  it('Check split：選「全部是德文」→ 沒有 note', async () => {
    const { entries } = await pv('bald also soon');
    const next = await splitAt(entries, 0, 3, dict);
    expect(pair(next[0])).toBe('bald also soon');
  });
  it('Split into new word：掛錯的解釋拆出來成新的一筆', async () => {
    const { entries } = await pv('bald\nsoon');
    const next = await splitIntoNew(entries, 0, dict);
    expect(next.map(pair)).toEqual(['bald', 'soon']);
  });
  it('刪除一筆', async () => {
    const { entries } = await pv('bald\nfeiern');
    expect(removeEntry(entries, 0).map(pair)).toEqual(['feiern']);
  });
});

describe('TK 原樣：Sherry 的解釋一字不改', () => {
  const notes = ['bill 帳單', 'Appointment!! 約會。', 'to go , walk', '走（過去式）', 'teh bill (typo)', 'ÄÖÜ ß', '  spaces inside   kept  '];
  for (const n of notes) {
    it(`TK 原樣 "${n}"`, async () => {
      const { entries } = await pv(`Rechnung - ${n}`);
      expect(entries[0].note).toBe(n.trim());
    });
  }
  it('TK 原樣 下一行的中文解釋照存', async () => {
    const { entries } = await pv('Termin\n約會，要準時！');
    expect(entries[0].note).toBe('約會，要準時！');
  });
});

describe('TK 零編造', () => {
  for (const w of ['Blarkenschaft', 'Quimbertung', 'asdfghjkl', 'Schmurgelverwaltungsanstalt']) {
    it(`TK 零編造 ${w}`, async () => {
      const { entries } = await pv(`${w} - 測試`);
      expect(entries[0].status).toBe('notfound');
      expect(entries[0].dict).toBe(null);
    });
  }
  it('TK 零編造 片語裡有一個字查不到 → 整筆查不到，不給任何欄位', async () => {
    const { entries } = await pv('Party feirn - 派對');
    expect(entries[0].german).toBe('Party feirn');
    expect(entries[0].status).toBe('notfound');
    expect(entries[0].dict).toBe(null);
  });
});

describe('對抗性（T8 延伸）', () => {
  it('T8 2000 行、全中文、全英文、只有空白、整段 WhatsApp 對話 → 不丟例外', async () => {
    const inputs = [
      Array.from({ length: 2000 }, (_, k) => (k % 3 ? `Rechnung ${k} - 帳單` : 'bald')).join('\n'),
      '這是一段全中文的文字\n完全沒有德文',
      'this is all english\nnothing german here',
      '   \n\n \t \n',
      '[29.09.26, 18:02] Jonas: Hey, kommst du heut Abend? 😅\n[29.09.26, 18:03] Sherry: Ja klar! 👍',
    ];
    for (const t of inputs) {
      const r = await pv(t);
      expect(Array.isArray(r.entries)).toBe(true);
      expect(typeof r.skipped).toBe('number');
    }
    expect((await pv('   \n\n \t \n')).entries).toEqual([]);
  });
});

describe('TK 效能', () => {
  it('TK 300 行貼上到預覽 ≤ 2 秒（Node，含分片載入）', async () => {
    const words = ['die Rechnung bill 帳單', 'aufstehen - 起床', 'der Termin: appointment', 'Kündigungsfrist', 'gingen', 'feiren abend',
      'bald', 'soon', 'Bescheid sagen let sb know 通知', 'sich freuen auf\tto look forward to', 'Gift poison', 'lebe seit'];
    const text = Array.from({ length: 300 }, (_, k) => words[k % words.length]).join('\n');
    const fresh = createDictionary({ base: './', fetchImpl: fileFetch });
    await fresh.ready();
    const t0 = performance.now();
    const r = await importPreview(text, fresh);
    const ms = performance.now() - t0;
    expect(r.entries.length).toBeGreaterThan(100);
    expect(ms).toBeLessThanOrEqual(2000);
  });
  // 解析器本身的壓力測（分片先載好）：冷啟動含載分片的「貼上到預覽」由 WebKit E2E 的 TK 效能量。
  // P6.8：全套 Vitest 平行跑時 CPU 被其他測試檔搶，單跑 0.8–1.1 秒、平行時偶爾 2.4–2.8 秒 → 允許重試 2 次
  it('TK 300 行全部不重複、全是查不到的字（每行都要跑拼字建議）≤ 2 秒', { retry: 2 }, async () => {
    const letters = (k) => String.fromCharCode(97 + (k % 26)) + String.fromCharCode(97 + (Math.floor(k / 26) % 26));
    const bases = ['Wohnnug', 'Rechnnug', 'Kündigunsfrist', 'Blarkenschaft', 'feiren', 'Termni', 'Artz', 'Stadtt'];
    const text = Array.from({ length: 300 }, (_, k) => `${bases[k % bases.length]}${letters(k)} - 筆記`).join('\n');
    await dict.ensure(text.split(/\s+/));
    const t0 = performance.now();
    const r = await importPreview(text, dict);
    const ms = performance.now() - t0;
    expect(r.entries).toHaveLength(300);
    expect(ms).toBeLessThanOrEqual(2000);
  });
});
