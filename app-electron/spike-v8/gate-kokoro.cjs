// S7c 闸门（Electron 真机）：Kokoro q8f16 在独立 Worker 内 WASM 推理。
// 先跑：npx vite build -c spike-v8/gate-kokoro/vite.gate-kokoro.config.js
// 快速冒烟（不浸泡）：$env:GK_SOAK="0"; npx electron spike-v8/gate-kokoro.cjs
// 全量（30 分钟浸泡）：npx electron spike-v8/gate-kokoro.cjs
const { app, BrowserWindow, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { serveFile, safeJoin } = require("../serve-file.cjs");

const DIST = path.join(__dirname, "..", "dist");
const MODELS = path.join(__dirname, "kokoro-model");
const WAVDIR = path.join(__dirname, "kokoro-wav");
const OUT = path.join(__dirname, "gate-kokoro.json");
const SOAK = process.env.GK_SOAK === undefined ? "1800" : process.env.GK_SOAK;

fs.mkdirSync(WAVDIR, { recursive: true });

{
  const built = path.join(DIST, "spike-v8", "gate-kokoro", "gate-kokoro.html");
  let html = fs.readFileSync(built, "utf8");
  html = html.replace(/\.\.\/\.\.\/__gate-kokoro\.js/g, "./__gate-kokoro.js");
  fs.writeFileSync(path.join(DIST, "__gate-kokoro.html"), html, "utf8");
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

app.whenReady().then(() => {
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);

    if (req.method === "POST" && u.pathname.startsWith("/__savewav__/")) {
      const name = path.basename(u.searchParams.get("name") || "out.wav");
      const buf = Buffer.from(await req.arrayBuffer());
      fs.writeFileSync(path.join(WAVDIR, name), buf);
      return new Response("ok " + buf.length, { headers: { "Cross-Origin-Resource-Policy": "same-origin" } });
    }

    let file;
    if (u.pathname.startsWith("/__kokoro__/")) file = safeJoin(MODELS, u.pathname.slice("/__kokoro__/".length));
    else if (u.pathname.startsWith("/ort/")) file = safeJoin(path.join(DIST, "ort"), u.pathname.slice("/ort/".length));
    else file = safeJoin(DIST, u.pathname === "/" ? "index.html" : u.pathname.slice(1));
    if (!file || !fs.existsSync(file)) return new Response("nf " + u.pathname, { status: 404 });

    const headers = { "Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "no-store" };
    if (process.env.GK_ISO !== "0" && file.endsWith(".html")) { headers["Cross-Origin-Opener-Policy"] = "same-origin"; headers["Cross-Origin-Embedder-Policy"] = "require-corp"; }
    else if (process.env.GK_ISO !== "0" && (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".wasm"))) headers["Cross-Origin-Embedder-Policy"] = "require-corp";
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
  const logs = [];
  const keep = setInterval(() => {}, 1000);

  win.webContents.on("console-message", (_e, _l, msg) => {
    if (msg.startsWith("KFETCH")) { console.log(msg); return; }
    if (msg.startsWith("SMOKE_LOG")) { console.log(msg); logs.push(msg); return; }
    if (msg.startsWith("SMOKE_STAGE ")) {
      const name = msg.split(" ").slice(1).join(" ");
      stage[name] = rendererWs();
      console.log("STAGE", name, stage[name] + "MB");
      return;
    }
    if (msg.startsWith("SMOKE_RESULT")) {
      clearInterval(keep);
      const result = JSON.parse(msg.slice("SMOKE_RESULT ".length));
      result.rssStageMb = stage;
      result.logs = logs;

      const soakVals = Object.entries(stage).filter(([k]) => k.startsWith("soak-")).map(([, v]) => v).sort((a, b) => a - b);
      const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
      const soakHead = mean(soakVals.slice(0, 3));
      const soakTail = mean(soakVals.slice(-3));
      const b = stage["rss-baseline"] || 0;
      const fin = stage["rss-final"] || 9999;

      const wavOk = result.wav.every((n) => {
        const p = path.join(WAVDIR, n);
        return fs.existsSync(p) && fs.statSync(p).size > 1000;
      });

      const checks = {
        inited: result.initMs > 0,
        allAudioNonEmpty: result.nonEmpty === true,
        firstAudioAllLe1500ms: result.firstAudioMaxMs <= 1500,
        rtfP95Under08: result.rtfP95 < 0.8,
        wavWritten: wavOk,
        rssDisposedNearBaseline: fin <= b + 150,
        soakRan: result.soak.seconds === 0 ? true : result.soak.iters >= 30,
        soakNoGrowthOver100Mb: result.soak.seconds === 0 ? true : soakTail - soakHead < 100,
      };
      result.soakRss = { headMb: Math.round(soakHead), tailMb: Math.round(soakTail), growthMb: Math.round(soakTail - soakHead) };
      result.rssDeltaMb = { baseline: b, loaded: stage["rss-loaded"], after1: stage["rss-after-1"], after15: stage["rss-after-15"], preDispose: stage["rss-pre-dispose"], final: fin };
      result.checks = checks;
      result.pass = Object.values(checks).every(Boolean);
      fs.writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
      for (const f of ["__gate-kokoro.html", "__gate-kokoro.js"]) { try { fs.rmSync(path.join(DIST, f)); } catch { /* noop */ } }
      try { fs.rmSync(path.join(DIST, "spike-v8"), { recursive: true, force: true }); } catch { /* noop */ }
      try { for (const f of fs.readdirSync(path.join(DIST, "assets"))) if (f.startsWith("gk-")) fs.rmSync(path.join(DIST, "assets", f), { recursive: true, force: true }); } catch { /* noop */ }
      console.log("GATE-KOKORO " + (result.pass ? "PASS" : "FAIL") + " " + JSON.stringify(checks));
      console.log("initMs=" + result.initMs, "firstAudioMax=" + result.firstAudioMaxMs, "rtfP50/P95=" + result.rtfP50 + "/" + result.rtfP95, "soak=" + JSON.stringify(result.soakRss));
      setTimeout(() => app.exit(result.pass ? 0 : 5), 500);
    }
    if (msg.startsWith("SMOKE_FAIL")) {
      clearInterval(keep);
      fs.writeFileSync(OUT, JSON.stringify({ pass: false, fatal: msg.slice("SMOKE_FAIL ".length), rssStageMb: stage }, null, 2), "utf8");
      console.error("GATE-KOKORO FATAL", msg);
      setTimeout(() => app.exit(6), 500);
    }
    if (msg.startsWith("SMOKE_STAGE") || msg.startsWith("SMOKE_RESULT")) return;
    console.log("[renderer] " + msg.slice(0, 400));
  });
  win.webContents.on("render-process-gone", () => { clearInterval(keep); console.error("RENDERER GONE"); app.exit(3); });
  let gateUrl = "app://app/__gate-kokoro.html?soak=" + SOAK + (process.env.GK_THREADS ? "&threads=" + process.env.GK_THREADS : "");
  if (process.env.GK_VERBOSE === "1") gateUrl += "&verbose=1";
  win.loadURL(gateUrl);
  setTimeout(() => { clearInterval(keep); console.error("SMOKE TIMEOUT"); app.exit(4); }, Number(SOAK) > 0 ? 3000000 : 300000);
});
