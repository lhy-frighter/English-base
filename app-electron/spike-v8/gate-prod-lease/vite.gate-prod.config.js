import { defineConfig } from "vite";
import path from "node:path";
import fs from "node:fs";

// Kokoro 生产化闸门：直接打包生产 src（coordinator + 三类服务 + 生产 worker），
// 在隐藏 Electron 内验证 ASR→TTS→翻译→TTS 三租约不叠加、生产 worker 可从 app:// 加载模型。
// 不跑 React 应用，entry 自行 mock window.electronAPI 的 modelStatus/modelRuntime。
function copyOrtForGate() {
  return {
    name: "copy-ort-gate",
    closeBundle() {
      const pnpm = path.join(__dirname, "..", "..", "node_modules", ".pnpm");
      const dir = fs.readdirSync(pnpm).find((d) => d.startsWith("onnxruntime-web@"));
      const src = path.join(pnpm, dir, "node_modules", "onnxruntime-web", "dist");
      const out = path.join(__dirname, "..", "..", "dist", "ort");
      fs.mkdirSync(out, { recursive: true });
      const keep = /^ort-wasm-simd-threaded(\.jsep)?\.(mjs|wasm)$/;
      for (const f of fs.readdirSync(src)) if (keep.test(f)) fs.copyFileSync(path.join(src, f), path.join(out, f));
    },
  };
}

export default defineConfig({
  base: "./",
  worker: { format: "es" },
  plugins: [copyOrtForGate()],
  resolve: {
    alias: {
      phonemizer: path.join(__dirname, "..", "..", "vendor", "phonemizer", "phonemizer.js"),
    },
  },
  build: {
    target: "es2022",
    outDir: path.join(__dirname, "..", "..", "dist"),
    emptyOutDir: false,
    rollupOptions: {
      input: path.join(__dirname, "gate-prod.html"),
      output: {
        entryFileNames: "__gate-prod.js",
        chunkFileNames: "assets/gp-[name].js",
        assetFileNames: "assets/gp-[name][extname]",
      },
    },
  },
});
