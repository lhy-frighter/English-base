import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// 构建后把 onnxruntime-web 的 wasm/mjs 拷到 dist/ort，供 ASR/TTS Worker 本地加载（不走 CDN）
function copyOrtWasm() {
  return {
    name: "copy-ort-wasm",
    closeBundle() {
      // 兼容两种布局：pnpm 隔离（node_modules/.pnpm）与 hoisted（node_modules/onnxruntime-web）
      let src = path.join(__dirname, "node_modules", "onnxruntime-web", "dist");
      if (!fs.existsSync(src)) {
        const pnpm = path.join(__dirname, "node_modules", ".pnpm");
        const dir = fs.readdirSync(pnpm).find((d) => d.startsWith("onnxruntime-web@"));
        if (!dir) throw new Error("未找到 onnxruntime-web，请先 pnpm install");
        src = path.join(pnpm, dir, "node_modules", "onnxruntime-web", "dist");
      }
      const out = path.join(__dirname, "dist", "ort");
      fs.mkdirSync(out, { recursive: true });
      const keep = /^ort-wasm-simd-threaded(\.jsep)?\.(mjs|wasm)$/;
      let n = 0;
      for (const f of fs.readdirSync(src)) {
        if (keep.test(f)) { fs.copyFileSync(path.join(src, f), path.join(out, f)); n++; }
      }
      console.log(`[copy-ort-wasm] 拷贝 ${n} 个 ort 运行时文件到 dist/ort`);
    },
  };
}

// 构建后把 Bergamot 翻译引擎（MPL-2.0，vendor/bergamot 原始产物 + 自有 Worker 封装）拷到 dist/bergamot
function copyBergamot() {
  return {
    name: "copy-bergamot",
    closeBundle() {
      const src = path.join(__dirname, "vendor", "bergamot");
      const out = path.join(__dirname, "dist", "bergamot");
      fs.mkdirSync(out, { recursive: true });
      let n = 0;
      for (const f of fs.readdirSync(src)) {
        if (fs.statSync(path.join(src, f)).isFile()) { fs.copyFileSync(path.join(src, f), path.join(out, f)); n++; }
      }
      console.log(`[copy-bergamot] 拷贝 ${n} 个翻译引擎文件到 dist/bergamot`);
    },
  };
}

// 构建后把 Silero VAD 随包资产（vendor/silero-vad：模型+worklet，ISC/MIT）拷到 dist/vad，
// 并把 onnxruntime-web 1.22 的 wasm/mjs 拷到 dist/vad/ort（VAD 不走 CDN、不走模型商店下载）
function copyVad() {
  return {
    name: "copy-vad",
    closeBundle() {
      const out = path.join(__dirname, "dist", "vad");
      fs.mkdirSync(path.join(out, "ort"), { recursive: true });
      let n = 0;
      const vendorDir = path.join(__dirname, "vendor", "silero-vad");
      for (const f of ["silero_vad_v5.onnx", "vad.worklet.bundle.min.js"]) {
        fs.copyFileSync(path.join(vendorDir, f), path.join(out, f)); n++;
      }
      const ortDist = path.join(__dirname, "node_modules", "onnxruntime-web", "dist");
      for (const f of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
        fs.copyFileSync(path.join(ortDist, f), path.join(out, "ort", f)); n++;
      }
      console.log(`[copy-vad] 拷贝 ${n} 个 VAD 运行时文件到 dist/vad`);
    },
  };
}

// 构建后把 Smart Turn v3.2 随包模型（vendor/smart-turn，BSD-2-Clause）拷到 dist/smartturn，
// 并把 onnxruntime-web 的 wasm/mjs 拷到 dist/smartturn/ort（不走 CDN、不走模型商店下载）
function copySmartTurn() {
  return {
    name: "copy-smartturn",
    closeBundle() {
      const out = path.join(__dirname, "dist", "smartturn");
      fs.mkdirSync(path.join(out, "ort"), { recursive: true });
      let n = 0;
      fs.copyFileSync(
        path.join(__dirname, "vendor", "smart-turn", "smart-turn-v3.2-cpu.onnx"),
        path.join(out, "smart-turn-v3.2-cpu.onnx"),
      );
      n++;
      const ortDist = path.join(__dirname, "node_modules", "onnxruntime-web", "dist");
      for (const f of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
        fs.copyFileSync(path.join(ortDist, f), path.join(out, "ort", f));
        n++;
      }
      console.log(`[copy-smartturn] 拷贝 ${n} 个 Smart Turn 运行时文件到 dist/smartturn`);
    },
  };
}

// 构建后把合规声明（ADR-5 裁决 #5）与 vendor 许可证原件拷到 dist/legal
function copyLegal() {
  return {
    name: "copy-legal",
    closeBundle() {
      const out = path.join(__dirname, "dist", "legal");
      fs.mkdirSync(out, { recursive: true });
      let n = 0;
      const copyFile = (src, name) => {
        if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(out, name)); n++; }
      };
      for (const f of fs.readdirSync(path.join(__dirname, "legal"))) {
        copyFile(path.join(__dirname, "legal", f), f);
      }
      // Kokoro 链路 vendor 许可证原件（phonemizer Apache-2.0 包装、内联 eSpeak NG GPL-3.0、kokoro-js Apache-2.0）
      copyFile(path.join(__dirname, "vendor", "phonemizer", "LICENSE.phonemizer"), "LICENSE.phonemizer-Apache-2.0.txt");
      copyFile(path.join(__dirname, "vendor", "phonemizer", "LICENSE.kokoro-js"), "LICENSE.kokoro-js-Apache-2.0.txt");
      console.log(`[copy-legal] 拷贝 ${n} 个合规/许可证文件到 dist/legal`);
    },
  };
}

export default defineConfig({
  plugins: [react(), copyOrtWasm(), copyBergamot(), copyVad(), copySmartTurn(), copyLegal()],
  base: "./",
  worker: { format: "es" },
  resolve: {
    alias: {
      // ADR-5：Kokoro 音素器固定 vendor 版本（phonemizer@1.2.1，内联 eSpeak NG，见 THIRD_PARTY_NOTICES）
      phonemizer: path.join(__dirname, "vendor", "phonemizer", "phonemizer.js"),
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: path.join(__dirname, "index.html"),
      },
    },
  },
});
