// P2.7（SPEC §4.6）：離線整句翻譯的模型與引擎 → mt/
// 來源：Firefox Translations de→en（Mozilla／Bergamot，MPL-2.0），Hugging Face 逐位元組鏡像，鎖定版本＋sha256。
// 模型 31.6 MB 超過 Cloudflare 單檔 25 MiB → 切兩片，瀏覽器端接回（src/translate.js）。
// 大檔不進 git（.gitignore），部署前跑一次：node build/fetch-mt.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'mt');
const CACHE = join(ROOT, 'build', 'raw', 'mt');
const REPO = 'https://huggingface.co/midudev/firefox-translations/resolve';
const REV = '6f6acd72c26975a06a8e61b72d1fbacbd184c23f';
const PART_MAX = 20 * 1024 * 1024; // 遠低於 25 MiB

const SOURCES = [
  { src: 'de-en/model.deen.intgemm.alphas.bin', role: 'model', sha256: '3e6f7c2c2425d10824797270b382bee718ff34af2cab9308841c82ca46dc6f20' },
  { src: 'de-en/lex.50.50.deen.s2t.bin', role: 'lex', sha256: '113b98460468360cca68c042e1cddf49c4e1931cbb975ed04349c9a3bd607010' },
  { src: 'de-en/vocab.deen.spm', role: 'vocab', sha256: '69f730becafa48e3bb2c244eab66456877c08959a02f2bd5519b5a3088b62f9c' },
  { src: 'runtime/bergamot-translator-worker.wasm', role: 'wasm', sha256: '735d4d95ede043c48f146b9a89336077f18885ad30b7e9a6a86c51a73ca02e7b' },
  { src: 'runtime/bergamot-translator-worker.js', role: 'glue', sha256: 'bc2fc98d859845162817f9526c39eb1ca4805f7149dfebc0fbcda4d2af68e13c' },
  { src: 'LICENSE', role: 'license', sha256: '3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04' },
];
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function get(s) {
  const local = join(CACHE, s.src.replace(/\//g, '_'));
  if (existsSync(local) && sha(readFileSync(local)) === s.sha256) return readFileSync(local);
  const res = await fetch(`${REPO}/${REV}/${s.src}`);
  if (!res.ok) throw new Error(`${s.src}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== s.sha256) throw new Error(`${s.src}: sha256 mismatch`);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(local, buf);
  return buf;
}

mkdirSync(OUT, { recursive: true });
const manifest = { version: `deen-${REV.slice(0, 7)}`, source: `${REPO.replace('/resolve', '')} @ ${REV}`, license: 'MPL-2.0', files: {} };
let total = 0;
for (const s of SOURCES) {
  const buf = await get(s);
  if (s.role === 'license') { writeFileSync(join(OUT, 'LICENSE-MPL-2.0.txt'), buf); continue; }
  const base = s.src.split('/').pop();
  const parts = [];
  for (let off = 0, k = 0; off < buf.length; off += PART_MAX, k++) {
    const name = buf.length > PART_MAX ? `${base}.part${k}` : base;
    writeFileSync(join(OUT, name), buf.subarray(off, off + PART_MAX));
    parts.push(name);
  }
  manifest.files[s.role] = { parts, bytes: buf.length, sha256: s.sha256 };
  total += buf.length;
}
manifest.totalBytes = total;
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`mt/：${Object.keys(manifest.files).length} 個檔（${(total / 1048576).toFixed(1)} MB），模型切成 ${manifest.files.model.parts.length} 片，版本 ${manifest.version}`);
