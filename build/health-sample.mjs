// 從資料健檢的剔除清單用固定種子抽 20 筆，輸出 build/health-sample.json 供人工確認（verdict 由 RD 逐筆看過後填）。
// 用法：node build/health-sample.mjs   （會保留已經填好的 verdict／note）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = dirname(fileURLToPath(import.meta.url));
const report = JSON.parse(readFileSync(join(BUILD, 'build-report.json'), 'utf8'));
// 同一個（字形, 原形）只算一筆
const uniq = [...new Map(report.healthCheck.rejected.map((r) => [`${r.form}→${r.lemma}`, r])).values()];
let seed = 20260927;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pool = [...uniq];
const picked = [];
while (picked.length < 20 && pool.length) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
const outPath = join(BUILD, 'health-sample.json');
const old = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')).items : [];
const items = picked.map((r) => {
  const prev = old.find((o) => o.form === r.form && o.lemma === r.lemma);
  return { form: r.form, lemma: r.lemma, pos: r.pos, tags: r.tags, verdict: prev ? prev.verdict : 'unchecked', note: prev ? prev.note : '' };
});
writeFileSync(outPath, JSON.stringify({ seed: 20260927, uniqueRejected: uniq.length, items }, null, 1));
console.log(items.map((x) => `${x.form} → ${x.lemma} (${x.pos}) [${x.tags}]`).join('\n'));
