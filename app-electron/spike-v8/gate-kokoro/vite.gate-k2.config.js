import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  base: "./",
  worker: { format: "es" },
  resolve: {
    alias: {
      phonemizer: path.join(__dirname, "..", "vendor-kokoro", "p", "dist", "phonemizer.js"),
    },
  },
  build: {
    target: "es2022",
    outDir: path.join(__dirname, "..", "..", "dist"),
    emptyOutDir: false,
    rollupOptions: {
      input: path.join(__dirname, "gate-k2.html"),
      output: {
        entryFileNames: "__gate-k2.js",
        chunkFileNames: "assets/gk2-[name].js",
        assetFileNames: "assets/gk2-[name][extname]",
      },
    },
  },
});
