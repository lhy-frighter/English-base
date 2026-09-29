const fs = require("node:fs");
const path = require("node:path");
const { ModelStore } = require("../model-store.cjs");

(async () => {
  const root = path.join(__dirname, "..");
  const modelsDir = path.join(root, "data", "models");
  const store = new ModelStore(modelsDir);

  // 1) lib 重新安装（新增 f16 wasm）
  {
    const id = "webllm-lib-cs1k";
    const spec = store.spec(id);
    const cacheDir = path.join(root, "data", "webllm-lib-cache");
    for (const rec of spec.files) {
      const src = path.join(cacheDir, rec.path);
      if (!fs.existsSync(src)) throw new Error("lib cache missing: " + rec.path);
      const dst = store.stageFile(id, rec.path);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    store.commit(id, store.getMirror(), Date.now(), () => {});
    const v = await store.verifyActive(id);
    console.log("verify lib", v.ok);
    if (!v.ok) process.exit(1);
  }

  // 2) f16 3B 安装
  {
    const id = "webllm-qwen25-3b-f16";
    if (store.status(id) === "installed") { console.log("already installed:", id); }
    else {
      const spec = store.spec(id);
      const genDir = path.join(__dirname, "gen-webllm", id);
      for (const rec of spec.files) {
        const src = path.join(genDir, rec.path);
        if (!fs.existsSync(src)) throw new Error("gen missing: " + rec.path);
        const dst = store.stageFile(id, rec.path);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
      }
      store.commit(id, store.getMirror(), Date.now(), () => {});
      const v = await store.verifyActive(id);
      console.log("verify f16", v.ok);
      if (!v.ok) process.exit(1);
    }
  }
  console.log("SEED F16 DONE");
})().catch((e) => { console.error(e); process.exit(1); });
