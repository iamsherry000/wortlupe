// SPEC §8 部署範圍（P2.1）：只寫設定、不部署。這支測試模擬 wrangler 會上傳哪些檔：
// 資產目錄 = wrangler.json 的 assets.directory，排除 .assetsignore 列的項目（gitignore 語法的子集）。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MiB = 1024 * 1024;

function loadConfig() {
  return JSON.parse(readFileSync(join(ROOT, 'wrangler.json'), 'utf8'));
}
// .assetsignore：支援「目錄/」「*.副檔名」「確切路徑」三種寫法（我們只用這三種）
function ignoreMatcher(dir) {
  const pats = readFileSync(join(dir, '.assetsignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  return (rel) => pats.some((p) => {
    if (p.endsWith('/')) return rel === p.slice(0, -1) || rel.startsWith(p) || rel.split('/').includes(p.slice(0, -1));
    if (p.startsWith('*.')) return rel.endsWith(p.slice(1));
    return rel === p;
  });
}
function deployFiles() {
  const dir = join(ROOT, loadConfig().assets.directory);
  const ignored = ignoreMatcher(dir);
  const out = [];
  const walk = (d, rel) => {
    for (const name of readdirSync(d)) {
      const r = rel ? `${rel}/${name}` : name;
      if (ignored(r) || ignored(`${r}/`)) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full, r);
      else out.push({ path: r, size: statSync(full).size });
    }
  };
  walk(dir, '');
  return out;
}

describe('SPEC §8 部署範圍', () => {
  it('部署 wrangler.json 存在，有 name、compatibility_date、assets.directory', () => {
    const c = loadConfig();
    expect(c.name).toBe('wortlupe');
    expect(c.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof c.assets.directory).toBe('string');
    expect(existsSync(join(ROOT, c.assets.directory, '.assetsignore'))).toBe(true);
  });

  it('部署 每個要上傳的檔都小於 25 MiB（Cloudflare 單檔上限）', () => {
    const big = deployFiles().filter((f) => f.size >= 25 * MiB).map((f) => `${f.path} ${(f.size / MiB).toFixed(1)} MiB`);
    expect(big).toEqual([]);
  });

  it('部署 不含 forms.json、build、tests、docs、node_modules、PHASE_LOG', () => {
    const paths = deployFiles().map((f) => f.path);
    for (const bad of ['data/forms.json', 'PHASE_LOG.md']) expect(paths).not.toContain(bad);
    for (const dir of ['build/', 'tests/', 'docs/', 'node_modules/', 'test-results/', 'playwright-report/']) {
      expect(paths.filter((p) => p.startsWith(dir)), dir).toEqual([]);
    }
  });

  it('部署 只含上線產物（白名單），而且 sw.js 快取清單的每個檔都在', () => {
    const paths = deployFiles().map((f) => f.path);
    const allowed = /^(index\.html|setting(-en)?\.html|sw\.js|mt\/[\w.-]+|manifest\.webmanifest|icons\/[\w.-]+|src\/.+\.(js|css)|data\/(lexicon|colloquial|prepositions|gloss-overrides|closed-class|lowercase-nouns|usage)\.json|data\/runtime\/[\w.-]+\.json)$/;
    expect(paths.filter((p) => !allowed.test(p)), '白名單以外的檔會被上傳').toEqual([]);
    const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
    const listed = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
    const shardCount = Number(sw.match(/const SHARD_COUNT = (\d+)/)[1]);
    const shards = Array.from({ length: shardCount }, (_, n) => `data/runtime/f-${String(n).padStart(2, '0')}.json`);
    for (const f of [...listed, ...shards, 'sw.js']) expect(paths, `缺 ${f}`).toContain(f);
  });
});
