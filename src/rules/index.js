// 規則目錄（登記處）。新增一條規則：在這個資料夾放 gNN-名稱.js（id、level、title、detect、examples），
// 在下面登記一行、在 sw.js 的快取清單加一行，再寫它的測試。引擎本體（src/grammar/engine.js）不用動。
// 順序＝Grammar 面板與 Why this form 的顯示順序。
import g01 from './g01-v2.js';
import g02 from './g02-subordinate-verb-end.js';
import g03 from './g03-relative-clause.js';
import g04 from './g04-modal-infinitive.js';
import g05 from './g05-perfect.js';
import g06 from './g06-separable.js';
import g07 from './g07-preposition-case.js';
import g08 from './g08-contraction.js';
import g09 from './g09-yes-no-question.js';
import g10 from './g10-imperative.js';
import g11 from './g11-negation.js';
import g12 from './g12-konjunktiv2.js';
import g13 from './g13-passive.js';
import g14 from './g14-zu-infinitive.js';
import g15 from './g15-article-case.js';
import g16 from './g16-adjective-ending.js';
import g17 from './g17-noun-suffix-gender.js';
import g18 from './g18-verb-ending.js';
import g19 from './g19-dative-plural-n.js';
import g20 from './g20-genitive-s.js';

export const RULES = [g01, g02, g03, g04, g05, g06, g07, g08, g09, g10, g11, g12, g13, g14, g15, g16, g17, g18, g19, g20];
