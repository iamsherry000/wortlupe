// 規則引擎本體：把句子模型交給每條規則，收集命中結果。
// 新增規則不用改這個檔：在 src/rules/ 放一個模組、在 src/rules/index.js 登記一行（加上它的測試）。
import { RULES } from '../rules/index.js';
import { buildSentence } from './sentence.js';

export { RULES };

function run(rule, args) {
  try {
    return (rule.detect(...args) || []).map((m) => ({ id: rule.id, title: rule.title, ...m }));
  } catch (e) {
    // 單一規則出錯只丟掉那條規則的結果，不讓整頁壞掉（T8）
    if (typeof console !== 'undefined') console.error(`[wortlupe] rule ${rule.id} failed`, e);
    return [];
  }
}

// 句型規則（G01–G14）：一句話命中哪些
export function analyzeSentence(tokens, sentence, dict) {
  const S = buildSentence(tokens, sentence, dict);
  if (!S.words.length) return [];
  return RULES.filter((r) => r.level === 'sentence').flatMap((r) => run(r, [S]));
}

// 字形規則（G15–G20）：這個字為什麼長這樣
export function analyzeWord(tokens, index, dict) {
  const tok = tokens[index];
  if (!tok || tok.type !== 'word') return [];
  const S = buildSentence(tokens, tok.sentence, dict);
  const w = S.words.find((x) => x.index === index);
  if (!w) return [];
  return RULES.filter((r) => r.level === 'word').flatMap((r) => run(r, [S, w]));
}
