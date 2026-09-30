// P2.6（SPEC §4.5、§6.1）：字卡只講「這句裡」的形＋用法句型；字典分片與標籤表的版本一致。
// 起因：Sherry 9/27 點 freuen 看到五組形容詞比較級標籤（手機快取混版），而且就算正確，列出所有可能的形也沒意義。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/tokenize.js';
import { createDictionary, StaleDictionaryError } from '../src/dict.js';
import { buildCard } from '../src/card-model.js';
import { SHARD_COUNT, shardName, shardOf, fingerprint, FINGERPRINT_KEY } from '../src/shard.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (url) => readFileSync(join(ROOT, url.replace(/^\.?\//, '')), 'utf8');
const fileFetch = async (url) => {
  const body = read(url);
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};

let dict;
beforeAll(async () => {
  dict = createDictionary({ base: './', fetchImpl: fileFetch });
  await dict.ready();
});

async function card(text, word, nth = 0) {
  const tokens = tokenize(text);
  await dict.ensure(tokens.filter((t) => t.type === 'word').map((t) => t.text));
  const tok = tokens.filter((t) => t.type === 'word' && t.text === word)[nth];
  return buildCard(tokens, tok.index, dict);
}
const main = (c, lemma) => c.readings.find((r) => !r.other && (!lemma || r.lemma === lemma));

describe('P2.6 A 這句裡的形', () => {
  it('Wir freuen uns auf …：只講 wir 的現在式，其他收起來；沒有任何形容詞標籤', async () => {
    const r = main(await card('Wir freuen uns auf das Wochenende.', 'freuen'), 'freuen');
    expect(r.pos).toBe('verb');
    expect(r.contextForm).toEqual(['present tense · 1st person · plural (wir)']);
    expect(r.otherForms).toContain('infinitive');
    expect([...r.formDescriptions, ...r.otherForms].join(' | ')).not.toMatch(/comparative|declension/);
  });
  it('Ich freue mich …：ich 形', async () => {
    const r = main(await card('Ich freue mich über das Geschenk.', 'freue'), 'freuen');
    expect(r.contextForm).toEqual(['present tense · 1st person · singular (ich)']);
  });
  it('從句的句尾動詞：…, weil sie sich freut → er/sie/es', async () => {
    const r = main(await card('Sie lacht, weil sie sich freut.', 'freut'), 'freuen');
    expect(r.contextForm).toEqual(['present tense · 3rd person · singular (er/sie/es)']);
  });
  it('情態動詞後的原形（G04）→ infinitive', async () => {
    const r = main(await card('Ich kann morgen kommen.', 'kommen'), 'kommen');
    expect(r.contextForm).toEqual(['infinitive']);
  });
  it('完成式的過去分詞（G05）→ past participle', async () => {
    const r = main(await card('Ich habe das Buch gelesen.', 'gelesen'), 'lesen');
    expect(r.contextForm[0]).toMatch(/^past participle/);
  });
  it('形容詞詞尾（G16）：ein großer Mann → 陽性主格混合變化', async () => {
    const r = main(await card('Da kommt ein großer Mann.', 'großer'), 'groß');
    expect(r.contextForm.join(' | ')).toMatch(/masculine · nominative · singular · mixed declension/);
    expect(r.contextForm.join(' | ')).not.toMatch(/strong|weak/);
  });
  it('名詞複數第三格（G19）：mit den Kindern → dative plural', async () => {
    const r = main(await card('Ich spiele mit den Kindern.', 'Kindern'), 'Kind');
    expect(r.contextForm).toEqual(['dative · plural']);
  });
  it('證據不夠就不挑：省略主詞的 Freuen uns sehr → 沒有 contextForm', async () => {
    const r = main(await card('Freuen uns sehr.', 'Freuen'), 'freuen');
    expect(r.contextForm).toBeUndefined();
  });
});

describe('P2.6 B 用法句型', () => {
  it('sich freuen auf：對得上這句的排第一並標記', async () => {
    const r = main(await card('Wir freuen uns auf das Wochenende.', 'freuen'), 'freuen');
    expect(r.usage[0]).toMatchObject({ pattern: 'sich freuen auf + accusative', match: true });
    expect(r.usage[0].gloss).toMatch(/look forward/);
    expect(r.usage[0].example[0]).toMatch(/freuen uns auf/);
    expect(r.usage.filter((u) => u.match)).toHaveLength(1);
  });
  it('darauf 算 auf、über 對 über', async () => {
    expect(main(await card('Er freut sich darauf.', 'freut'), 'freuen').usage[0].pattern).toBe('sich freuen auf + accusative');
    expect(main(await card('Ich freue mich über das Geschenk.', 'freue'), 'freuen').usage[0].pattern).toBe('sich freuen über + accusative');
  });
  it('沒有介系詞就不標任何一條，照 Wiktionary 順序', async () => {
    const u = main(await card('Ich freue mich.', 'freue'), 'freuen').usage;
    expect(u.some((x) => x.match)).toBe(false);
    expect(u[0].pattern).toBe('sich freuen über + accusative');
  });
  it('形容詞也有：stolz auf', async () => {
    const r = main(await card('Ich bin stolz auf dich.', 'stolz'), 'stolz');
    expect(r.usage[0]).toMatchObject({ match: true });
    expect(r.usage[0].pattern).toMatch(/^stolz auf \+ accusative/);
  });
  it('資料沒有的字不給用法（零編造）', async () => {
    const r = main(await card('Das Haus ist alt.', 'Haus'), 'Haus');
    expect(r.usage).toBeUndefined();
  });
});

// Sherry 9/27：「沒被 Wiktionary 標記的字要自己寫好」→ build/usage-manual.json
describe('P2.6 B 手寫補充', () => {
  it('Wiktionary 沒有的：Angst vor + dative（名詞）', async () => {
    const r = main(await card('Ich habe Angst vor der Prüfung.', 'Angst'), 'Angst');
    expect(r.usage[0]).toMatchObject({ pattern: 'Angst vor + dative', match: true });
  });
  it('Wiktionary 有句型沒例句的：warten auf 補上手寫例句', async () => {
    const r = main(await card('Wir warten auf dich.', 'warten'), 'warten');
    expect(r.usage[0]).toMatchObject({ pattern: 'warten auf + accusative', match: true });
    expect(r.usage[0].example[0]).toBe('Ich warte auf den Bus.');
  });
  it('反身＋介系詞：sich kümmern um', async () => {
    const r = main(await card('Wer kümmert sich um die Katze?', 'kümmert'), 'kümmern');
    expect(r.usage[0].match).toBe(true);
    expect(r.usage[0].pattern).toMatch(/^sich kümmern um \+ accusative/);
  });
  it('縮寫也算介系詞：vom = von dem；可分離動詞用重組後的原形（hängt … ab → abhängen）', async () => {
    const r = main(await card('Das hängt vom Wetter ab.', 'hängt'), 'hängen');
    expect(r.usage[0].match).toBe(true);
    expect(r.usage[0].pattern).toMatch(/^abhängen von \+ dative/);
  });
  it('es geht um：要有 es；ich gehe um acht 不算', async () => {
    const hit = main(await card('Worum geht es in dem Film?', 'geht'), 'gehen').usage.find((u) => u.match);
    expect(hit && hit.pattern).toBe('es geht um + accusative');
    const u = main(await card('Ich gehe um acht Uhr nach Hause.', 'gehe'), 'gehen').usage;
    expect(u.some((x) => x.match)).toBe(false);
  });
  it('Wiktionary 把名詞 Weg 解析成介系詞的那條不能讓 ich gehe weg 對上', async () => {
    const u = main(await card('Ich gehe jetzt weg.', 'gehe'), 'gehen').usage || [];
    expect(u.some((x) => x.match)).toBe(false);
  });
  it('慣用語（P2.7：翻譯模型翻不好的）：Kein Ding → kein Ding = no problem；Na, alles klar?', async () => {
    const ding = main(await card('Kein Ding, passt schon!', 'Ding'), 'Ding').usage.find((u) => u.match);
    expect(ding && ding.pattern).toBe('kein Ding');
    const klar = main(await card('Na, alles klar bei dir?', 'klar'), 'klar').usage.find((u) => u.match);
    expect(klar && klar.pattern).toBe('alles klar');
    const plain = main(await card('Das ist klar.', 'klar'), 'klar').usage || [];
    expect(plain.some((u) => u.match)).toBe(false);
  });
  it('手寫表的每個原形＋詞性都在字典裡、每條都有例句', () => {
    const manual = JSON.parse(read('build/usage-manual.json')).entries;
    const lexicon = JSON.parse(read('data/lexicon.json'));
    for (const [key, list] of Object.entries(manual)) {
      const [lemma, pos] = key.split('|');
      expect((lexicon[lemma] || []).some((e) => e.pos === pos), key).toBe(true);
      for (const u of list) expect(u.ex && u.ex.length === 2, `${key} ${u.gloss}`).toBe(true);
    }
  });
});

describe('P2.6 §6.1 字典版本一致', () => {
  const print = fingerprint(read('data/runtime/tagsets.json'));
  it('每一片都蓋了目前標籤表的指紋', () => {
    for (let n = 0; n < SHARD_COUNT; n++) {
      expect(JSON.parse(read(`data/runtime/${shardName(n)}`))[FINGERPRINT_KEY], shardName(n)).toBe(print);
    }
  });
  it('sw.js 的快取版本帶著同一個指紋（資料重建就自動換版）', () => {
    expect(read('sw.js')).toContain(`const DATA_BUILD = '${print}';`);
  });
  it('分片跟標籤表不是同一次建置 → StaleDictionaryError，不用錯的標籤表解讀', async () => {
    const stale = async (url) => {
      let body = read(url);
      if (url.includes('/runtime/f-')) body = body.replace(`"${FINGERPRINT_KEY}":"${print}"`, `"${FINGERPRINT_KEY}":"00000000"`);
      return { ok: true, status: 200, text: async () => body };
    };
    const d = createDictionary({ base: './', fetchImpl: stale });
    await d.ready();
    await expect(d.ensure(['freuen'])).rejects.toBeInstanceOf(StaleDictionaryError);
    expect(d.error).toBeInstanceOf(StaleDictionaryError);
    expect(d.isReadyFor('freuen')).toBe(false);
    expect(shardOf('freuen')).toBeGreaterThanOrEqual(0);
  });
});
