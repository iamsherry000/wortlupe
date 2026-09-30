// P2.6（SPEC §6.1）：把標籤表的指紋蓋進每一片字形檔（鍵 '#tagsets'），並寫進 sw.js 的 DATA_BUILD。
// 手機快取混到兩次建置時，dict.js 比對指紋就會發現，不會拿錯的標籤表解讀（freuen 顯示成形容詞比較級）。
// build-data.mjs 最後會呼叫；單獨執行：node build/stamp-runtime.mjs（不用重建整份字典）
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHARD_COUNT, shardName, fingerprint, FINGERPRINT_KEY } from '../src/shard.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function stampRuntime(root = ROOT) {
  const runtime = join(root, 'data', 'runtime');
  const print = fingerprint(readFileSync(join(runtime, 'tagsets.json'), 'utf8'));
  for (let n = 0; n < SHARD_COUNT; n++) {
    const file = join(runtime, shardName(n));
    const data = JSON.parse(readFileSync(file, 'utf8'));
    delete data[FINGERPRINT_KEY];
    writeFileSync(file, JSON.stringify({ [FINGERPRINT_KEY]: print, ...data }));
  }
  const swFile = join(root, 'sw.js');
  const sw = readFileSync(swFile, 'utf8');
  const next = sw.replace(/^const DATA_BUILD = '[^']*';/m, `const DATA_BUILD = '${print}';`);
  if (next === sw && !sw.includes(`const DATA_BUILD = '${print}';`)) throw new Error('sw.js: DATA_BUILD line not found');
  writeFileSync(swFile, next);
  return print;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`stamped ${SHARD_COUNT} shards + sw.js with tagsets fingerprint ${stampRuntime()}`);
}
