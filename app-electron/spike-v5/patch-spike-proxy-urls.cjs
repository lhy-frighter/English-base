const fs = require("fs");
const fp = "src/spike-v8/run-spike.ts";
let s = fs.readFileSync(fp, "utf8");
const old = `  // 国内网络：权重走 hf-mirror，wasm 库走 jsdelivr（仅 spike 用；生产由模型商店/可配置镜像决定）
  const mirrored: webllm.ModelRecord = {
    ...rec,
    model: rec.model.replace("https://huggingface.co", "https://hf-mirror.com"),
    model_lib: rec.model_lib
      .replace(webllm.modelLibURLPrefix, "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/"),
  };`;
const neu = `  // 经主进程代理上游（绕开 CORS；生产形态=模型商店下载哈希校验后本地 serve）
  const hfPath = rec.model.replace("https://huggingface.co/", "");
  const libPath = rec.model_lib.replace(webllm.modelLibURLPrefix, "");
  const mirrored: webllm.ModelRecord = {
    ...rec,
    model: "app://app/__webllm__/hf/" + hfPath,
    model_lib: "app://app/__webllm__/lib/" + libPath,
  };`;
if (!s.includes(old)) { console.log("anchor missing"); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(fp, s, "utf8");
console.log("spike urls switched to proxy");
