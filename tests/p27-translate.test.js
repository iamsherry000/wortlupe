// P2.7（SPEC §4.6）：整句翻譯的口語還原（送進模型之前）＋模型檔的完整性。
// 翻譯本身要瀏覽器（wasm＋worker），在 tests/e2e/translate.spec.js 驗。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/tokenize.js';
import { createDictionary } from '../src/dict.js';
import { mtText } from '../src/mt-normalize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p.replace(/^\.?\//, '')), 'utf8');
const fileFetch = async (url) => { const b = read(url); return { ok: true, status: 200, text: async () => b }; };

let dict;
beforeAll(async () => {
  dict = createDictionary({ base: './', fetchImpl: fileFetch });
  await dict.ready();
});
async function mt(text, s = 0) {
  const tokens = tokenize(text);
  await dict.ensure(tokens.filter((t) => t.type === 'word').map((t) => t.text));
  return mtText(tokens, s, dict);
}

describe('P2.7 口語還原（只還原拼寫）', () => {
  it('Freu mich drauf! → Freue mich darauf!（spike：原句會被翻成 Fee looking forward to it）', async () => {
    expect(await mt('Freu mich drauf!')).toEqual({ source: 'Freu mich drauf!', text: 'Freue mich darauf!', changed: true });
  });
  it('meld mich、grad、hab、nix', async () => {
    expect((await mt('Bin grad total im Stress, meld mich später')).text).toBe('Bin gerade total im Stress, melde mich später');
    expect((await mt('hab nix vor 😅')).text).toBe('habe nichts vor 😅');
  });
  it('真的命令式不動：Meld dich!', async () => {
    expect((await mt('Meld dich!')).changed).toBe(false);
  });
  it('有歧義的口語不動：ne（nein／eine）', async () => {
    expect((await mt('Hast du ne Idee?')).text).toBe('Hast du ne Idee?');
  });
  it('慣用語不改意思：Bock auf 照原樣送', async () => {
    expect((await mt('Hast du Bock auf Kino?')).changed).toBe(false);
  });
  it('只取這一句（第二句），句尾標點與 emoji 帶著', async () => {
    const r = await mt('Wir freuen uns. Kein Ding, passt schon 👍\nBis morgen!', 1);
    expect(r.source).toBe('Kein Ding, passt schon 👍');
  });
});

describe('P2.7 模型檔（build/fetch-mt.mjs）', () => {
  const manifestPath = join(ROOT, 'mt', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const have = Object.values(manifest.files).every((f) => f.parts.every((p) => existsSync(join(ROOT, 'mt', p))));
  it('manifest 有模型、詞表、字典、引擎，授權是 MPL-2.0', () => {
    expect(Object.keys(manifest.files).sort()).toEqual(['glue', 'lex', 'model', 'vocab', 'wasm']);
    expect(manifest.license).toBe('MPL-2.0');
    expect(read('mt/LICENSE-MPL-2.0.txt')).toMatch(/^Mozilla Public License Version 2\.0/);
  });
  it.skipIf(!have)('每一片 < 25 MiB（Cloudflare 單檔上限），接回來 sha256 對得上', () => {
    for (const f of Object.values(manifest.files)) {
      const bufs = f.parts.map((p) => {
        expect(statSync(join(ROOT, 'mt', p)).size, p).toBeLessThan(25 * 1024 * 1024);
        return readFileSync(join(ROOT, 'mt', p));
      });
      const all = Buffer.concat(bufs);
      expect(all.length).toBe(f.bytes);
      expect(createHash('sha256').update(all).digest('hex')).toBe(f.sha256);
    }
  });
});
