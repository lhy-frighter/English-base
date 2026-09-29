const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/vad-controller.ts";
let s = fs.readFileSync(p, "utf8");

const oldBlock = `        ortConfig: (ort: { env: { wasm: { numThreads: number; simd: boolean } } }) => {
          const isolated = typeof crossOriginIsolated === "boolean" ? crossOriginIsolated : true;
          ort.env.wasm.numThreads = isolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
          ort.env.wasm.simd = true;
        },`;
const newBlock = `        ortConfig: configureOrt,`;
if (!s.includes(oldBlock)) throw new Error("anchor ortConfig block not found");
s = s.replace(oldBlock, newBlock);

const anchor = `async function verifyAssets`;
const helper = `// ortConfig 回调收到的是 onnxruntime-web/wasm 命名空间（其 .d.ts 未声明 env），用 any 访问
function configureOrt(ort: any): void {
  const isolated = typeof crossOriginIsolated === "boolean" ? crossOriginIsolated : true;
  ort.env.wasm.numThreads = isolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  ort.env.wasm.simd = true;
}

async function verifyAssets`;
if (!s.includes(anchor)) throw new Error("anchor verifyAssets not found");
s = s.replace(anchor, helper);

fs.writeFileSync(p, s);
console.log("vad-controller configureOrt patched");
