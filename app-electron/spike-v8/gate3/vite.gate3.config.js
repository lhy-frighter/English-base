import { defineConfig } from "vite";
import path from "node:path";

// 闸门③-b 专用构建：把生产 coordinator/asr/translate 源码连同 ASR worker 打成单页 bundle
// 输出到 dist/__gate3.html + __gate3.js（emptyOutDir=false，不动正式产物）
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  build: {
    target: "es2022",
    outDir: path.join(__dirname, "..", "..", "dist"),
    emptyOutDir: false,
    rollupOptions: {
      input: path.join(__dirname, "gate3.html"),
      output: {
        entryFileNames: "__gate3.js",
        chunkFileNames: "assets/gate3-[name].js",
        assetFileNames: "assets/gate3-[name][extname]",
      },
    },
  },
});
