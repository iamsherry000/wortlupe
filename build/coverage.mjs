// P2.5：TV 涵蓋率（開發用防線）：tests/fixtures/c1-texts/ 的 C1 文本，扣掉人名、地名、數字後，字卡查得到原形的比例。
// 用法：node build/coverage.mjs [資料根目錄，預設專案根目錄]
//   資料根目錄底下要有 data/（lexicon.json、runtime/ …）。拿舊版資料的備份來跑，就是對照組。
// 「查得到」＝字卡 status 是 found（含口語縮寫、封閉詞類）；複合詞拆解是 P3，這裡不加計。
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'tests/fixtures/c1-texts');

export async function coverage(dataRoot = ROOT) {
  const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const { tokenize } = await imp('src/tokenize.js');
  const { createDictionary } = await imp('src/dict.js');
  const { buildCard } = await imp('src/card-model.js');
  const fetchImpl = async (url) => {
    const body = readFileSync(join(dataRoot, url.replace(/^\.?\//, '')), 'utf8');
    return { ok: true, status: 200, text: async () => body };
  };
  const dict = createDictionary({ base: './', fetchImpl });
  await dict.ready();
  const names = new Set(readFileSync(join(FIXTURES, 'proper-names.txt'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')));
  const files = readdirSync(FIXTURES).filter((f) => /^\d.*\.txt$/.test(f)).sort();
  let total = 0, found = 0;
  const missing = new Map();
  const perFile = [];
  for (const f of files) {
    const tokens = tokenize(readFileSync(join(FIXTURES, f), 'utf8'));
    const words = tokens.filter((t) => t.type === 'word' && !names.has(t.text));
    await dict.ensure(words.map((t) => t.text));
    let ft = 0, ff = 0;
    for (const t of words) {
      ft++;
      const ok = buildCard(tokens, t.index, dict).status === 'found';
      if (ok) ff++;
      else missing.set(t.text, (missing.get(t.text) || 0) + 1);
    }
    total += ft; found += ff;
    perFile.push({ file: f, words: ft, found: ff });
  }
  return { total, found, ratio: found / total, missing: [...missing].sort((a, b) => b[1] - a[1]), perFile };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await coverage(process.argv[2] ? resolve(process.argv[2]) : ROOT);
  for (const p of r.perFile) console.log(`${p.file}：${p.found}/${p.words}（${(100 * p.found / p.words).toFixed(1)}%）`);
  console.log(`合計 ${r.found}/${r.total} = ${(100 * r.ratio).toFixed(2)}%`);
  console.log(`查不到（${r.missing.length} 種）：${r.missing.map(([w, n]) => (n > 1 ? `${w}×${n}` : w)).join('、')}`);
}
