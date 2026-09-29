// S7b 闸门 1+2（Electron 真机渲染 Worker）：
// 闸门1：Bergamot 0.4.9 在 Electron 渲染进程 classic Web Worker 内加载/推理；
//       线程模型（预期单线程、无 SAB 依赖）、JS 堆高水位、主进程侧 renderer RSS；
// 闸门2：句对提取（embind getSourceSentence/getTranslatedSentence）覆盖与非空校验。
// SMOKE_NOISO=1 时不发 COOP/COEP，验证不依赖 crossOriginIsolated。
const { app, BrowserWindow, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { serveFile, safeJoin } = require("../serve-file.cjs");

const DIST = path.join(__dirname, "..", "dist");
const MODELS = path.join(__dirname, "..", "data", "models");
const NOISO = process.env.SMOKE_NOISO === "1";
const OUTTAG = process.env.SMOKE_OUTTAG || (NOISO ? "gate-renderer-noiso.json" : "gate-renderer-iso.json");

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
    if (!NOISO) {
      if (file.endsWith(".html")) { headers["Cross-Origin-Opener-Policy"] = "same-origin"; headers["Cross-Origin-Embedder-Policy"] = "require-corp"; }
      else if (file.endsWith(".js") || file.endsWith(".mjs")) { headers["Cross-Origin-Embedder-Policy"] = "require-corp"; }
    }
    return serveFile(file, headers, req);
  });

  // 冻结集供页面读取
  fs.copyFileSync(path.join(__dirname, "fixtures", "frozen-paragraphs.json"), path.join(DIST, "__fixtures.json"));

  const smokeJs = `
  window.addEventListener('error', e => console.log('SMOKE_WERR ' + e.message + ' ' + (e.filename||'') + ':' + (e.lineno||'')));
  window.addEventListener('unhandledrejection', e => console.log('SMOKE_REJ ' + String(e.reason && e.reason.stack || e.reason)));
  const log = (...a) => console.log('SMOKE_STAGE ' + a.join(' '));
  const norm = s => s.replace(/\\s+/g, ' ').trim();
  const out = { noiso: ${NOISO ? "true" : "false"} };
  out.isolated = self.crossOriginIsolated; log('isolated', out.isolated);
  out.sab = typeof SharedArrayBuffer !== 'undefined';
  const fx = await (await fetch('./__fixtures.json')).json();
  const pick = kind => fx.paragraphs.filter(p => p.kind === kind).slice(0, 4).map(p => p.en);
  const batch1 = [fx.paragraphs[0].en, ...pick('aeon').slice(0,1), ...pick('newsinlevels').slice(0,1)];
  const batch2 = [...pick('sciencedaily'), ...pick('aeon'), ...pick('newsinlevels')];
  const heap = () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  out.heapBefore = heap();

  const w = new Worker('./bergamot/translator-worker.js');
  w.onerror = e => console.log('SMOKE_WORKER_ERR msg=' + e.message + ' ' + (e.filename||'') + ':' + (e.lineno||''));
  let seq = 0;
  const call = (msg, key) => new Promise((res, rej) => {
    const id = ++seq;
    const t = setTimeout(() => rej(new Error('timeout ' + key)), 120000);
    w.onmessage = e => {
      if (e.data.type === 'fatal') { clearTimeout(t); rej(new Error(e.data.message)); return; }
      if (e.data.reqId === id || e.data.id === id) { clearTimeout(t); res(e.data); }
    };
    w.postMessage(Object.assign({ reqId: id, id }, msg));
  });
  log('init posted');
  const ready = await call({ type: 'init',
    modelBase: 'app://app/__model__/bergamot/enzh',
    revision: 'enzh-llmaat-qe8-2024',
    files: { model: 'model.enzh.intgemm.alphas.bin', shortlist: 'lex.50.50.enzh.s2t.bin',
             srcvocab: 'srcvocab.enzh.spm', trgvocab: 'trgvocab.enzh.spm' } }, 'ready');
  out.initMs = ready.ms; out.heapAfterInit = heap(); log('after-init');
  const r1 = await call({ type: 'translate', paras: batch1, withPairs: true }, 'result1');
  out.firstMs = r1.ms; out.heapAfterFirst = heap(); log('after-first');
  out.samples = r1.zh.map((zh, i) => ({ en: batch1[i].slice(0, 80), zh: zh.slice(0, 120), npairs: r1.pairs[i].length }));

  // 闸门2：句对覆盖校验（源句拼回应等于原文；译句非空）
  out.pairChecks = r1.pairs.map((ps, i) => {
    const srcJoin = norm(ps.map(p => p.src).join(''));
    const tgtJoin = norm(ps.map(p => p.tgt).join(''));
    const orig = norm(batch1[i]);
    const zh = norm(r1.zh[i]);
    return {
      npairs: ps.length,
      srcCover: srcJoin === orig,
      tgtCover: tgtJoin === zh,
      srcLen: srcJoin.length, origLen: orig.length,
      tgtLen: tgtJoin.length, zhLen: zh.length,
      tgtAllNonEmpty: ps.every(p => norm(p.tgt).length > 0),
      samplePairs: ps.slice(0, 2),
    };
  });

  const t2 = performance.now();
  const r2 = await call({ type: 'translate', paras: batch2, withPairs: false }, 'result2');
  out.batch2 = { n: batch2.length, ms: Math.round(performance.now() - t2), words: batch2.join(' ').split(/\\s+/).length,
    empty: r2.zh.filter(z => !norm(z)).length, heap: heap() };
  out.heapAfter15 = heap(); log('after-batch2');

  // dispose + terminate，模拟租约释放
  await call({ type: 'dispose' }, 'disposed');
  w.terminate();
  await new Promise(r => setTimeout(r, 5000));
  out.heapAfterTerminate = heap();
  log('after-terminate');
  console.log('SMOKE_RESULT ' + JSON.stringify(out));
  `;
  fs.writeFileSync(path.join(DIST, "__gate.js"), smokeJs);
  fs.writeFileSync(path.join(DIST, "__gate.html"),
    "<!doctype html><meta charset=utf8><body>gate<script type=module src=\"./__gate.js\"></script>");

  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      jsFlags: "--expose-gc" },
  });

  // 主进程侧每 1s 采样 renderer 工作集（Worker 属于 renderer 进程）
  let peak = 0;
  const samples = [];
  let dumped = false;
  const sampler = setInterval(() => {
    const mets = app.getAppMetrics();
    if (!dumped) {
      const r0 = mets.find((x) => x.type === "renderer" || x.type === "tab" || x.type === "Tab");
      console.log("SMOKE_METRIC_KEYS", r0 ? Object.keys(r0).join(",") : "no-renderer",
        "types", mets.map((x) => x.type).join(","));
      dumped = true;
    }
    const renderers = mets.filter((x) => x.type === "renderer" || x.type === "tab" || x.type === "Tab");
    const ws = renderers.reduce((s, x) => s + x.memory.workingSetSize / 1024, 0);
    if (ws > 0) { peak = Math.max(peak, ws); samples.push(Math.round(ws)); }
  }, 1000);

  const rendererWs = () => Math.round(app.getAppMetrics().filter((x) => x.type === "renderer" || x.type === "tab" || x.type === "Tab")
    .reduce((s, x) => s + x.memory.workingSetSize / 1024, 0));
  const stageRss = {};
  win.webContents.on("console-message", (_e, _l, msg) => {
    console.log(msg);
    if (msg.startsWith("SMOKE_STAGE")) stageRss[msg.split(" ").slice(1).join(" ").slice(0, 24)] = rendererWs();
    if (msg.startsWith("SMOKE_RESULT")) {
      clearInterval(sampler);
      const result = JSON.parse(msg.slice("SMOKE_RESULT ".length));
      result.rss = { peakMb: Math.round(peak), samples: samples, stageMb: stageRss };
      fs.writeFileSync(path.join(__dirname, OUTTAG), JSON.stringify(result, null, 2));
      for (const f of ["__gate.js", "__gate.html", "__fixtures.json"]) { try { fs.rmSync(path.join(DIST, f)); } catch {} }
      setTimeout(() => app.exit(0), 300);
    }
  });
  win.webContents.on("render-process-gone", () => { clearInterval(sampler); app.exit(3); });
  win.loadURL("app://app/__gate.html");
  setTimeout(() => { clearInterval(sampler); console.error("SMOKE TIMEOUT"); app.exit(4); }, 180000);
});
