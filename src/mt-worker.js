// P2.7（SPEC §4.6）：離線整句翻譯的背景執行緒（Bergamot de→en，MPL-2.0，mt/）。
// 模型、引擎都由主執行緒從本機快取讀出來傳進來，這裡不發任何網路請求。
// 訊息：{type:'load', files:{model, lex, vocab, wasm, glue}} → {type:'loaded'}；{type:'translate', id, text} → {type:'done', id, text}
const CONFIG = `beam-size: 1
normalize: 1.0
word-penalty: 0
max-length-break: 128
mini-batch-words: 1024
workspace: 128
max-length-factor: 2.0
skip-cost: true
cpu-threads: 0
quiet: true
quiet-translation: true
gemm-precision: int8shiftAlphaAll
alignment: soft
`;
// 引擎要一組 wasm_gemm 匯入（Firefox 給原生版）；網頁上接 wasm 自己匯出的 *Fallback 版本（spike 踩過）
const GEMM = {
  int8_prepare_a: 'int8PrepareAFallback',
  int8_prepare_b: 'int8PrepareBFallback',
  int8_prepare_b_from_transposed: 'int8PrepareBFromTransposedFallback',
  int8_prepare_b_from_quantized_transposed: 'int8PrepareBFromQuantizedTransposedFallback',
  int8_prepare_bias: 'int8PrepareBiasFallback',
  int8_multiply_and_add_bias: 'int8MultiplyAndAddBiasFallback',
  int8_select_columns_of_b: 'int8SelectColumnsOfBFallback',
};

let service = null, model = null, loading = null;

function start(files) {
  return new Promise((resolve, reject) => {
    self.Module = {
      instantiateWasm(imports, receive) {
        let exp = null;
        imports.wasm_gemm = Object.fromEntries(Object.entries(GEMM).map(([k, f]) => [k, (...a) => exp[f](...a)]));
        WebAssembly.instantiate(files.wasm, imports)
          .then(({ instance, module }) => { exp = instance.exports; receive(instance, module); })
          .catch(reject);
        return {};
      },
      onRuntimeInitialized: () => resolve(self.Module),
      onAbort: (e) => reject(new Error(`translation engine stopped: ${e}`)),
    };
    const url = URL.createObjectURL(new Blob([files.glue], { type: 'text/javascript' }));
    try { importScripts(url); } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
  }).then((M) => {
    const aligned = (buf, align) => {
      const mem = new M.AlignedMemory(buf.byteLength, align);
      mem.getByteArrayView().set(new Uint8Array(buf));
      return mem;
    };
    service = new M.BlockingService({ cacheSize: 0 });
    const vocabs = new M.AlignedMemoryList();
    vocabs.push_back(aligned(files.vocab, 64));
    model = new M.TranslationModel(CONFIG, aligned(files.model, 256), aligned(files.lex, 64), vocabs, null);
  });
}

function translate(text) {
  const M = self.Module;
  const input = new M.VectorString();
  input.push_back(text);
  const opts = new M.VectorResponseOptions();
  opts.push_back({ qualityScores: false, alignment: false, html: false });
  const res = service.translate(model, input, opts);
  const out = res.get(0).getTranslatedText();
  input.delete(); opts.delete(); res.delete();
  return out;
}

self.onmessage = async (e) => {
  const d = e.data;
  try {
    if (d.type === 'load') {
      loading = loading || start(d.files);
      await loading;
      self.postMessage({ type: 'loaded' });
    } else if (d.type === 'translate') {
      await loading;
      self.postMessage({ type: 'done', id: d.id, text: translate(d.text) });
    }
  } catch (err) {
    loading = null;
    self.postMessage({ type: 'error', id: d.id, message: String((err && err.message) || err) });
  }
};
