// 用生成器已下载的文件填充 staging，走 ModelStore.commit 正式安装（逐文件哈希仍由可信清单校验）。
const fs = require("node:fs");
const path = require("node:path");
const { ModelStore } = require("../model-store.cjs");

(async () => {
  const modelsDir = path.join(__dirname, "..", "data", "models");
  const store = new ModelStore(modelsDir);
  const jobs = [
    { id: "webllm-qwen25-3b", gen: "webllm-qwen25-3b" },
    { id: "webllm-qwen25-15b", gen: "webllm-qwen25-15b" },
  ];
  for (const j of jobs) {
    if (store.status(j.id) === "installed") { console.log("already installed:", j.id); continue; }
    const spec = store.spec(j.id);
    const genDir = path.join(__dirname, "gen-webllm", j.gen);
    for (const rec of spec.files) {
      const src = path.join(genDir, rec.path);
      if (!fs.existsSync(src)) throw new Error("gen file missing: " + rec.path);
      const dst = store.stageFile(j.id, rec.path);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    const started = Date.now();
    store.commit(j.id, store.getMirror(), started, (e) => console.log("commit event:", e.phase, j.id));
    const v = await store.verifyActive(j.id);
    console.log("verifyActive", j.id, v.ok);
    if (!v.ok) process.exit(1);
  }
  // wasm lib 同样从本地缓存填充安装
  const libId = "webllm-lib-cs1k";
  if (store.status(libId) !== "installed") {
    const spec = store.spec(libId);
    const cacheDir = path.join(__dirname, "..", "data", "webllm-lib-cache");
    for (const rec of spec.files) {
      const dst = store.stageFile(libId, rec.path);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(cacheDir, rec.path), dst);
    }
    store.commit(libId, store.getMirror(), Date.now(), () => {});
    const v = await store.verifyActive(libId);
    console.log("verifyActive", libId, v.ok);
    if (!v.ok) process.exit(1);
  } else console.log("already installed:", libId);
  console.log("SEED DONE");
})().catch((e) => { console.error(e); process.exit(1); });
