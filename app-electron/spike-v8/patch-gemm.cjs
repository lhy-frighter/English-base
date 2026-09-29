// Apply upstream patch-artifacts-import-gemm-module.sh equivalent to the npm package's worker glue.
// https://github.com/browsermt/bergamot-translator/blob/main/wasm/patch-artifacts-import-gemm-module.sh
const fs = require("fs");
const path = require("path");

const workerDir = path.join(__dirname, "engine", "package", "worker");
const glue = path.join(workerDir, "bergamot-translator-worker.js");
let js = fs.readFileSync(glue, "utf8");

if (!js.includes("createWasmGemm")) {
  const before = js;
  js = js.replace(/"env"\s*:\s*asmLibraryArg,/g, '"env": asmLibraryArg,\n"wasm_gemm": createWasmGemm(),');
  if (js === before) throw new Error("patch anchor not found (\"env\": asmLibraryArg,)");
  const gemm = fs.readFileSync(path.join(__dirname, "import-gemm-module.js"), "utf8");
  js += "\n" + gemm;
  fs.writeFileSync(glue, js);
  console.log("patched bergamot-translator-worker.js with wasm_gemm fallback");
} else {
  console.log("already patched");
}
