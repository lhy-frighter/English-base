import { defineConfig } from "vite";
import path from "node:path";

// S7c 闸门：Kokoro TTS（kokoro.web.js 自带 transformers 3.5.1 + phonemizer，ort wasm 复用 dist/ort，
// 二者均为 onnxruntime-web 1.22.0-dev.20250409 同版本）。输出 dist/__gate-kokoro.js，不动正式产物。
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  resolve: {
    alias: {
      "kokoro-web": path.join(__dirname, "..", "vendor-kokoro", "k", "dist", "kokoro.web.js"),
      phonemizer: path.join(__dirname, "..", "vendor-kokoro", "p", "dist", "phonemizer.js"),
    },
  },
  build: {
    target: "es2022",
    outDir: path.join(__dirname, "..", "..", "dist"),
    emptyOutDir: false,
    rollupOptions: {
      input: path.join(__dirname, "gate-kokoro.html"),
      output: {
        entryFileNames: "__gate-kokoro.js",
        chunkFileNames: "assets/gk-[name].js",
        assetFileNames: "assets/gk-[name][extname]",
      },
    },
  },
});
