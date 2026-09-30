// P2.5：詞頻表（hermitdave FrequencyWords 2018 德文，CC BY-SA 4.0）。
// 改用完整版 de_full.txt（115 萬字形，SPEC §3：50k 版換算成原形不夠到 C1）；前 50,000 名跟 de_50k.txt 完全相同，
// 所以原本的名次（排序、門檻）不受影響，只是 50,000 名以後的字也有名次了。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW = join(dirname(fileURLToPath(import.meta.url)), 'raw');
export const FREQ_FILE = existsSync(join(RAW, 'de_full.txt')) ? 'de_full.txt' : 'de_50k.txt';
export function loadFreqWords() {
  return readFileSync(join(RAW, FREQ_FILE), 'utf8').split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
}
