const fs = require("fs");
const content = `// VAD 自动化 smoke：内嵌真实录音（vad-smoke-audio.ts），解码后经
// MediaStreamAudioDestinationNode 注入 MicVAD（getStream 覆盖），
// 验证 Silero v5 在 Electron 渲染进程（无 nodeIntegration，同生产）内正确触发起止回调。
// 由 run-vad-smoke.cjs 加载，主进程监听 console 决定退出码。

import { MicVAD } from "@ricky0123/vad-web";
import { SPEECH_WEBM_B64 } from "./vad-smoke-audio";

const logEl = document.getElementById("log") as HTMLElement;
function log(msg: string): void {
  logEl.textContent += msg + "\\n";
  console.log(msg);
}

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function main(): Promise<void> {
  const ab = b64ToArrayBuffer(SPEECH_WEBM_B64);

  const ctx = new AudioContext();
  const speechBuf = await ctx.decodeAudioData(ab);
  log(\`decoded speech: \${speechBuf.numberOfChannels}ch \${speechBuf.sampleRate}Hz \${speechBuf.duration.toFixed(2)}s\`);

  const dest = ctx.createMediaStreamDestination();
  const src = ctx.createBufferSource();
  src.buffer = speechBuf;
  src.connect(dest);

  let starts = 0;
  let ends = 0;
  let misfires = 0;

  const vad = await MicVAD.new({
    baseAssetPath: new URL("../vad/", location.href).href,
    onnxWASMBasePath: new URL("../vad/ort/", location.href).href,
    model: "v5",
    ortConfig: (ort: any) => {
      ort.env.wasm.proxy = false;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      ort.env.wasm.wasmPaths = new URL("../vad/ort/", location.href).href;
    },
    getStream: async () => dest.stream,
    onSpeechStart: () => {
      starts++;
      log("onSpeechStart");
    },
    onSpeechEnd: (audio) => {
      ends++;
      log(\`onSpeechEnd samples=\${audio.length} (\${(audio.length / 16000).toFixed(2)}s)\`);
    },
    onVADMisfire: () => {
      misfires++;
      log("onVADMisfire");
    },
  });
  vad.start();
  src.start();

  const waitMs = Math.min(speechBuf.duration + 5, 20) * 1000;
  setTimeout(() => {
    const pass = starts >= 1 && ends >= 1;
    log(\`result starts=\${starts} ends=\${ends} misfires=\${misfires}\`);
    log(pass ? "VAD_SMOKE_PASS" : "VAD_SMOKE_FAIL");
  }, waitMs);
}

main().catch((e) => log("VAD_SMOKE_ERROR " + (e instanceof Error ? e.message : String(e))));
`;
fs.writeFileSync(
  "D:/vibe coding/英语学习/app-electron/spike-v5/vad-smoke.ts",
  content
);
console.log("vad-smoke.ts overwritten");
