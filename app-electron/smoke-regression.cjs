// 离线回归评测冒烟（隐藏 Electron）：用生产 worker + app:// 本地模型，对 data/regression 全部样本
// 用指定模型（SMOKE_MODEL=whisper-base|whisper-tiny.en）转写，结果写 spike-v6/reg-<model>.json 后退出。
const { app, BrowserWindow, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { serveFile, safeJoin } = require("./serve-file.cjs");
const { TRUSTED_CATALOG } = require("./model-store.cjs");

const DIST = path.join(__dirname, "dist");
const MODELS = path.join(__dirname, "data", "models");
const REGR = path.join(__dirname, "data", "regression");
const MODEL_ID = process.env.SMOKE_MODEL || "whisper-base";
const spec = TRUSTED_CATALOG.find((m) => m.id === MODEL_ID);
if (!spec) { console.error("unknown model", MODEL_ID); process.exit(2); }
const clips = JSON.parse(fs.readFileSync(path.join(REGR, "manifest.json"), "utf8"));
const OUTTAG = `reg-${MODEL_ID}.json`;

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

app.whenReady().then(() => {
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    let file;
    if (u.pathname.startsWith("/__model__/")) file = safeJoin(MODELS, u.pathname.slice("/__model__/".length));
    else if (u.pathname.startsWith("/__reg__/")) file = safeJoin(REGR, u.pathname.slice("/__reg__/".length));
    else file = safeJoin(DIST, u.pathname === "/" ? "index.html" : u.pathname.slice(1));
    if (!file || !fs.existsSync(file)) return new Response("nf " + u.pathname, { status: 404 });
    const headers = { "Cross-Origin-Resource-Policy": "same-origin" };
    if (file.endsWith(".html")) { headers["Cross-Origin-Opener-Policy"] = "same-origin"; headers["Cross-Origin-Embedder-Policy"] = "require-corp"; }
    else if (file.endsWith(".js") || file.endsWith(".mjs")) headers["Cross-Origin-Embedder-Policy"] = "require-corp";
    return serveFile(file, headers, req);
  });

  const workerFile = fs.readdirSync(path.join(DIST, "assets")).find((f) => /^worker-.*\.js$/.test(f));
  const clipJs = clips.map((c) => ({ file: c.file, lang: c.lang, ref: c.ref }));
  const smokeJs = `
  window.addEventListener('unhandledrejection',e=>console.log('SMOKE_REJ '+String(e.reason&&e.reason.stack||e.reason)));
  const log=(...a)=>console.log('SMOKE_STAGE '+a.join(' '));
  const SPEC=${JSON.stringify({ repo: spec.repo, revision: spec.revision, multilingual: !!spec.multilingual })};
  const CLIPS=${JSON.stringify(clipJs)};
  const w = new Worker('./assets/${workerFile}', {type:'module'});
  w.onerror=e=>console.log('SMOKE_WORKER_ERR '+e.message);
  const wait=(k,timeout)=>new Promise((res,rej)=>{w.onmessage=e=>{if(e.data.type==='fatal')rej(new Error(e.data.message));if(e.data.type===k)res(e.data)};setTimeout(()=>rej(new Error('timeout '+k)),timeout||180000)});
  w.postMessage({type:'init',reqId:1,modelId:SPEC.repo,modelBase:'app://app/__model__',revision:SPEC.revision,threads:8,device:'wasm',multilingual:SPEC.multilingual});
  await wait('ready',300000); log('ready');
  const ac = new AudioContext();
  const out=[];
  for(let i=0;i<CLIPS.length;i++){
    const c=CLIPS[i]; log('clip',i+1,c.lang);
    const ab=await (await fetch('app://app/__reg__/'+c.file)).arrayBuffer();
    const dec=await ac.decodeAudioData(ab);
    const off=new OfflineAudioContext(1,Math.ceil(dec.duration*16000),16000);
    const s=off.createBufferSource(); s.buffer=dec; s.connect(off.destination); s.start();
    const pcm=(await off.startRendering()).getChannelData(0).slice();
    const lang=c.lang==='zh'?'chinese':c.lang==='en'?'english':undefined;
    w.postMessage({type:'transcribe',pcm,run:i+1,...(SPEC.multilingual?{task:'transcribe',language:lang}:{})});
    const r=await wait('result',120000);
    out.push({file:c.file,lang:c.lang,ref:c.ref,text:r.text,ms:r.ms,words:r.words});
  }
  console.log('SMOKE_RESULT '+JSON.stringify(out));
  `;
  fs.writeFileSync(path.join(DIST, "__smoke.js"), smokeJs);
  fs.writeFileSync(path.join(DIST, "__smoke.html"), `<!doctype html><meta charset=utf8><body>smoke<script type=module src="./__smoke.js"></script>`);

  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_e, _l, msg) => {
    console.log(msg);
    if (msg.startsWith("SMOKE_RESULT")) { fs.writeFileSync(path.join(__dirname, "spike-v6", OUTTAG), msg.slice("SMOKE_RESULT ".length)); setTimeout(() => app.exit(0), 300); }
  });
  win.webContents.on("render-process-gone", () => app.exit(3));
  win.loadURL("app://app/__smoke.html");
  setTimeout(() => { console.error("SMOKE TIMEOUT"); app.exit(4); }, 600000);
});
