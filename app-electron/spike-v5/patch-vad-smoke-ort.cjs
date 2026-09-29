const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/spike-v5/vad-smoke.ts";
let s = fs.readFileSync(p, "utf8");
const oldBlock = `    model: "v5",
    getStream: async () => dest.stream,`;
const newBlock = `    model: "v5",
    ortConfig: (ort: any) => {
      ort.env.wasm.proxy = false;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      ort.env.wasm.wasmPaths = new URL("../vad/ort/", location.href).href;
    },
    getStream: async () => dest.stream,`;
if (!s.includes(oldBlock)) throw new Error("anchor not found");
fs.writeFileSync(p, s.replace(oldBlock, newBlock));
console.log("smoke ortConfig patched");
