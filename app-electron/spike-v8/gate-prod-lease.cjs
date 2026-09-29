// Kokoro 生产化三租约闸门（Electron 真机，隐藏窗口）：
// 生产 src 的 coordinator + asr/translator/kokoro 服务 + vite 打包后的生产 worker。
// 先跑：npx vite build -c spike-v8/gate-prod-lease/vite.gate-prod.config.js
// 再跑：node_modules\.bin\electron.cmd spike-v8/gate-prod-lease.cjs
const { app, BrowserWindow, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { serveFile, safeJoin } = require("../serve-file.cjs");

const DIST = path.join(__dirname, "..", "dist");
const MODELS = path.join(__dirname, "..", "data", "models");
const OUT = path.join(__dirname, "gate-prod-lease.json");

{
  const built = path.join(DIST, "spike-v8", "gate-prod-lease", "gate-prod.html");
  let html = fs.readFileSync(built, "utf8");
  html = html.replace(/\.\.\/\.\.\/__gate-prod\.js/g, "./__gate-prod.js");
  fs.writeFileSync(path.join(DIST, "__gate-prod.html"), html, "utf8");
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

app.whenReady().then(() => {
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    let file;
    if (u.pathname.startsWith("/__model__/")) file = safeJoin(MODELS, u.pathname.slice("/__model__/".length));
    else if (u.pathname.startsWith("/ort/")) file = safeJoin(path.join(DIST, "ort"), u.pathname.slice("/ort/".length));
    else file = safeJoin(DIST, u.pathname === "/" ? "index.html" : u.pathname.slice(1));
    if (!file || !fs.existsSync(file)) return new Response("nf " + u.pathname, { status: 404 });
    const headers = { "Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "no-store" };
    if (file.endsWith(".html")) { headers["Cross-Origin-Opener-Policy"] = "same-origin"; headers["Cross-Origin-Embedder-Policy"] = "require-corp"; }
    else if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".wasm")) headers["Cross-Origin-Embedder-Policy"] = "require-corp";
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

  win.webContents.on("console-message", (_e, _l, msg) => {
    if (msg.startsWith("KOKORO-WORKER-ERROR") || msg.startsWith("SMOKE_FAIL")) { console.error(msg); }
    else console.log(msg);
    if (msg.startsWith("SMOKE_STAGE ")) stage[msg.split(" ").slice(1).join(" ")] = rendererWs();
    if (msg.startsWith("SMOKE_RESULT")) {
      const result = JSON.parse(msg.slice("SMOKE_RESULT ".length));
      result.rssStageMb = stage;
      const b = stage["rss-baseline"] || 0, a = stage["rss-asr"] || 0, t1 = stage["rss-tts1"] || 0,
        t1d = stage["rss-tts1-disposed"] || 0, m = stage["rss-mt"] || 0, t2 = stage["rss-tts2"] || 0,
        fin = stage["rss-final"] || 9999;
      const t1Chunks = (result.tts1?.chunks || []).length;
      const checks = {
        asrReturned: !!result.asr1 && result.asr1.ms > 0,
        ttsAcquired: result.ttsAcquireMs > 0,
        tts1HasAudio: t1Chunks > 0 && (result.tts1?.totalAudioMs || 0) > 200,
        tts2HasAudio: (result.tts2?.totalAudioMs || 0) > 200,
        tts3HasAudio: (result.tts3?.totalAudioMs || 0) > 200,
        tts4HasAudio: (result.tts4?.totalAudioMs || 0) > 200,
        // 热身后真实首块合成：spike 中位约 3s（RTF 0.83，6 词块），闸门放宽到 8s
        firstChunkWarm: result.tts1FirstChunkMs > 0 && result.tts1FirstChunkMs < 8000,
        mt6ParasNoEmpty: result.mt && result.mt.n === 6 && result.mt.empty === 0,
        asrDisposedBeforeTts: result.asrDisposedBeforeTts === true,
        ttsDisposedBeforeMt: result.ttsDisposed === true,
        mtDisposedBeforeTts2: result.mtDisposedBeforeTts2 === true,
        allReleased: result.allReleased === true,
        rssAsrGoneBeforeTts: t1 < a - 100,
        rssTtsGoneBeforeMt: m < t1 + 250,
        rssTts2Band: Math.abs(t2 - t1) <= 200,
        rssFinalNearBaseline: fin <= b + 150,
      };
      result.rssDeltaMb = { baseline: b, asr: a, tts1: t1, tts1Disposed: t1d, mt: m, tts2: t2, final: fin };
      result.checks = checks;
      result.pass = Object.values(checks).every(Boolean);
      fs.writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
      for (const f of ["__gate-prod.html", "__gate-prod.js"]) { try { fs.rmSync(path.join(DIST, f)); } catch { /* noop */ } }
      try { fs.rmSync(path.join(DIST, "spike-v8"), { recursive: true, force: true }); } catch { /* noop */ }
      try { for (const f of fs.readdirSync(path.join(DIST, "assets"))) if (f.startsWith("gp-")) fs.rmSync(path.join(DIST, "assets", f), { recursive: true, force: true }); } catch { /* noop */ }
      console.log("GATE-PROD " + (result.pass ? "PASS" : "FAIL") + " " + JSON.stringify(checks, null, 0));
      setTimeout(() => app.exit(result.pass ? 0 : 5), 300);
    }
    if (msg.startsWith("SMOKE_FAIL")) {
      fs.writeFileSync(OUT, JSON.stringify({ pass: false, fatal: msg.slice("SMOKE_FAIL ".length), rssStageMb: stage }, null, 2), "utf8");
      setTimeout(() => app.exit(6), 300);
    }
  });
  win.webContents.on("render-process-gone", () => { console.error("RENDERER GONE"); app.exit(3); });
  win.loadURL("app://app/__gate-prod.html");
  setTimeout(() => { console.error("SMOKE TIMEOUT"); app.exit(4); }, 420000);
});
