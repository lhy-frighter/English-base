// S7c 三租约闸门（Electron 真机）：ASR(whisper-base) → Kokoro TTS → 翻译(Bergamot) → Kokoro TTS。
// 先跑：npx vite build -c spike-v8/gate-lease/vite.gate-lease.config.js
// 再跑：npx electron spike-v8/gate-lease.cjs
const { app, BrowserWindow, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { serveFile, safeJoin } = require("../serve-file.cjs");

const DIST = path.join(__dirname, "..", "dist");
const MODELS = path.join(__dirname, "..", "data", "models");
const KOKORO = path.join(__dirname, "kokoro-model");
const OUT = path.join(__dirname, "gate-lease.json");

{
  const built = path.join(DIST, "spike-v8", "gate-lease", "gate-lease.html");
  let html = fs.readFileSync(built, "utf8");
  html = html.replace(/\.\.\/\.\.\/__gate-lease\.js/g, "./__gate-lease.js");
  fs.writeFileSync(path.join(DIST, "__gate-lease.html"), html, "utf8");
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

app.whenReady().then(() => {
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    let file;
    if (u.pathname.startsWith("/__model__/")) file = safeJoin(MODELS, u.pathname.slice("/__model__/".length));
    else if (u.pathname.startsWith("/__kokoro__/")) file = safeJoin(KOKORO, u.pathname.slice("/__kokoro__/".length));
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
  const sampler = setInterval(() => {}, 1000);

  win.webContents.on("console-message", (_e, _l, msg) => {
    if (msg.startsWith("KOKORO-WORKER-ERROR")) { console.error(msg); return; }
    console.log(msg);
    if (msg.startsWith("SMOKE_STAGE ")) {
      const name = msg.split(" ").slice(1).join(" ");
      stage[name] = rendererWs();
    }
    if (msg.startsWith("SMOKE_RESULT")) {
      clearInterval(sampler);
      const result = JSON.parse(msg.slice("SMOKE_RESULT ".length));
      result.rssStageMb = stage;
      const b = stage["rss-baseline"] || 0, a = stage["rss-asr"] || 0, t1 = stage["rss-tts1"] || 0,
        t1d = stage["rss-tts1-disposed"] || 0, m = stage["rss-mt"] || 0, t2 = stage["rss-tts2"] || 0,
        fin = stage["rss-final"] || 9999;
      const checks = {
        asrReturned: !!result.asr1 && result.asr1.ms > 0,
        tts1Returned: !!result.tts1a && result.tts1a.audioMs > 0.2 && !!result.tts1b && result.tts1b.audioMs > 0.2,
        mt6ParasNoEmpty: result.mt && result.mt.n === 6 && result.mt.empty === 0,
        tts2Returned: !!result.tts2a && result.tts2a.audioMs > 0.2,
        asrDisposedBeforeTts: result.asrDisposedBeforeTts === true,
        mtDisposedBeforeTts2: result.mtDisposedBeforeTts2 === true,
        allReleased: result.allReleased === true,
        // ASR→TTS：释放 ASR 后 RSS 必须显著低于 ASR 单租约（whisper-base ~1GB）
        rssAsrGoneBeforeTts: t1 < a - 100,
        // TTS→翻译：若 Kokoro 未销毁，RSS ≈ TTS+Bergamot 叠加；实测应远低于叠加值
        rssTtsGoneBeforeMt: m < t1 + 250,
        // 第二次 TTS 回到 TTS 单租约区间（证明翻译已退出且 TTS 水位可复现）
        rssTts2Band: Math.abs(t2 - t1) <= 200,
        rssFinalNearBaseline: fin <= b + 150,
      };
      result.rssDeltaMb = { baseline: b, asr: a, tts1: t1, tts1Disposed: t1d, mt: m, tts2: t2, final: fin };
      result.checks = checks;
      result.pass = Object.values(checks).every(Boolean);
      fs.writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
      for (const f of ["__gate-lease.html", "__gate-lease.js"]) { try { fs.rmSync(path.join(DIST, f)); } catch { /* noop */ } }
      try { fs.rmSync(path.join(DIST, "spike-v8"), { recursive: true, force: true }); } catch { /* noop */ }
      try { for (const f of fs.readdirSync(path.join(DIST, "assets"))) if (f.startsWith("gl-")) fs.rmSync(path.join(DIST, "assets", f), { recursive: true, force: true }); } catch { /* noop */ }
      console.log("GATE-LEASE " + (result.pass ? "PASS" : "FAIL") + " " + JSON.stringify(checks));
      setTimeout(() => app.exit(result.pass ? 0 : 5), 300);
    }
    if (msg.startsWith("SMOKE_FAIL")) {
      clearInterval(sampler);
      fs.writeFileSync(OUT, JSON.stringify({ pass: false, fatal: msg.slice("SMOKE_FAIL ".length), rssStageMb: stage }, null, 2), "utf8");
      console.error("GATE-LEASE FATAL", msg);
      setTimeout(() => app.exit(6), 300);
    }
  });
  win.webContents.on("render-process-gone", () => { clearInterval(sampler); console.error("RENDERER GONE"); app.exit(3); });
  win.loadURL("app://app/__gate-lease.html");
  setTimeout(() => { clearInterval(sampler); console.error("SMOKE TIMEOUT"); app.exit(4); }, 420000);
});
