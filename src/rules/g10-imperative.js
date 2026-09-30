// G10 命令式（只講 du 命令式，P2.1 起 ihr 命令式不講，理由見 detect 內註解）：句首是命令式、不是問句、後面沒有主詞代名詞。
// Danke! / Bitte! 這種客套話不算。
import { q, SUBJECT_PRONOUNS, DER_WORDS, EIN_WORDS, ELIDED_SUBJECT_SIGNALS } from '../grammar/german.js';
import { finiteCands, isNoun, hasMatchingSubject } from '../grammar/sentence.js';

const FORMULAS = new Set(['danke', 'bitte']);

export default {
  id: 'G10',
  level: 'sentence',
  title: 'Imperative',
  detect(S) {
    const clause = S.clauses[0];
    if (S.endPunct === '?' || !clause || clause.body.length < 2) return [];
    // P2.3（判定 2）：句首感嘆詞不算（ok mach das!）
    const first = clause.body[0], second = clause.body[1];
    if (FORMULAS.has(first.lower) || SUBJECT_PRONOUNS.has(second.lower)) return [];
    // 冠詞／所有格開頭（Mein Bruder … 的 mein 也是 meinen 的命令式）、或第二個字就是名詞 → 不判斷
    if (DER_WORDS.test(first.lower) || EIN_WORDS.test(first.lower) || (isNoun(second) && /^\p{Lu}/u.test(second.text))) return [];
    // P2.1（B2 根因）：原本只要句首有「命令式」tag 就判定。但 ihr 命令式（geht, stimmt, passt, klingt）
    // 跟第三人稱單數直述句同形，而口語常省略主詞 es／das（Geht klar! = Das geht klar）→ 分不出來，一律不講 ihr 命令式。
    // du 命令式也要求這個字沒有任何非動詞讀法（Schade 是形容詞、Liebe／Viele 是形容詞或名詞）。
    if (first.cands.some((c) => c.pos !== 'verb')) return [];
    const all = finiteCands(first, { imperative: true });
    const imp = all.filter((c) => c.tags.includes('imperative') && c.tags.includes('singular'));
    if (!imp.length) return [];
    // Tut mir leid：tut 是罕用動詞 tuten 的命令式，但也是常用動詞 tun 的第三人稱。
    // 命令式讀法必須來自最常用的那個動詞，而且這個字不能同時是一般（非口語）的直述句形
    const rank = (c) => (c.entry && c.entry.rank) || Infinity;
    const best = Math.min(...all.map(rank));
    if (!imp.some((c) => rank(c) === best)) return [];
    if (all.some((c) => !c.tags.includes('imperative') && !c.tags.includes('colloquial'))) return [];
    // P2.3（Charles 判定 1）：WhatsApp 常省略主詞 ich（hab …、freu mich …、geh jetzt schlafen），
    // 而規則動詞的 du 命令式跟口語的 ich 形同形（mach = ich mach）。所以只講「真正的命令式」：
    //   - 子句裡沒有跟動詞對得上的主詞，也沒有 mich／mir（省略 ich 的強烈訊號：freu mich = ich freue mich）；
    //     e→i 變音的命令式（gib、nimm、lies）不可能是口語的 ich 形（ich gebe），所以 Gib mir das Salz 的 mir 不算訊號；
    //   - 而且句尾有 !、句中有 bitte，或是 e→i 變音的命令式。
    //   dich 不擋：Freu dich! / Beeil dich bitte. 照常講（Charles 收窄判定 1）
    if (hasMatchingSubject(S, clause, first)) return [];
    const stemChanged = imp.some((c) => !c.lemma.toLowerCase().startsWith(first.lower));
    if (!stemChanged && clause.body.some((w) => ELIDED_SUBJECT_SIGNALS.has(w.lower))) return [];
    const bitte = S.words.some((w) => w.lower === 'bitte');
    if (S.endPunct !== '!' && !bitte && !stemChanged) return [];
    const who = 'du';
    return [{
      what: `${q(first.text)} is an imperative (${who} form): the verb comes first and there is no “${who}”.`,
      why: 'The imperative gives an instruction or a request. For du, use the verb stem without du (komm!, mach!); verbs that change e → i keep that change (geben → gib!). bitte makes it polite.',
      pattern: 'Verb (+ bitte) + …!',
      marks: [{ index: first.index, kind: 'v2' }],
      data: { verbIndex: first.index, person: who },
    }];
  },
  examples: {
    positive: [{ text: 'Komm bitte her!' }, { text: 'Gib mir das Salz.' }],
    negative: [
      { text: 'Kommst du?' }, { text: 'Danke schön!' }, { text: 'Mein Bruder wohnt hier.' },
      { text: 'Geht klar!' }, { text: 'Klingt gut!' }, { text: 'Schade, dass du nicht kommst.' }, { text: 'Tut mir leid.' },
    ],
  },
};
