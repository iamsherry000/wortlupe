// 2026-10-01：從 WhatsApp 一次拷貝好幾則訊息時，每行前面會帶「[日期, 時間] 名字:」，閱讀前自動拿掉。
// 只認「行首、有時間的日期戳記＋名字＋冒號」這個形狀；句中的時間、冒號、方括號一律不動。
// 純函式、不碰 DOM，Vitest 直接測。

// 行首可能有 WhatsApp 加的隱形方向字元
const MARKS = '[\\u200e\\u200f\\u202a-\\u202e]*';
const TIME = '\\d{1,2}[:.]\\d{2}(?:[:.]\\d{2})?(?:[\\s\\u202f\\u00a0]?[AaPp]\\.?[Mm]\\.?)?';
const DATE = '\\d{1,4}[./-]\\d{1,2}[./-]\\d{1,4}';
// 名字：1–60 個字、不含冒號與換行
const NAME = '[^:\\n\\[\\]]{1,60}';
// [日期, 時間] 名字:   或   [時間, 日期] 名字:
const BRACKET = `\\[(?:${DATE},?\\s*${TIME}|${TIME},?\\s*${DATE})\\]\\s*${NAME}:[ \\t\\u00a0]?`;
// 匯出格式：日期, 時間 - 名字:
const EXPORT = `${DATE},?\\s*${TIME}\\s*[-–]\\s*${NAME}:[ \\t\\u00a0]?`;
const PREFIX = new RegExp(`^${MARKS}(?:${BRACKET}|${EXPORT})`);

export function stripChatPrefixes(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.replace(PREFIX, ''))
    .join('\n');
}
