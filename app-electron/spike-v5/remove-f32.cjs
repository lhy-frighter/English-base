const fs = require("node:fs");
const path = require("node:path");
const { ModelStore } = require("../model-store.cjs");

(async () => {
  const root = path.join(__dirname, "..");
  const modelsDir = path.join(root, "data", "models");
  const store = new ModelStore(modelsDir);
  const id = "webllm-qwen25-3b";
  console.log("status before:", store.status(id));
  const spec = store.spec(id);
  // 删除 active 安装目录（repo/resolve/revision）
  const target = store.activeDir(spec);
  fs.rmSync(target, { recursive: true, force: true });
  // 若 resolve 下已空则清理
  const resolveDir = path.join(modelsDir, spec.repo, "resolve");
  if (fs.existsSync(resolveDir) && fs.readdirSync(resolveDir).length === 0) {
    fs.rmSync(path.join(modelsDir, spec.repo), { recursive: true, force: true });
  }
  // 删除 manifest
  fs.rmSync(store.manifestPath(id), { force: true });
  // 清理 stage/part 残留
  fs.rmSync(store.stageDir(id), { recursive: true, force: true });
  for (const f of fs.readdirSync(store.partDir)) {
    if (f.startsWith(id)) fs.rmSync(path.join(store.partDir, f), { force: true });
  }
  console.log("status after:", store.status(id));
  console.log("f16 still:", store.status("webllm-qwen25-3b-f16"));
})().catch((e) => { console.error(e); process.exit(1); });
