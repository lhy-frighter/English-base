// S7c 对照实验（Electron 真机）：生产 transformers 3.8.1 直连 Kokoro。
// 先跑：npx vite build -c spike-v8/gate-kokoro/vite.gate-k2.config.js
// 再跑：npx electron spike-v8/gate-k2.cjs   （可选 $env:GK_THREADS="8"; $env:GK_ISO="0"）
const { app, BrowserWindow, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { serveFile, safeJoin } = require("../serve-file.cjs");

const DIST = path.join(__dirname, "..", "dist");
const KOKORO = path.join(__dirname, "kokoro-model");
const OUT = path.join(__dirname, "gate-k2.json");

{
  const built = path.join(DIST, "spike-v8", "gate-kokoro", "gate-k2.html");
  let html = fs.readFileSync(built, "utf8");
  html = html.replace(/\.\.\/\.\.\/__gate-k2\.js/g, "./__gate-k2.js");
  fs.writeFileSync(path.join(DIST, "__gate-k2.html"), html, "utf8");
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

app.whenReady().then(() => {
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    let file;
    if (u.pathname.startsWith("/__kokoro__/")) file = safeJoin(KOKORO, u.pathname.slice("/__kokoro__/".length));
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
  const keep = setInterval(() => {}, 1000);

  win.webContents.on("console-message", (_e, _l, msg) => {
    console.log(msg);
    if (msg.startsWith("SMOKE_RESULT")) {
      clearInterval(keep);
      fs.writeFileSync(OUT, msg.slice("SMOKE_RESULT ".length), "utf8");
      for (const f of ["__gate-k2.html", "__gate-k2.js"]) { try { fs.rmSync(path.join(DIST, f)); } catch { /* noop */ } }
      try { fs.rmSync(path.join(DIST, "spike-v8"), { recursive: true, force: true }); } catch { /* noop */ }
      try { for (const f of fs.readdirSync(path.join(DIST, "assets"))) if (f.startsWith("gk2-")) fs.rmSync(path.join(DIST, "assets", f), { recursive: true, force: true }); } catch { /* noop */ }
      setTimeout(() => app.exit(0), 300);
    }
    if (msg.startsWith("SMOKE_FAIL")) {
      clearInterval(keep);
      fs.writeFileSync(OUT, JSON.stringify({ pass: false, fatal: msg.slice("SMOKE_FAIL ".length) }), "utf8");
      console.error("GATE-K2 FATAL", msg);
      setTimeout(() => app.exit(6), 300);
    }
  });
  win.webContents.on("render-process-gone", () => { clearInterval(keep); app.exit(3); });
  const q = process.env.GK_THREADS ? "?threads=" + process.env.GK_THREADS : "";
  win.loadURL("app://app/__gate-k2.html" + q);
  setTimeout(() => { clearInterval(keep); console.error("TIMEOUT"); app.exit(4); }, 300000);
});
