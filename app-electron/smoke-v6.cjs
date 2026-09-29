// V6 生产集成冒烟（临时）：用与 main.cjs 相同的 app:// 协议服务 dist + data/models，
// 加载生产构建出的 ASR worker，验证：隔离头、本地模型提供、离线加载、jfk 转写。跑完即退。
const { app, BrowserWindow, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { serveFile, safeJoin } = require("./serve-file.cjs");
const { PINNED_WHISPER_TINY_EN } = require("./model-store.cjs");

const DIST = path.join(__dirname, "dist");
const MODELS = path.join(__dirname, "data", "models");
const NOISO = process.env.SMOKE_NOISO === "1";           // 不发 COOP/COEP，制造 crossOriginIsolated=false
const THREADS = Number(process.env.SMOKE_THREADS || 8);
const REVISION = process.env.SMOKE_REVISION || PINNED_WHISPER_TINY_EN.revision; // 默认固定 commit
const OUTTAG = process.env.SMOKE_OUTTAG || "smoke-result.json";
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

app.whenReady().then(() => {
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    let file;
    if (u.pathname.startsWith("/__model__/")) file = safeJoin(MODELS, u.pathname.slice("/__model__/".length));
    else file = safeJoin(DIST, u.pathname === "/" ? "index.html" : u.pathname.slice(1));
    if (!file || !fs.existsSync(file)) return new Response("nf " + u.pathname, { status: 404 });
    const headers = { "Cross-Origin-Resource-Policy": "same-origin" };
    if (!NOISO) {
      if (file.endsWith(".html")) { headers["Cross-Origin-Opener-Policy"] = "same-origin"; headers["Cross-Origin-Embedder-Policy"] = "require-corp"; }
      else if (file.endsWith(".js") || file.endsWith(".mjs")) { headers["Cross-Origin-Embedder-Policy"] = "require-corp"; }
    }
    return serveFile(file, headers, req);
  });

  // 找生产 worker 与 jfk
  const workerFile = fs.readdirSync(path.join(DIST, "assets")).find((f) => /^worker-.*\.js$/.test(f));
  fs.copyFileSync(path.join(__dirname, "spike-v6", "public", "jfk.wav"), path.join(DIST, "jfk.wav"));
  // 外部模块脚本创建 worker（与 run-spike 验证通过的形态一致；inline module 创建 module worker 在本环境会失败）
  const smokeJs = `
  window.addEventListener('error',e=>console.log('SMOKE_WERR '+e.message));
  window.addEventListener('unhandledrejection',e=>console.log('SMOKE_REJ '+String(e.reason&&e.reason.stack||e.reason)));
  const log=(...a)=>console.log('SMOKE_STAGE '+a.join(' '));
  const WORKER='./assets/${workerFile}';
  const out={};
  out.isolated = self.crossOriginIsolated; log('isolated',out.isolated);
  const cfg = await fetch('app://app/__model__/Xenova/whisper-tiny.en/resolve/${REVISION}/config.json');
  out.modelCfgStatus = cfg.status; out.modelCfgBytes = (await cfg.text()).length; log('modelcfg',out.modelCfgStatus,out.modelCfgBytes);
  const w = new Worker(WORKER, {type:'module'});
  w.onerror=e=>console.log('SMOKE_WORKER_ERR msg='+e.message+' '+e.filename+':'+e.lineno);
  const wait=(k)=>new Promise((res,rej)=>{w.onmessage=e=>{if(e.data.type==='fatal')rej(new Error(e.data.message));if(e.data.type===k)res(e.data)};setTimeout(()=>rej(new Error('timeout '+k)),180000)});
  w.postMessage({type:'init',reqId:1,modelId:'Xenova/whisper-tiny.en',modelBase:'app://app/__model__',revision:'${REVISION}',threads:${THREADS},device:'wasm'});
  log('init posted');
  const ready = await wait('ready'); out.ready=ready; log('ready',JSON.stringify(ready));
  const ab = await (await fetch('./jfk.wav')).arrayBuffer(); log('jfk',ab.byteLength);
  const ac = new AudioContext(); const dec = await ac.decodeAudioData(ab);
  const off = new OfflineAudioContext(1, Math.ceil(dec.duration*16000),16000);
  const s=off.createBufferSource(); s.buffer=dec; s.connect(off.destination); s.start();
  const pcm=(await off.startRendering()).getChannelData(0).slice(); log('pcm',pcm.length);
  w.postMessage({type:'transcribe',pcm,run:1});
  const r = await new Promise((res,rej)=>{w.onmessage=e=>{if(e.data.type==='fatal')rej(new Error(e.data.message));if(e.data.type==='result')res(e.data)};setTimeout(()=>rej(new Error('timeout result')),120000)});
  out.result={ms:r.ms,text:r.text,nwords:r.words.length,firstWords:r.words.slice(0,5)};
  console.log('SMOKE_RESULT '+JSON.stringify(out));
  `;
  fs.writeFileSync(path.join(DIST, "__smoke.js"), smokeJs);
  const html = `<!doctype html><meta charset=utf8><body>smoke<script type=module src="./__smoke.js"></script>`;
  fs.writeFileSync(path.join(DIST, "__smoke.html"), html);

  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_e, _l, msg) => {
    console.log(msg);
    if (msg.startsWith("SMOKE_RESULT")) { fs.writeFileSync(path.join(__dirname, "spike-v6", OUTTAG), msg.slice("SMOKE_RESULT ".length)); setTimeout(() => app.exit(0), 300); }
  });
  win.webContents.on("render-process-gone", () => app.exit(3));
  win.loadURL("app://app/__smoke.html");
  setTimeout(() => { console.error("SMOKE TIMEOUT"); app.exit(4); }, 240000);
});
