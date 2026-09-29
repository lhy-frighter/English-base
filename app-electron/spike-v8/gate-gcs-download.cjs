// 闸门③-a：Bergamot 模型真实 GCS 下载（广州网络）+ 深校验 + 原子安装 + 断网故障注入。
// 用法：node spike-v8/gate-gcs-download.cjs           （临时目录验证，不碰真机库）
//       node spike-v8/gate-gcs-download.cjs --install （额外安装到真实 data/models）
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { ModelStore } = require("../model-store.cjs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODEL = "bergamot-enzh";

async function installInto(dir, label) {
  const store = new ModelStore(dir);
  const t0 = Date.now();
  const ev = [];
  const r = await store.ensure(MODEL, (e) => {
    if (e.phase === "progress") process.stdout.write(`\r[${label}] ${e.file} ${e.pct ?? 0}%`);
    if (e.phase === "installed") process.stdout.write("\n");
    ev.push(e.phase);
  });
  const v = await store.verifyActive(MODEL);
  const man = store.manifest(MODEL);
  return { r, v, man, tookMs: Date.now() - t0, events: ev, store };
}

(async () => {
  const results = { at: new Date().toISOString(), cases: {} };

  // 1) 临时目录真实下载
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bergamot-gate-"));
  console.log("== 1. 真实 GCS 下载到临时目录:", tmp);
  try {
    const { r, v, man, tookMs, events } = await installInto(tmp, "tmp");
    console.log("state:", r.state, "files:", r.files, "took(ms):", tookMs);
    results.cases.realDownload = {
      ok: r.state === "installed" && v.ok && r.files === 4,
      revision: man.revision, totalBytes: man.totalBytes, tookMs,
      deepVerify: v.files, hasInstalledEvent: events.includes("installed"),
    };
    console.log("深校验:", JSON.stringify(v.files));
  } catch (e) {
    results.cases.realDownload = { ok: false, error: String(e.message || e) };
    console.error("真实下载失败:", e);
  }

  // 2) 二次运行零网络（manifest + 深校验直接放行）
  {
    const store2 = new ModelStore(tmp);
    let netCalls = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => { netCalls++; throw new Error("不应触网"); };
    const r2 = await store2.ensure(MODEL, () => {});
    globalThis.fetch = origFetch;
    results.cases.secondRunOffline = { ok: r2.cached === true && netCalls === 0, netCalls };
    console.log("== 2. 二次零网络:", JSON.stringify(results.cases.secondRunOffline));
  }

  // 3) 断网/坏镜像故障注入：指向本机关闭端口，必须干净失败且不 commit
  {
    console.log("== 3. 断网故障注入（镜像 127.0.0.1:1）");
    const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), "bergamot-gate-fail-"));
    const store3 = new ModelStore(tmp3, { allowInsecureMirror: true });
    store3.setMtMirror("http://127.0.0.1:1");
    let err = null, tStart = Date.now();
    try {
      await store3.ensure(MODEL, () => {});
    } catch (e) { err = String(e.message || e); }
    const man = store3.manifest(MODEL);
    const activeExists = fs.existsSync(path.join(tmp3, "bergamot"));
    results.cases.offlineFault = { failed: !!err, noManifest: man === null, noActive: !activeExists, error: err };
    console.log("   失败:", err, "| 无清单:", man === null, "| 无 active:", !activeExists, "| 耗时(s):", ((Date.now() - tStart) / 1000).toFixed(1));
    fs.rmSync(tmp3, { recursive: true, force: true });
  }

  // 4) 可选：安装到真实 data/models（用户首次使用即免下载）
  if (process.argv.includes("--install")) {
    const realDir = path.join(__dirname, "..", "data", "models");
    console.log("== 4. 安装到真机库:", realDir);
    fs.mkdirSync(realDir, { recursive: true });
    const { r, v, tookMs } = await installInto(realDir, "real");
    results.cases.realInstall = { ok: r.state === "installed" && v.ok, tookMs, deepVerify: v.files };
    console.log("真机库 state:", r.state, "深校验全部通过:", v.ok);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  const out = path.join(__dirname, "gate-gcs-download.json");
  fs.writeFileSync(out, JSON.stringify(results, null, 2), "utf8");
  const allOk = results.cases.realDownload.ok && results.cases.secondRunOffline.ok &&
    results.cases.offlineFault.failed && results.cases.offlineFault.noManifest && results.cases.offlineFault.noActive &&
    (!results.cases.realInstall || results.cases.realInstall.ok);
  console.log("\n闸门③-a 结论:", allOk ? "PASS" : "FAIL", "→", out);
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
