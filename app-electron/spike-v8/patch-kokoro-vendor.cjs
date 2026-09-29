// 给 vendor 的 kokoro.web.js env 导出补 numThreads/wasmBinary 读写器（上游只暴露 wasmPaths）。
// 幂等：已打过补丁则跳过。
const fs = require("fs");
const p = __dirname + "/vendor-kokoro/k/dist/kokoro.web.js";
let s = fs.readFileSync(p, "utf8");
const anchor = "set wasmPaths(e){Wg.backends.onnx.wasm.wasmPaths=e},get wasmPaths(){return Wg.backends.onnx.wasm.wasmPaths}";
const patched = anchor +
  ",set numThreads(e){Wg.backends.onnx.wasm.numThreads=e},get numThreads(){return Wg.backends.onnx.wasm.numThreads}" +
  ",set wasmBinary(e){Wg.backends.onnx.wasm.wasmBinary=e},get wasmBinary(){return Wg.backends.onnx.wasm.wasmBinary}" +
  ",set wasmLogLevel(e){Wg.backends.onnx.wasm.logSeverityLevel=e},get wasmLogLevel(){return Wg.backends.onnx.wasm.logSeverityLevel}";
if (s.includes("set wasmLogLevel(e)")) {
  console.log("already patched");
} else if (s.includes("set numThreads(e){Wg.backends.onnx.wasm.numThreads=e}")) {
  const a2 = "set wasmBinary(e){Wg.backends.onnx.wasm.wasmBinary=e},get wasmBinary(){return Wg.backends.onnx.wasm.wasmBinary}";
  s = s.replace(a2, a2 + ",set wasmLogLevel(e){Wg.backends.onnx.wasm.logSeverityLevel=e},get wasmLogLevel(){return Wg.backends.onnx.wasm.logSeverityLevel}");
  fs.writeFileSync(p, s);
  console.log("patch2 ok", s.length);
} else if (!s.includes(anchor)) {
  console.error("anchor not found");
  process.exit(1);
} else {
  s = s.replace(anchor, patched);
  fs.writeFileSync(p, s);
  console.log("patched ok", s.length);
}
