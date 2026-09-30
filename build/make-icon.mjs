// 產生 iPhone 主畫面圖示 icons/apple-touch-icon.png（180×180）。開發時跑一次，產物進版控。
// iOS 會自己把圖示切圓角，所以 PNG 要滿版正方形（SVG 的圓角拿掉），不能有透明角。
// 用法：node build/make-icon.mjs
import { webkit } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(ROOT, 'icons/icon.svg'), 'utf8').replace(/rx="\d+"/, 'rx="0"');
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', '<svg width="180" height="180" ')}</body></html>`);
await page.screenshot({ path: join(ROOT, 'icons/apple-touch-icon.png'), clip: { x: 0, y: 0, width: 180, height: 180 } });
await browser.close();
console.log('icons/apple-touch-icon.png 180×180');
