// 變化形表分片：35 MB 的 forms.json 在 iPhone 上一次 parse 太慢（T6），
// 執行期改讀 data/runtime/ 下的分片，依「小寫字形」雜湊分配（P2.5 起 64 片）。
// 同一個字的原樣／首字大寫／小寫三種查法都落在同一片，點一個字最多讀一片。
// 建置（build/build-data.mjs）與瀏覽器共用這支，雜湊一改兩邊一起改。
export const SHARD_COUNT = 64; // P2.5：40,000 原形，32 片單片會超過 1 MB；64 片讓點字仍只讀一片小檔（T6）

export function shardOf(form) {
  const s = String(form).toLowerCase();
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h * 33) ^ s.charCodeAt(k)) >>> 0;
  return h % SHARD_COUNT;
}

export function shardName(n) {
  return `f-${String(n).padStart(2, '0')}.json`;
}

// P2.6（§6.1）：標籤表的指紋。每一片帶著建置時的指紋（鍵 '#tagsets'），載入時跟手上的標籤表比對；
// 對不上＝快取混到兩個版本，標籤編號會指到別的詞性（freuen 顯示成形容詞比較級）
export const FINGERPRINT_KEY = '#tagsets';
export function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
