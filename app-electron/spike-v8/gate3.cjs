// S7b 闸门③（Electron 真机）：ASR↔翻译 InferenceCoordinator 租约切换。
// 用生产源码构建的 dist/__gate3.js（先跑：npx vite build -c spike-v8/gate3/vite.gate3.config.js），
// 在同一渲染进程内 ASR(whisper-base) → 翻译(Bergamot) → ASR，验证：
//   acquire 互斥（旧 Worker 先 dispose）、双向切换后 RSS 回落、并发抢占串行。
const { app, BrowserWindow, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { serveFile, safeJoin } = require("../serve-file.cjs");

const DIST = path.join(__dirname, "..", "dist");
const MODELS = path.join(__dirname, "..", "data", "models");
const OUT = path.join(__dirname, "gate3.json");

// 构建产物 html 在 dist/spike-v8/gate3/gate3.html，引用 ../../__gate3.js；
// 复制到 dist 根并改写引用，使 document.baseURI 与生产一致（bergamot 相对路径才正确）
{
  const built = path.join(DIST, "spike-v8", "gate3", "gate3.html");
  let html = fs.readFileSync(built, "utf8");
  html = html.replace(/\.\.\/\.\.\/__gate3\.js/g, "./__gate3.js");
  fs.writeFileSync(path.join(DIST, "__gate3.html"), html, "utf8");
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

app.whenReady().then(() => {
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    let file;
    if (u.pathname.startsWith("/__model__/")) file = safeJoin(MODELS, u.pathname.slice("/__model__/".length));
    else file = safeJoin(DIST, u.pathname === "/" ? "index.html" : u.pathname.slice(1));
    if (!file || !fs.existsSync(file)) return new Response("nf " + u.pathname, { status: 404 });
    const headers = { "Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "no-store" };
    if (file.endsWith(".html")) { headers["Cross-Origin-Opener-Policy"] = "same-origin"; headers["Cross-Origin-Embedder-Policy"] = "require-corp"; }
    else if (file.endsWith(".js") || file.endsWith(".mjs")) { headers["Cross-Origin-Embedder-Policy"] = "require-corp"; }
    return serveFile(file, headers, req);
  });

  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, jsFlags: "--expose-gc" },
  });

  const rendererWs = () => Math.round(app.getAppMetrics()
    .filter((x) => x.type === "renderer" || x.type === "tab" || x.type === "Tab")
    .reduce((s, x) => s + x.memory.workingSetSize / 1024, 0));
  const stage = {};
  const sampler = setInterval(() => { /* 保持事件循环活跃；阶段值在消息时一次性读取 */ }, 1000);

  win.webContents.on("console-message", (_e, _l, msg) => {
    console.log(msg);
    if (msg.startsWith("SMOKE_STAGE ")) {
      const name = msg.split(" ").slice(1).join(" ");
      stage[name] = rendererWs();
    }
    if (msg.startsWith("SMOKE_RESULT")) {
      clearInterval(sampler);
      const result = JSON.parse(msg.slice("SMOKE_RESULT ".length));
      result.rssStageMb = stage;
      // 判定（whisper-base 实测 RSS ≈ 1.0GB，Bergamot ≈ 0.64–0.69GB，ASR 更大；
      // 互斥的证据不是“MT 比 ASR 高”，而是切换后 RSS 落在“仅新租约”的区间，而非两者叠加 ~1.6GB，
      // 且双释放后回落到基线附近）
      const b = stage["rss-baseline"] || 0, a1 = stage["rss-asr"] || 0, m = stage["rss-mt"] || 0,
        a2 = stage["rss-asr2"] || 0, fin = stage["rss-final"] || 9999;
      const checks = {
        asr1Returned: !!result.asr1 && result.asr1.ms > 0,
        asr2Returned: !!result.asr2 && result.asr2.ms > 0,
        mt12ParasNoEmpty: result.mt && result.mt.n === 12 && result.mt.empty === 0,
        asrDisposedWhenMt: result.asrDisposedAfterAcquireMt === true,
        mtDisposedWhenAsr: result.mtDisposedAfterAcquireAsr === true,
        allReleased: result.allReleased === true,
        concurrentSerialized: result.serialized === true,
        // ASR→翻译：若 ASR 未释放，RSS 应 ≈1.0+0.6=1.6GB；实测远低于 ASR 单独驻留即证明旧 Worker 退出
        rssAsrReleasedForMt: m < a1 - 100,
        // 翻译→ASR：RSS 回到 ASR 单租约区间（与首次 ASR 接近），而非叠加
        rssMtReleasedForAsr: a2 > m + 150 && Math.abs(a2 - a1) <= 150,
        // 双释放后回落到基线 +150MB 以内
        rssFinalNearBaseline: fin <= b + 150,
      };
      result.rssDeltaMb = { baseline: b, asr: a1, mt: m, asr2: a2, final: fin };
      result.checks = checks;
      result.pass = Object.values(checks).every(Boolean);
      fs.writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
      for (const f of ["__gate3.html", "__gate3.js"]) { try { fs.rmSync(path.join(DIST, f)); } catch { /* noop */ } }
      try { fs.rmSync(path.join(DIST, "spike-v8"), { recursive: true, force: true }); } catch { /* noop */ }
      console.log("GATE3 " + (result.pass ? "PASS" : "FAIL") + " " + JSON.stringify(checks));
      setTimeout(() => app.exit(result.pass ? 0 : 5), 300);
    }
    if (msg.startsWith("SMOKE_FAIL")) {
      clearInterval(sampler);
      fs.writeFileSync(OUT, JSON.stringify({ pass: false, fatal: msg.slice("SMOKE_FAIL ".length), rssStageMb: stage }, null, 2), "utf8");
      console.error("GATE3 FATAL");
      setTimeout(() => app.exit(6), 300);
    }
  });
  win.webContents.on("render-process-gone", () => { clearInterval(sampler); console.error("RENDERER GONE"); app.exit(3); });
  win.loadURL("app://app/__gate3.html");
  setTimeout(() => { clearInterval(sampler); console.error("SMOKE TIMEOUT"); app.exit(4); }, 300000);
});
