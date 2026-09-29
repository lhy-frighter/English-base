import { defineConfig } from "vite";
import path from "node:path";

// S7c 三租约闸门：生产 asr/translator/inference + Kokoro spike Worker，验证 ASR→TTS→翻译→TTS 不叠加驻留。
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
      input: path.join(__dirname, "gate-lease.html"),
      output: {
        entryFileNames: "__gate-lease.js",
        chunkFileNames: "assets/gl-[name].js",
        assetFileNames: "assets/gl-[name][extname]",
      },
    },
  },
});
