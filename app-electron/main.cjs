// Electron 主进程：窗口 + IPC → core.cjs
const { app, BrowserWindow, ipcMain, Menu, protocol, safeStorage, MessageChannelMain, dialog, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { Core } = require("./core.cjs");
const { extractText, MAX_FILE, MAX_CHARS } = require("./import-tools.cjs");
const { extractReadable } = require("./url-extract.cjs");
const { ModelStore } = require("./model-store.cjs");
const { RegressionStore } = require("./regression.cjs");
const { serveFile, safeJoin } = require("./serve-file.cjs");
const { parseConsent, normalizeConsent } = require("./cloud-consent.cjs");
const { createRelay } = require("./realtime-relay.cjs");
const http = require("node:http");

// 主进程兜底：未捕获异常/拒绝落 main.log，不让单点错误直接闪退（数据层各自已有事务回滚）
for (const [ev, tag] of [["uncaughtException", "uncaught"], ["unhandledRejection", "unhandled"]]) {
  process.on(ev, (e) => {
    try {
      fs.appendFileSync(path.join(__dirname, "data", "main.log"),
        new Date().toISOString() + " [main:" + tag + "] " + (e && e.stack ? e.stack : String(e)) + "\n");
    } catch { /* ignore */ }
  });
}

// 本地优先/可携带：Electron userData（含 WebLLM Cache API 模型缓存）落在工程 data 目录，不写入 %APPDATA%
app.setPath("userData", path.join(__dirname, "data", "webllm-profile"));

// 同一份绿色目录只允许一个实例：双开时两个进程会各自跑建表/回填/每日快照并抢扩展接收端口 47823，
// 启动期并发 DDL 会让其中一方直接崩
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) app.quit();

// app://：前端页面 + 本地模型/ort 运行时（同源，带 COOP/COEP 以开启多线程 WASM）
// app-media://：本地听力音频（跨源被 app 页面加载，需 CORP cross-origin）
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: "app-media", privileges: { secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

let core;
let modelStore;
let regressionStore;
let win;
const DIST_DIR = path.join(__dirname, "dist");

// 启动期致命错误：以前只往 data/main.log 追加一行然后不建窗口，用户看到的是"双击没反应"。
// 这里用一个不带 preload 的独立窗口把原因和恢复路径讲清楚。
function fatalStartupPage(err) {
  const detail = String((err && err.stack) || (err && err.message) || err || "未知错误");
  try {
    fs.appendFileSync(path.join(__dirname, "data", "main.log"),
      new Date().toISOString() + " [fatal] " + detail + "\n");
  } catch { /* ignore */ }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const dataDir = path.join(__dirname, "data");
  try {
    const w = new BrowserWindow({
      title: "个人英语能力底座 · 启动失败", width: 760, height: 560, autoHideMenuBar: true,
    });
    w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
      `<!doctype html><meta charset="utf-8"><title>启动失败</title>`
      + `<body style="font:14px/1.7 system-ui;padding:28px;max-width:660px">`
      + `<h1>应用未能启动</h1>`
      + `<p>数据层初始化失败。为避免在半损坏状态下继续写入，应用没有打开主界面。</p>`
      + `<p>你的全部学习数据在 <code>${esc(dataDir)}</code>；每日快照在其下的 <code>backups</code> 目录（文件名形如 <code>user-YYYY-MM-DD.sqlite</code>）。</p>`
      + `<p>恢复方式：关闭本窗口，用最近一次快照覆盖 <code>user.sqlite</code>（覆盖前先把坏库另存一份），再重新启动。</p>`
      + `<p>如需上报，请把 <code>data/main.log</code> 和下面这段一起发给维护者。</p>`
      + `<pre style="background:#f4f4f5;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-all;overflow:auto">${esc(detail)}</pre>`
      + `</body>`));
  } catch { /* ignore */ }
  try { dialog.showErrorBox("个人英语能力底座 · 启动失败", detail.slice(0, 4000)); } catch { /* ignore */ }
}

function createWindow() {
  const spikeOn = process.env.APP_V8_SPIKE === "1";
  const offlineOn = process.env.APP_V8_OFFLINE_SMOKE === "1";
  const leaseOn = process.env.APP_V8_LEASE_SMOKE === "1";
  const callDiag = process.env.APP_CALL_DIAG === "1";
  const smokeSecs = Number(process.env.APP_SMOKE_SECONDS || 0);
  // APP_SHOT 必须用可见窗口：实测无头（show:false）时页面处于 hidden 态，React 改了 DOM 但合成帧滞后不确定，
  // capturePage 会拍到上一个 tab 的旧画面或空画面（加等待到 3.2s 也只是偶发命中，压不住）。
  // 因此截图自审 inherently 会在桌面弹窗——跑之前要先跟用户报时长与中止方式。
  win = new BrowserWindow({
    title: "个人英语能力底座",
    width: 1100,
    height: 820,
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    show: !spikeOn && !offlineOn && !leaseOn && !callDiag && smokeSecs <= 0,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  // 顶层窗口只允许留在 app:// 自有产物内，外链一律不开新窗：
  // 渲染进程一旦导航到远端页面，就带着 preload 暴露的全部 IPC 能力跑在别人-controlled 的文档里了
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://app/")) e.preventDefault();
  });
  const spikeModel = process.env.APP_V8_MODEL ? "&model=" + encodeURIComponent(process.env.APP_V8_MODEL) : "";
  const spikeMode = process.env.APP_V8_SPIKE_MODE ? "&mode=" + encodeURIComponent(process.env.APP_V8_SPIKE_MODE) : "";
  win.loadURL("app://app/index.html" + (spikeOn ? "?spike=v8" + spikeModel + spikeMode
    : offlineOn ? "?offline=v8" : leaseOn ? "?lease=v8" : ""));
  if (leaseOn) {
    win.webContents.on("console-message", (_e, level, message) => {
      if (message.startsWith("V8LEASE")) {
        console.log(message);
        if (message.includes("DONE")) app.exit(0);
        if (message.includes("FATAL")) app.exit(4);
      } else if (level >= 3) {
        console.log("V8LEASE pageerror " + message);
      }
    });
  }
  if (spikeOn) {
    win.webContents.on("console-message", (_e, level, message) => {
      if (message.startsWith("V8SPIKE")) {
        console.log(message);
        if (message.includes("V8SPIKE DONE") || message.startsWith("V8SPIKE FATAL")) {
          try {
            const m = process.getProcessMemoryInfo ? process.getProcessMemoryInfo() : null;
            if (m) console.log("V8SPIKE mainRSS_KB " + m.residentSet);
          } catch { /* ignore */ }
          app.exit(message.startsWith("V8SPIKE FATAL") ? 4 : 0);
        }
      } else if (level >= 3) {
        console.log("V8SPIKE pageerror " + message);
      }
    });
    win.webContents.on("render-process-gone", (_e, d) => {
      console.log("V8SPIKE render_gone " + JSON.stringify(d)); app.exit(3);
    });
    const spikeTimeoutMs = Number(process.env.APP_V8_SPIKE_TIMEOUT_MS || 900000);
    setTimeout(() => { console.log("V8SPIKE TIMEOUT"); app.exit(5); }, spikeTimeoutMs);
  }
  if (offlineOn) {
    win.webContents.on("console-message", (_e, level, message) => {
      if (message.startsWith("V8OFF")) {
        console.log(message);
        if (message.includes("V8OFF DONE") || message.startsWith("V8OFF FATAL")) {
          app.exit(message.startsWith("V8OFF FATAL") ? 4 : 0);
        }
      } else if (level >= 3) {
        console.log("V8OFF pageerror " + message);
      }
    });
    win.webContents.on("render-process-gone", (_e, d) => {
      console.log("V8OFF render_gone " + JSON.stringify(d)); app.exit(3);
    });
    setTimeout(() => { console.log("V8OFF TIMEOUT"); app.exit(5); }, Number(process.env.APP_V8_OFFLINE_TIMEOUT_MS || 900000));
  }
  if (smokeSecs > 0) {
    // 冒烟钩子：隐藏启动真实应用，打印渲染层错误后退出（仅测试用）
    win.webContents.on("console-message", (_e, level, message) => {
      if (level >= 3) console.log("SMOKE_CONSOLE_ERROR " + message);
    });
    win.webContents.on("render-process-gone", (_e, d) => { console.log("SMOKE_RENDER_GONE " + JSON.stringify(d)); app.exit(3); });
    win.webContents.on("did-finish-load", () => console.log("SMOKE_LOADED"));
    setTimeout(() => { console.log("SMOKE_DONE"); app.exit(0); }, smokeSecs * 1000);
  }
  if (process.env.APP_CALL_DIAG === "1") {
    // 通话引擎端到端诊断（APP_CALL_DIAG=1）：假麦克风流（注入 smartturn 真语音）→ 真引擎 → 真中继。
    // 判据：relay 日志出现 "first audio frame"（帧从渲染层到达主进程）+ 页面气泡出现转写。
    const stepLog = (_e, _level, message) => {
      if (typeof message === "string" && (message.startsWith("MICSTEP") || message.startsWith("CALLDIAG"))) console.log(message);
    };
    win.webContents.on("console-message", stepLog);
    win.webContents.on("did-finish-load", () => {
      // 假麦克风流素材可选（APP_CALL_CLIP=文件名，默认英文 clip；spike-v8/smartturn-clips 下）
      const clipName = process.env.APP_CALL_CLIP || "clip-00-eng-1.f32";
      let clipB64 = "";
      try { clipB64 = fs.readFileSync(path.join(__dirname, "spike-v8", "smartturn-clips", clipName)).toString("base64"); } catch { /* 无素材 */ }
      void win.webContents.executeJavaScript(`(async () => {
        const step = (name, data) => console.log("CALLDIAG " + name + " " + JSON.stringify(data ?? {}));
        try {
          // 0) postMessage 探针：统计引擎各 kind 的上行消息与发送异常
          window.__postCounts = {};
          window.__postErrors = 0;
          const origPost = MessagePort.prototype.postMessage;
          MessagePort.prototype.postMessage = function (msg, transfer) {
            const k = (msg && msg.kind) || "unknown";
            window.__postCounts[k] = (window.__postCounts[k] || 0) + 1;
            try { return origPost.call(this, msg, transfer); }
            catch (e) {
              window.__postErrors++;
              if (window.__postErrors <= 2) step("post-error", { kind: k, e: String(e && (e.name + ": " + e.message)) });
              throw e;
            }
          };
          window.addEventListener("error", (ev) => {
            if (!window.__pageErrs) window.__pageErrs = 0;
            window.__pageErrs++;
            if (window.__pageErrs <= 3) step("page-error", { e: String(ev && ev.message) });
          });
          window.addEventListener("unhandledrejection", (ev) => {
            if (!window.__rejErrors) window.__rejErrors = 0;
            window.__rejErrors++;
            if (window.__rejErrors <= 3) step("rejection", { e: String(ev && ev.reason && (ev.reason.message || ev.reason)) });
          });
          // 1) 猴子补丁 getUserMedia：返回由语音素材驱动的假 MediaStream（48k dest，16k buffer 自动重采样）
          const raw = atob(${JSON.stringify(clipB64)});
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          const f32 = new Float32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4));
          const Ctor = window.AudioContext || window.webkitAudioContext;
          const ctx = new Ctor();
          const n = Math.floor(f32.length / 2048) * 2048;
          // 循环素材后垫 8s 静音：无缝循环会让服务端 VAD 永远等不到停说、无法提交；
          // 静音太短则 AI 刚开口就被下一次"说话"打断（验证中文兜底需要 AI 能说完三段式）
          const gap = 240000;
          const buffer = ctx.createBuffer(1, n + gap, 16000);
          const ch = buffer.getChannelData(0);
          for (let i = 0; i < n; i++) ch[i] = Math.max(-1, Math.min(1, f32[i]));
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;
          const dest = ctx.createMediaStreamDestination();
          src.connect(dest);
          src.start();
          navigator.mediaDevices.getUserMedia = async () => dest.stream;
          step("fake-mic-ready", { samples: n });
          // 2) 切到「通话」标签页，再点「开始语音通话」
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          let navBtn = null;
          for (let i = 0; i < 20 && !navBtn; i++) {
            await wait(500);
            navBtn = [...document.querySelectorAll(".nav-item")].find((b) => b.textContent.includes("通话"));
          }
          if (!navBtn) { step("no-nav", {}); return; }
          navBtn.click();
          let startBtn = null;
          for (let i = 0; i < 20; i++) {
            await wait(500);
            startBtn = [...document.querySelectorAll(".today-primary")].find((b) => b.textContent.includes("开始语音通话"));
            if (startBtn) break;
          }
          if (!startBtn) { step("no-start-button", {}); return; }
          startBtn.click();
          step("start-clicked", {});
          // 3) 轮询气泡：首回应答出现后继续观察 25s（假麦克风持续说话 → 应触发打断/重连）
          const t0 = Date.now();
          let bubbleTexts = [];
          let statsText = "";
          while (Date.now() - t0 < 55000) {
            await new Promise((r) => setTimeout(r, 1500));
            bubbleTexts = [...document.querySelectorAll(".vcall-bubble")].map((b) => b.textContent.trim());
            statsText = (document.querySelector(".vcall-stats") || {}).textContent || "";
            if (bubbleTexts.length >= 2 && Date.now() - t0 > 45000) break;
          }
          const phase = (document.querySelector(".vcall-bar strong") || {}).textContent || "";
          step("bubbles", { count: bubbleTexts.length, last: bubbleTexts.slice(-4), phase, stats: statsText.trim(), posts: window.__postCounts, postErrors: window.__postErrors, rejections: window.__rejErrors || 0 });
          // 4) 挂断收尾
          const hang = document.querySelector(".vcall-hangup");
          if (hang) hang.click();
          step("hangup-clicked", {});
        } catch (e) { step("fail", { e: String(e && (e.name + ": " + e.message)) }); }
      })()`);
    });
    setTimeout(() => { console.log("CALLDIAG diag-exit"); app.exit(0); }, 70_000);
  }
  if (process.env.APP_SHOT === "1") {
    win.webContents.on("console-message", (_e, level, message) => {
      if (level >= 2) console.log("PAGE" + level + ": " + String(message).slice(0, 220));
    });
    // 视觉验收（APP_SHOT=1）：切各 tab 截图到 data/shots/，供设计评审
    const shotDir = path.join(__dirname, "data", "shots");
    fs.mkdirSync(shotDir, { recursive: true });
    // 像素回归（APP_SHOT_BASELINE=1 建基线；此后每跑自动对比）：BGRA 原始位图逐像素比较，
    // 每通道容差 12 以容忍合成器微抖；-1 表示尺寸不匹配（窗口/布局级变化）
    const baselineDir = path.join(__dirname, "data", "shots-baseline");
    const wantBaseline = process.env.APP_SHOT_BASELINE === "1";
    fs.mkdirSync(baselineDir, { recursive: true });
    const diffs = {}, audits = {};
    const diffImages = (a, b) => {
      const sa = a.getSize(), sb = b.getSize();
      if (sa.width !== sb.width || sa.height !== sb.height) return -1;
      const da = a.toBitmap(), db = b.toBitmap();
      if (da.length !== db.length) return -1;
      const TOL = 12;
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (Math.abs(da[i] - db[i]) > TOL || Math.abs(da[i + 1] - db[i + 1]) > TOL || Math.abs(da[i + 2] - db[i + 2]) > TOL) diff++;
      }
      return diff / (da.length / 4);
    };
    // 活数据页不做像素回归：这页渲染实时 RSS，每次内容都不一样（实测同一份代码
    // 基线是 Aeon 文章、隔天就是 ScienceDaily，diff 13%+），基线对它没有意义——
    // 长期报警会被习惯性忽略，反而盖住真正的版面变化。截图仍存（供人工看版式），
    // 程序化审计（溢出/热区/对比度）照跑，只跳过 diff。
    // capturePage 偶发返回空位图（合成器尚未产出该帧），会让 diff 报 size-mismatch。
    // 实测会随机落在不同 tab 上、与代码无关——一个会随机误报的回归信号等于没有信号，
    // 久了就没人看它。所以空图必须重试，而不是记成 size-mismatch（#198）。
    const capture = async () => {
      for (let i = 0; i < 4; i++) {
        const img = await win.webContents.capturePage();
        if (!img.isEmpty() && img.getSize().width > 0) return img;
        await new Promise((r) => setTimeout(r, 400));
      }
      console.log("SHOT warn capturePage 连续返回空图");
      return await win.webContents.capturePage();
    };
    const LIVE_DATA_PAGES = new Set(["feed"]);
    const recordShot = (tag, img) => {
      const png = img.toPNG();
      fs.writeFileSync(path.join(shotDir, tag + ".png"), png);
      if (wantBaseline) { fs.writeFileSync(path.join(baselineDir, tag + ".png"), png); return; }
      if (LIVE_DATA_PAGES.has(tag)) { diffs[tag] = "skipped(活数据页)"; return; }
      const bPath = path.join(baselineDir, tag + ".png");
      if (fs.existsSync(bPath)) {
        const r = diffImages(img, nativeImage.createFromPath(bPath));
        diffs[tag] = r;
        console.log("DIFF " + tag + " " + (r < 0 ? "size-mismatch" : (r * 100).toFixed(2) + "%"));
      }
    };
    // 程序化 UI 审计（report-only，结果写 shots/ui-audit.json）：横向溢出 / 点击热区<32px /
    // 文本对比度（WCAG 采样，≥24px 或 ≥18.66px 粗体按 3:1，其余 4.5:1；半透明玻璃底穿透到最近实底近似）。
    // 注意：脚本注入经模板字面量，正则统一不用 \d 类转义（会被烤制成字面量），颜色解析用逗号切分。
    // 采样前把指针移出页面并让出一帧，让 :hover 状态确定性地回到「无 hover」，
    // 否则 hover 显形的控件（.lib-del 等，静止 opacity:0）会被随机采到或采不到——
    // 同一份代码两次运行结论相反，正是 #203 的成因。CSS 强制清除不可行：
    // :hover 由指针位置驱动，注入 :not(:hover) 改不了它，只能靠真实移出指针。
    const settleNoHover = async () => {
      try {
        win.webContents.sendInputEvent({ type: "mouseMove", x: -10, y: -10 });
      } catch { /* 某些平台不支持负坐标，忽略 */ }
      await new Promise((r) => setTimeout(r, 120));
    };
    const auditPage = async () => {
      await settleNoHover();
      try {
      return await win.webContents.executeJavaScript(`(() => {
      const out = { overflow: false, smallTap: [], smallTapCount: 0, contrast: [], contrastCount: 0, sampled: 0, unknown: 0,
        glass: { attr: "", total: 0, blurred: 0 } };
      const de = document.documentElement, bd = document.body;
      if (de && bd) out.overflow = de.scrollWidth > de.clientWidth + 1 || bd.scrollWidth > bd.clientWidth + 1;
      // 液态玻璃逃生门是否真的生效（#191）：只读 CSS 规则不算数——属性没写上、
      // 选择器拼错、!important 被覆盖，任何一环断了按钮都会「点了没反应」，
      // 而代码里完全看不出来。这里直接量渲染后的 backdrop-filter。
      if (bd) {
        out.glass.attr = bd.getAttribute("data-glass") || "";
        document.querySelectorAll(".glass, .glass-strong").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          out.glass.total++;
          const cs = getComputedStyle(el);
          const bf = cs.backdropFilter || cs.webkitBackdropFilter || "none";
          if (bf !== "none") out.glass.blurred++;
        });
      }
      const vis = (el) => {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
      };
      const small = [];
      document.querySelectorAll('button, a, [role="button"], select, input[type="checkbox"]').forEach((el) => {
        if (!vis(el)) return;
        const r = el.getBoundingClientRect();
        // 被整行 <label> 包住的小控件（复选框等）：浏览器把点击映射到 label 内的 input，
        // 真实热区是 label 而不是 input 自身盒子。取 label 的盒子来判，才与用户实际点击一致。
        const lb = el.closest("label");
        const box = lb && lb !== el ? lb.getBoundingClientRect() : r;
        if (Math.min(box.width, box.height) < 32) small.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 48), w: Math.round(box.width), h: Math.round(box.height) });
      });
      // 按「标签+类名」聚合：同页几十个同类实例会把明细刷满前 8 条，导致被截断的类完全看不见。
      // kinds = 去重后的类目数，是真正需要逐条判读的规模；count = 元素总数，是影响面。
      // 已登记的豁免（热力格子等密集数据网格）单独计数并标注，不从数字里悄悄抹掉——
      // 豁免必须留痕，否则下一个人会以为「已经是 0 了」。
      const TAP_EXEMPT = ["hm-cell"];
      const byTap = new Map();
      for (const s of small) {
        const k = s.tag + "." + s.cls;
        if (!byTap.has(k)) byTap.set(k, { tag: s.tag, cls: s.cls, w: s.w, h: s.h, n: 0, exempt: TAP_EXEMPT.some((x) => s.cls.indexOf(x) !== -1) });
        byTap.get(k).n++;
      }
      const tapAll = [...byTap.values()];
      const tapReal = tapAll.filter((x) => !x.exempt);
      const tapSkip = tapAll.filter((x) => x.exempt);
      out.smallTap = tapReal.slice(0, 24);
      out.smallTapExempt = tapSkip.map((x) => ({ cls: x.cls, w: x.w, h: x.h, n: x.n }));
      out.smallTapCount = small.length;
      out.smallTapKinds = tapReal.length;
      out.smallTapExemptCount = tapSkip.reduce((a, x) => a + x.n, 0);
      const lum = (r, g, b) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const parse = (s) => {
        if (!s) return null;
        // 渐变串里的色标 Chromium 有时给 rgb()、有时原样保留 hex/#fff，两种都得认，
        // 否则切不出色标就会退回父级浅色底，把「白字配蓝头像」算成 1.13 的假阳性。
        if (s.charAt(0) === "#") {
          let e = 1;
          while (e < s.length && "0123456789abcdefABCDEF".indexOf(s.charAt(e)) !== -1) e++;
          const h = s.slice(1, e);
          const sh = h.length === 3 ? h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2) : h;
          if (sh.length !== 6) return null;
          return { r: parseInt(sh.slice(0, 2), 16), g: parseInt(sh.slice(2, 4), 16), b: parseInt(sh.slice(4, 6), 16), a: 1 };
        }
        if (s.indexOf("rgb") !== 0) return null;
        const parts = s.slice(s.indexOf("(") + 1, s.lastIndexOf(")")).split(",");
        if (parts.length < 3) return null;
        const n = parts.map((x) => parseFloat(x));
        if (n.some((v) => isNaN(v))) return null;
        return { r: n[0], g: n[1], b: n[2], a: parts.length > 3 ? n[3] : 1 };
      };
      // 渐变底解析：getComputedStyle 的 backgroundColor 只是渐变「下面」的底色，真实像素由
      // background-image 决定。此前直接拿它算，得到白字配白底的 1.08 —— 纯假阳性，
      // 会把人力浪费在根本没问题的地方。这里把渐变串里所有色标切出来当候选底，
      // 对每个色标都算一遍取最差值。linear-gradient 的最差色标通常在两端，
      // 这个近似对卡片渐变、侧栏渐变、头像渐变都成立。
      // 切串不用正则：注入脚本经模板字面量烤制，正则里的 \d 会被烤成字面量（见本函数上方注释）。
      const stopsOf = (img) => {
        const list = []; let i = 0;
        while (i < img.length) {
          const jr = img.indexOf("rgb", i);
          const jh = img.indexOf("#", i);
          let j = -1, end = -1;
          if (jr !== -1 && (jh === -1 || jr <= jh)) { j = jr; const k = img.indexOf(")", jr); if (k === -1) break; end = k + 1; }
          else if (jh !== -1) { j = jh; let e = jh + 1; while (e < img.length && "0123456789abcdefABCDEF".indexOf(img.charAt(e)) !== -1) e++; end = e; }
          else break;
          const c = parse(img.slice(j, end));
          if (c && c.a > 0.85) list.push(c);
          i = end;
        }
        return list;
      };
      const bgOf = (el) => {
        let n = el;
        while (n && n !== document.documentElement) {
          const cs = getComputedStyle(n);
          const img = cs.backgroundImage;
          if (img && img !== "none" && img.indexOf("gradient") !== -1) {
            const st = stopsOf(img);
            if (st.length) return st;
            return null; // 有渐变但一个色标都切不出（命名色/color-mix/新版语法）→ 不可判定，
                          // 宁可报「测不了」也不退回父级浅底硬算，那只会稳定产出假阳性
          }
          const c = parse(cs.backgroundColor);
          if (c && c.a > 0.85) return [c];
          n = n.parentElement;
        }
        return [{ r: 244, g: 243, b: 236, a: 1 }];
      };
      const bad = [];
      const all = bd ? bd.querySelectorAll("*") : [];
      for (const el of all) {
        if (out.sampled >= 500) break;
        if (el.children.length) continue;
        const txt = (el.textContent || "").trim();
        if (!txt || !vis(el)) continue;
        out.sampled++;
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        if (!fg) continue;
        const bgs = bgOf(el);
        if (!bgs) { out.unknown++; continue; }
        const l1 = lum(fg.r, fg.g, fg.b);
        let ratio = Infinity;
        for (const b of bgs) {
          const l2 = lum(b.r, b.g, b.b);
          const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          if (r < ratio) ratio = r;
        }
        const px = parseFloat(cs.fontSize);
        const large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
        if (ratio < (large ? 3 : 4.5) - 0.01) bad.push({ cls: String(el.className).slice(0, 48) || el.tagName.toLowerCase(), ratio: +ratio.toFixed(2), px, txt: txt.slice(0, 24) });
      }
      // 对比度同样按类聚合：同一个类里的问题只需判读一次，记最差值与一条样例文本
      const byCon = new Map();
      for (const b of bad) {
        const cur = byCon.get(b.cls);
        if (!cur) byCon.set(b.cls, { cls: b.cls, ratio: b.ratio, px: b.px, txt: b.txt, n: 1 });
        else { cur.n++; if (b.ratio < cur.ratio) { cur.ratio = b.ratio; cur.px = b.px; cur.txt = b.txt; } }
      }
      out.contrast = [...byCon.values()].sort((x, y) => x.ratio - y.ratio).slice(0, 24);
      out.contrastCount = bad.length; out.contrastKinds = byCon.size;
      return out;
    })()`);
      } catch (e) { return { error: String(e).slice(0, 140) }; }
    };
    const recordAudit = async (tag) => {
      const a = await auditPage();
      audits[tag] = a;
      console.log("AUDIT " + tag + " overflow=" + a.overflow + " smallTap=" + a.smallTapCount + "/" + (a.smallTapKinds || 0) + "类" + " (豁免" + (a.smallTapExemptCount || 0) + ")" + " contrast=" + a.contrastCount + "/" + (a.contrastKinds || 0) + "类" + " glass=[" + (a.glass ? a.glass.attr || "on" : "?") + "]" + (a.glass ? " 毛玻璃 " + a.glass.blurred + "/" + a.glass.total : "") + (a.error ? " err=" + a.error : ""));
    };
    win.webContents.on("did-finish-load", () => {
      void (async () => {
        await new Promise((r) => setTimeout(r, 2500)); // 等首屏数据
        const probe = await win.webContents.executeJavaScript(`(async () => {
          const t0 = performance.now();
          try { const d = await window.electronAPI.dashboard(); return { ms: Math.round(performance.now() - t0), texts: d.texts.length }; }
          catch (e) { return { error: String(e).slice(0, 160) }; }
        })()`);
        console.log("PROBE dashboard " + JSON.stringify(probe));
        const probe2 = await win.webContents.executeJavaScript(`(async () => { const t0 = performance.now(); try { const r = await window.electronAPI.insights(30); return { ms: Math.round(performance.now() - t0), days: r.days.length }; } catch (e) { return { error: String(e).slice(0, 160) }; } })()`);
        console.log("PROBE insights " + JSON.stringify(probe2));
        const tabs = ["today", "read", "feed", "review", "shadow", "chat", "call", "lex", "syl", "exam", "dash", "voice"];
        const map = { today: "今日", read: "阅读", feed: "好文", review: "复习", shadow: "跟读", chat: "对话", call: "通话", lex: "词库", syl: "考纲", exam: "考试", dash: "仪表盘", voice: "语音" };
        // 页面签名：标题 + 根容器类名。用来确认"真的换页了"再截图。
        const pageSig = () => win.webContents.executeJavaScript(
          `(() => { const h = document.querySelector(".page-head h2"); const p = document.querySelector(".page");`
          + ` return (h ? h.textContent : "") + "|" + (p ? p.className : ""); })()`);
        const clickNav = async (name) => {
          const before = await pageSig();
          const out = await win.webContents.executeJavaScript(`(async () => {
            const btns = [...document.querySelectorAll(".nav-item")];
            const label = ${JSON.stringify(map[name])};
            const b = btns.find(x => x.textContent.trim().startsWith(label));
            if (!b) return { found: false, texts: btns.map(x => x.textContent.trim()).slice(0, 3) };
            b.click();
            return { found: true };
          })()`);
          if (!out.found) { console.log("NAV " + name + " " + JSON.stringify(out)); return out; }
          // 无头窗口处于 hidden 态：React 改完 DOM 不一定立刻产出新的合成帧，
          // 固定短等待会拍到上一个 tab 的旧画面（实测 shadow 在 900ms 时拍到的仍是复习页，3.2s 才是跟读台）。
          // 因此先轮询页面签名变化（最多 9s），再额外留一帧给合成器；dash 另需等插值动画。
          const t0 = Date.now();
          let sig = before, changed = false;
          while (Date.now() - t0 < 9000) {
            await new Promise((r) => setTimeout(r, 250));
            sig = await pageSig();
            if (sig !== before) { changed = true; break; }
          }
          await new Promise((r) => setTimeout(r, name === "dash" ? 9000 : 1600));
          const active = await win.webContents.executeJavaScript(
            `(document.querySelector(".nav-item.active")||{}).textContent`);
          const res = { found: true, active: String(active || "").trim(), sigChanged: changed, sig };
          console.log("NAV " + name + " " + JSON.stringify(res));
          return res;
        };
        for (const t of tabs) {
          try {
            await clickNav(t);
            recordShot(t, await capture());
            await recordAudit(t);
          } catch (e) { console.log("SHOT fail " + t + " " + (e && e.message)); }
        }
        // 窄窗复检：今日 + 词库
        win.setBounds({ width: 900, height: 800 });
        await clickNav("today");
        recordShot("today-narrow", await capture());
        await recordAudit("today-narrow");
        await clickNav("lex");
        recordShot("lex-narrow", await capture());
        await recordAudit("lex-narrow");
        // —— 第二遍：prefers-reduced-motion 下再审一遍（#200）——
        // 为什么必须有这一遍：#190 把 hero 渐变压深后，reduced-motion 兜底里那条
        // .hero-panel 仍留着旧浅蓝（白字 2.83:1），而常规审计从不切动效偏好，
        // 于是这个洞活过了整整两轮对比度整改。降级路径同样要过审。
        // 用 CDP Emulation 按页模拟，而不是重启进程带 --force-prefers-reduced-motion：
        // 省掉一整轮 2.5s 首屏等待，且与常规遍共用同一个窗口。
        try {
          win.webContents.debugger.attach("1.3");
          win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
            features: [{ name: "prefers-reduced-motion", value: "reduce" }],
          });
          const redAudits = {};
          let redIssues = 0;
          for (const t of tabs) {
            try {
              await clickNav(t);
              const a = await auditPage();
              redAudits[t] = a;
              const bad = (a.overflow ? 1 : 0) + (a.contrastCount || 0) + (a.smallTapCount || 0);
              redIssues += bad;
              console.log("AUDIT-RED " + t + " overflow=" + a.overflow + " smallTap=" + a.smallTapCount + " contrast=" + a.contrastCount);
            } catch (e) { console.log("AUDIT-RED fail " + t + " " + (e && e.message)); }
          }
          fs.writeFileSync(path.join(shotDir, "ui-audit-reduced.json"), JSON.stringify(redAudits, null, 2));
          win.webContents.debugger.detach();
          console.log("REDUCED-ISSUES " + redIssues);
        } catch (e) { console.log("REDUCED skip " + (e && e.message)); }
        fs.writeFileSync(path.join(shotDir, "diff.json"), JSON.stringify(diffs, null, 2));
        fs.writeFileSync(path.join(shotDir, "ui-audit.json"), JSON.stringify(audits, null, 2));
        console.log("SHOTS DONE");
        app.exit(0);
      })();
    });
  }
  if (process.env.APP_MIC_DIAG === "1") {
    // 麦克风诊断（APP_MIC_DIAG=1）：逐步上报（MICSTEP），每步带超时，绝不整体卡死
    const stepLog = (_e, _level, message) => {
      if (typeof message === "string" && message.startsWith("MICSTEP")) console.log(message);
    };
    win.webContents.on("console-message", stepLog);
    win.webContents.on("did-finish-load", () => {
      // 用应用自己的 pcm-worklet 源码做真实链路测试：麦克风 → 48k→16k 重采样 → worklet 帧
      let workletCode = "";
      try { workletCode = fs.readFileSync(path.join(__dirname, "src", "call", "pcm-worklet.js"), "utf8"); } catch { /* 无源码则跳过 */ }
      void win.webContents.executeJavaScript(`(async () => {
        const step = (name, data) => console.log("MICSTEP " + name + " " + JSON.stringify(data ?? {}));
        const withTimeout = (p, ms, tag) => Promise.race([
          p, new Promise((_, rej) => setTimeout(() => rej(new Error(tag + " 超时")), ms)),
        ]);
        try {
          const stream = await withTimeout(navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          }), 8000, "getUserMedia");
          const Ctor = window.AudioContext || window.webkitAudioContext;
          const ctx = new Ctor();
          step("ctx", { state: ctx.state, rate: ctx.sampleRate });
          const code = ${JSON.stringify(workletCode)};
          const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
          await withTimeout(ctx.audioWorklet.addModule(url), 6000, "addModule");
          const node = new AudioWorkletNode(ctx, "pcm-stream");
          let frames = 0, maxRms = 0, sumRms = 0;
          node.port.onmessage = (e) => {
            const f = e.data;
            frames++;
            let s = 0;
            for (let i = 0; i < f.length; i++) { const v = f[i] / 32768; s += v * v; }
            const rms = Math.sqrt(s / f.length);
            if (rms > maxRms) maxRms = rms;
            sumRms += rms;
          };
          const silent = ctx.createGain();
          silent.gain.value = 0;
          silent.connect(ctx.destination);
          node.connect(silent);
          ctx.createMediaStreamSource(stream).connect(node);
          await withTimeout(new Promise((r) => setTimeout(r, 5000)), 7000, "collect");
          step("worklet", { frames, frameSamples: 2048, maxRms: +maxRms.toFixed(5), avgRms: +(sumRms / Math.max(1, frames)).toFixed(5) });
          stream.getTracks().forEach((t) => t.stop());
          await ctx.close();
          step("done", {});
        } catch (e) { step("worklet-fail", { e: String(e && (e.name + ": " + e.message)) }); }
      })()`);
    });
    setTimeout(() => { console.log("MICSTEP diag-exit"); app.exit(0); }, 30_000);
  }
}

app.whenReady().then(() => {
  if (!gotInstanceLock) return; // 让第二个进程在 quit 生效前不碰数据库、不占端口
  app.on("second-instance", () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  // app://app/__model__/... → data/models（transformers 经 remoteHost 离线读取）；其余 → dist 前端产物
  const modelsDir = path.join(__dirname, "data", "models");
  modelStore = new ModelStore(modelsDir);
  regressionStore = new RegressionStore(path.join(__dirname, "data"));
  // V8 spike：/__webllm__/ 主进程代理上游（绕开 hf-mirror CORS；服务端可换镜像/接模型商店）
  const webllmProxy = async (req) => {
    const u = new URL(req.url);
    let upstream;
    if (u.pathname.startsWith("/__webllm__/hf/")) {
      upstream = "https://hf-mirror.com/" + u.pathname.slice("/__webllm__/hf/".length) + u.search;
    } else if (u.pathname.startsWith("/__webllm__/lib/")) {
      upstream = "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/"
        + u.pathname.slice("/__webllm__/lib/".length) + u.search;
    } else {
      return new Response("not found", { status: 404 });
    }
    const webllmLibCacheDir = path.join(__dirname, "data", "webllm-lib-cache");
    try { await fs.promises.mkdir(webllmLibCacheDir, { recursive: true }); } catch {}
    if (u.pathname.startsWith("/__webllm__/lib/")) {
      const localLib = safeJoin(webllmLibCacheDir, u.pathname.split("/").pop());
      if (localLib) {
        let has = false; try { has = (await fs.promises.stat(localLib)).isFile(); } catch {}
        if (has) {
          const buf = await fs.promises.readFile(localLib);
          return new Response(buf, {
            status: 200,
            headers: {
              "Cross-Origin-Resource-Policy": "same-origin",
              "Cross-Origin-Embedder-Policy": "require-corp",
              "Content-Type": "application/wasm",
              "Cache-Control": "no-store",
            },
          });
        }
      }
    }
    let r, lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        r = await fetch(upstream, { headers: { "User-Agent": "english-base-electron" } });
        if (r.ok || r.status === 404) break;
        console.log("V8SPIKE proxynonok " + r.status + " attempt=" + attempt + " " + upstream);
      } catch (e) {
        lastErr = e;
        console.log("V8SPIKE proxyfail attempt=" + attempt + " " + upstream + " :: " + e.message);
      }
      await new Promise((x) => setTimeout(x, 800 * (attempt + 1)));
    }
    if (!r) {
      return new Response("upstream fetch failed: " + (lastErr && lastErr.message), { status: 502 });
    }
    const headers = {
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Content-Type": r.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "no-store",
    };
    // lib（wasm）落一份本地磁盘缓存，上游抖动时直接用本地件（生产形态=模型商店本地 serve）
    if (u.pathname.startsWith("/__webllm__/lib/") && r.ok) {
      try {
        const buf = await r.arrayBuffer();
        const cacheFile = safeJoin(webllmLibCacheDir, u.pathname.split("/").pop());
        if (cacheFile) await fs.promises.writeFile(cacheFile, Buffer.from(buf));
        return new Response(buf, { status: r.status, headers });
      } catch (e) {
        console.log("V8SPIKE libcache write fail :: " + e.message);
      }
    }
    return new Response(r.body, { status: r.status, headers });
  };
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    if (u.pathname.startsWith("/__webllm__/")) return webllmProxy(req);
    let file;
    const modelPrefix = "/__model__/";
    if (u.pathname.startsWith(modelPrefix)) {
      file = safeJoin(modelsDir, u.pathname.slice(modelPrefix.length)); // 去掉前导 /，交给严格 safeJoin
    } else {
      const rel = (u.pathname === "/" || u.pathname.endsWith("/")) ? u.pathname.slice(1) + "index.html" : u.pathname.slice(1);
      file = safeJoin(DIST_DIR, rel);
    }
    if (!file) return new Response("forbidden", { status: 403 });
    let st;
    try { st = await fs.promises.stat(file); } catch { return new Response("not found " + u.pathname, { status: 404 }); }
    if (st.isDirectory()) return new Response("not found " + u.pathname, { status: 404 });
    const headers = { "Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "no-store" };
    // 文档与 Worker（.js/.mjs）都必须带 COEP，module worker 才能在隔离上下文中创建
    if (file.endsWith(".html")) {
      headers["Cross-Origin-Opener-Policy"] = "same-origin";
      headers["Cross-Origin-Embedder-Policy"] = "require-corp";
    } else if (file.endsWith(".js") || file.endsWith(".mjs")) {
      headers["Cross-Origin-Embedder-Policy"] = "require-corp";
    }
    return serveFile(file, headers, req);
  });

  // app-media://name → data/media/name（跨源：给 cross-origin CORP，满足页面 COEP；真 Range/206 支持拖动）
  protocol.handle("app-media", async (req) => {
    const name = decodeURIComponent(new URL(req.url).hostname + new URL(req.url).pathname).replace(/^\/+|\/+$/g, "");
    const f = core ? core.mediaPath(name) : null;
    if (!f) return new Response("not found", { status: 404 });
    let exists = false; try { exists = (await fs.promises.stat(f)).isFile(); } catch {}
    if (!exists) return new Response("not found", { status: 404 });
    return serveFile(f, { "Cross-Origin-Resource-Policy": "cross-origin" }, req);
  });
  try {
    try {
      core = new Core(path.join(__dirname, "data"));
    } catch (ce) {
      fatalStartupPage(ce);
      return; // 数据层没起来就不建主窗口
    }
    // 每日首启滚动快照（方案 §20）；备份失败绝不阻断应用启动
    try {
      const r = core.dailyBackup();
      console.log("[backup]", r?.action, r?.file, "kept", Array.isArray(r?.kept) ? r.kept.length : 0);
    } catch (be) {
      console.error("[backup] 每日快照失败（不影响使用）:", be);
    }
    try { core.convRecover(); } catch { /* 恢复失败不影响启动 */ }

    // V8-4 云端真机冒烟（APP_V8_CLOUD_SMOKE=1）：主进程直接验证端点/key/模型，打印流式回复后退出
    if (process.env.APP_V8_CLOUD_SMOKE === "1") {
      void (async () => {
      try {
        const consent = parseConsent(core.getSetting("cloud_consent_json", ""));
        const cipher = core.getSetting("cloud_key_cipher", "");
        if (!cipher) throw new Error("no key saved");
        if (!consent.baseUrl) throw new Error("no endpoint");
        if (!consent.model) throw new Error("no model");
        const key = safeStorage.decryptString(Buffer.from(cipher, "base64"));
        const url = consent.baseUrl.replace(/\/+$/, "") + "/chat/completions";
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 60000);
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: consent.model,
            messages: [
              { role: "system", content: "You are a friendly English tutor. Reply in one short sentence." },
              { role: "user", content: "Say hello and ask how my day is going." },
            ],
            stream: true,
            thinking: { type: "disabled" },
          }),
          signal: ctrl.signal,
        });
        console.log("CLOUD_SMOKE status", resp.status);
        if (!resp.ok || !resp.body) {
          console.log("CLOUD_SMOKE body", await resp.text().catch(() => ""));
          app.exit(2);
          return;
        }
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let out = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value, { stream: true }).split("\n")) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const d = t.slice(5).trim();
            if (d === "[DONE]") continue;
            try { out += JSON.parse(d).choices?.[0]?.delta?.content || ""; } catch { /* noop */ }
          }
        }
        clearTimeout(timer);
        console.log("CLOUD_SMOKE reply:", out);
        console.log("CLOUD_SMOKE DONE");
        app.exit(0);
      } catch (e) {
        console.log("CLOUD_SMOKE ERROR", e?.message || String(e));
        app.exit(3);
      }
      })();
    }

    // S14 通话链路真机冒烟（APP_REALTIME_SMOKE=1）：存储 Key → 主进程 relay → GLM Realtime 端点，
    // 验证建连/session/下行音频流/cancel 收敛后退出（无麦克风，不上行用户音频，只烧极少时长）
    if (process.env.APP_REALTIME_SMOKE === "1") {
      void (async () => {
        try {
          const cipher = core.getSetting("cloud_key_cipher", "");
          if (!cipher) throw new Error("no key saved");
          const key = safeStorage.decryptString(Buffer.from(cipher, "base64"));
          const channel = new MessageChannelMain();
          const client = channel.port1;
          client.start();
          const t0 = Date.now();
          createRelay({
            port: channel.port2, apiKey: key,
            log: (l, m) => console.log("REALTIME_SMOKE relay:" + l, m),
          });
          let audioBytes = 0, textChars = 0, gotReady = false, gotDone = false, sawError = "";
          let transcriptIn = "", transcriptOut = "";
          const seenTypes = new Set();
          client.on("message", (e) => {
            const m = e.data;
            if (!m || typeof m !== "object") return;
            if (m.kind === "ready") {
              gotReady = true;
              console.log("REALTIME_SMOKE ready connectMs=" + (Date.now() - t0));
              // 注入语音素材（APP_CALL_CLIP 可选，默认英文 clip），16k f32 → int16 2048 样本帧 + 尾部静音
              try {
                const clipName = process.env.APP_CALL_CLIP || "clip-00-eng-1.f32";
                const f32File = path.join(__dirname, "spike-v8", "smartturn-clips", clipName);
                const raw = fs.readFileSync(f32File);
                const f32 = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
                const n = Math.floor(f32.length / 2048) * 2048;
                const i16 = new Int16Array(Math.floor(n));
                for (let i = 0; i < n; i++) {
                  const v = Math.max(-1, Math.min(1, f32[i]));
                  i16[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
                }
                for (let off = 0; off < n; off += 2048) {
                  const frame = i16.buffer.slice(off * 2, (off + 2048) * 2);
                  // 主进程 MessagePortMain 的 transfer 列表只收端口对象，缓冲走消息体克隆
                  client.postMessage({ kind: "audio", format: "pcm", sampleRate: 16000, buffer: frame });
                }
                for (let k = 0; k < 18; k++) { // ~2.3s 尾部静音，触发 speech_stopped/committed
                  const sil = new ArrayBuffer(4096);
                  client.postMessage({ kind: "audio", format: "pcm", sampleRate: 16000, buffer: sil });
                }
                console.log("REALTIME_SMOKE speech injected, frames=" + (n / 2048) + "+18");
              } catch (se) {
                console.log("REALTIME_SMOKE inject fail", se?.message || String(se));
              }
            } else if (m.kind === "audioDelta") {
              audioBytes += (m.buffer && m.buffer.byteLength) || 0;
            } else if (m.kind === "event") {
              const ev = m.event || {};
              if (!seenTypes.has(ev.type)) { seenTypes.add(ev.type); }
              if (ev.type === "response.audio_transcript.delta" || ev.type === "response.text.delta") {
                textChars += String(ev.delta || "").length;
                if (ev.type === "response.audio_transcript.delta") transcriptOut += String(ev.delta || "");
              } else if (ev.type === "response.done") gotDone = true;
              else if (ev.type === "error") sawError = JSON.stringify(ev.error || {});
              else if (ev.type === "conversation.item.input_audio_transcription.completed") {
                transcriptIn = String(ev.transcript || "");
              }
            } else if (m.kind === "serverError") {
              sawError = "[" + m.code + "] " + m.message;
            } else if (m.kind === "error") {
              console.log("REALTIME_SMOKE relay_error", m.message);
              app.exit(4);
            }
          });
          client.postMessage({ kind: "connect", session: {
            input_audio_format: "wav",
            output_audio_format: "pcm",
            instructions: "You are an English speaking partner. Reply with one short sentence.",
            voice: "tongtong",
            turn_detection: { type: "server_vad" },
            beta_fields: { chat_mode: "audio", tts_source: "e2e" },
          } });
          setTimeout(() => {
            console.log("REALTIME_SMOKE eventTypes=" + [...seenTypes].join(","));
            console.log("REALTIME_SMOKE ASR输入=" + transcriptIn.slice(0, 80));
            console.log("REALTIME_SMOKE 回复=" + transcriptOut.slice(0, 160));
            console.log("REALTIME_SMOKE RESULT ready=" + gotReady + " audioBytes=" + audioBytes
              + " textChars=" + textChars + " done=" + gotDone + (sawError ? " error=" + sawError : ""));
            try { client.postMessage({ kind: "stop" }); } catch { /* noop */ }
            const ok = gotReady && audioBytes > 1000 && textChars > 0 && gotDone;
            console.log(ok ? "REALTIME_SMOKE DONE" : "REALTIME_SMOKE FATAL");
            app.exit(ok ? 0 : 4);
          }, 25000);
        } catch (e) {
          console.log("REALTIME_SMOKE ERROR", e?.message || String(e));
          app.exit(3);
        }
      })();
    }

    const api = {
      annotate: ({ text, title, source }) => core.annotateAndSave(text, title, source),
      // 抓取网页正文（fetchUrl 与 S4 feedImport 共用）
      fetchReadable: async (url) => {
        const u = String(url || "").trim();
        if (!/^https?:\/\//i.test(u)) throw new Error("只支持 http/https 链接");
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        try {
          const res = await fetch(u, {
            signal: ctrl.signal, redirect: "follow",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          const type = res.headers.get("content-type") || "";
          if (type && !/html|text|xml/i.test(type)) throw new Error(`该链接不是网页（${type}），文件请走文件导入`);
          const html = await res.text();
          const ex = extractReadable(html, u);
          if (ex.chars < 200) throw new Error("抽取正文过短（" + ex.chars + " 字），可能是脚本渲染页：可用浏览器扩展一键发送，或复制正文文本导入");
          return { ...ex, url: u };
        } catch (e) {
          if (e.name === "AbortError") throw new Error("抓取超时（20s）");
          throw e;
        } finally { clearTimeout(timer); }
      },
      fetchUrl: async ({ url }) => api.fetchReadable(url),
      lookup: ({ word, label, phrase, textId }) => core.lookup(word, label, phrase, textId),
      dashboard: () => core.dashboard(),
      listTexts: (p) => core.listTexts(p || {}),
      getText: ({ id }) => core.getText(id),
      textDelete: ({ id }) => core.deleteText(id),
      sessionBegin: (o) => core.beginSession(o),
      sessionHeartbeat: ({ sessionKey, activeMs, amount, locator }) =>
        core.heartbeatSession(sessionKey, { activeMs, amount, locator }),
      sessionClose: ({ sessionKey, activeMs, amount, locator }) =>
        core.closeSession(sessionKey, { activeMs, amount, locator }),
      // —— V8-2b 对话会话/轮次 ——
      convCreate: (o) => core.convCreate(o),
      convList: ({ limit }) => core.convList(limit),
      convGet: ({ sessionKey }) => core.convGet(sessionKey),
      convAddTurn: (o) => core.convAddTurn(o),
      convUpdateTurn: (o) => core.convUpdateTurn(o),
      convClose: (o) => core.convClose(o),
      // —— V8-2d 云端显式同意 + safeStorage ——
      cloudGetConsent: () => ({
        consent: parseConsent(core.getSetting("cloud_consent_json", "")),
        keySet: !!core.getSetting("cloud_key_cipher", ""),
        encryptionAvailable: safeStorage.isEncryptionAvailable(),
      }),
      cloudSaveConsent: ({ consent }) => {
        const clean = normalizeConsent(consent);
        core.setSetting("cloud_consent_json", JSON.stringify(clean));
        return clean;
      },
      cloudSetKey: ({ apiKey }) => {
        const key = String(apiKey || "").trim();
        if (!key) throw new Error("API key 为空");
        if (!safeStorage.isEncryptionAvailable()) throw new Error("系统加密能力不可用，无法安全保存 key");
        core.setSetting("cloud_key_cipher", safeStorage.encryptString(key).toString("base64"));
        return { keySet: true };
      },
      cloudClearKey: () => {
        core.setSetting("cloud_key_cipher", "");
        return { keySet: false };
      },
      // V8-4：解密返回 key 明文供云端请求（仅在用户勾选授权、发起云端调用时）
      cloudGetKey: () => {
        const cipher = core.getSetting("cloud_key_cipher", "");
        if (!cipher) return "";
        if (!safeStorage.isEncryptionAvailable()) throw new Error("系统加密能力不可用，无法读取 key");
        return safeStorage.decryptString(Buffer.from(cipher, "base64"));
      },
      // 连通性自检（#206）：必须在主进程做——渲染层拿不到 key 明文。
      // 只发一次最小请求（1 token），不携带任何学习数据。
      cloudProbe: async ({ baseUrl, model }) => {
        const url = String(baseUrl || "").trim().replace(/\/+$/, "");
        const m = String(model || "").trim();
        if (!url || !m) return { ok: false, reason: "缺少端点或模型名" };
        const cipher = core.getSetting("cloud_key_cipher", "");
        if (!cipher) return { ok: false, reason: "未保存 API Key" };
        if (!safeStorage.isEncryptionAvailable()) return { ok: false, reason: "系统加密能力不可用" };
        const key = safeStorage.decryptString(Buffer.from(cipher, "base64"));
        try {
          const resp = await fetch(url + "/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model: m, stream: false, max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status}` };
          return { ok: true, model: m };
        } catch (e) {
          return { ok: false, reason: String((e && e.message) || e).slice(0, 80) };
        }
      },
      resumePut: ({ scope, refId, locator, contentHash }) =>
        core.saveResumeState(scope, refId, locator, contentHash),
      resumeGet: ({ scope }) => core.getResumeState(scope),
      builtinsList: () => core.listBuiltins(),
      builtinGet: ({ id }) => core.getBuiltin(id),
      transForText: ({ textId }) => core.transForText(textId),
      createNote: (p) => core.createNote(p),
      createStandaloneNote: (p) => core.createStandaloneNote(p),
      createShadowNote: (p) => core.createShadowNote(p),
      captureAsset: (p) => core.captureAsset(p),
      // #208 好文题材分类
      feedItemsNeedingTopic: ({ limit } = {}) => core.feedItemsNeedingTopic(limit),
      feedApplyTopics: ({ rows } = {}) => core.applyTopics(rows),
      feedTopicsOverview: () => core.feedTopicsOverview(),
      feedItemsByTopic: ({ topic, limit } = {}) => core.feedItemsByTopic(topic, limit),
      pruneStaleFeedItems: ({ days } = {}) => core.pruneStaleFeedItems(days),
      debriefAutoArchive: (p) => core.debriefAutoArchive(p),
    phonetics: (p) => core.phoneticsFor(p.words),
      addPronProductionCard: ({ assetId }) => core.addPronProductionCard(assetId),
      findAssetByCanonical: ({ kind, canonical }) => core.findAssetByCanonical(kind, canonical),
      addAssetEvidence: (p) => core.addAssetEvidence(p),
      debriefPut: (p) => core.debriefPut(p),
      debriefList: () => core.debriefList(),
      debriefGet: ({ draftKey }) => core.debriefGet(draftKey),
      debriefSetStatus: ({ draftKey, status }) => core.debriefSetStatus(draftKey, status),
      textDebriefCandidates: ({ textId }) => core.textDebriefCandidates(textId),
      textLearnedSummary: ({ textId }) => core.textLearnedSummary(textId),
      conversationSummary: ({ sessionKey }) => core.conversationSummary(sessionKey),
      detectUsedAssets: (p) => core.detectUsedAssets(p),
      assetUseCounts: ({ assetId }) => core.assetUseCounts(assetId),
      priorityList: (p) => core.priorityList(p || {}),
      examWeakList: (p) => core.examWeakList(p || {}),
      shadowPassedForSentences: (p) => core.shadowPassedForSentences(p || {}),
      shadowPassedForTurn: ({ turnId }) => core.shadowPassedForTurn(turnId),
      getDue: ({ limit }) => core.getDue(limit),
      answer: (p) => core.answer(p),
      counts: () => core.counts(),
      todayBrief: () => core.todayBrief(),
      recycleCandidates: (p) => core.recycleCandidates(p),
      recycleAdd: (p) => core.recycleAdd(p),
      shadowPractice: (p) => core.shadowPractice(p),
      shadowDue: (p) => core.shadowDue(p?.limit),
      shadowDismiss: (id) => core.shadowDismiss(id),
      assessmentBlueprints: () => core.assessmentBlueprints(),
      assessmentStart: (id) => core.assessmentStart(id),
      // 渲染层走 camelCase（formId/activeMs/translatedParas），在此归一为 core 的 snake_case
      assessmentFinish: (p) => core.assessmentFinish({
        form_id: p.formId ?? p.form_id,
        active_ms: p.activeMs ?? p.active_ms,
        lookups: p.lookups,
        translated_paras: p.translatedParas ?? p.translated_paras,
        answers: p.answers,
      }),
      assessmentHistory: ({ limit } = {}) => core.assessmentHistory(limit),
      insights: ({ days } = {}) => core.insights(days),
      dayTimeline: ({ key } = {}) => core.dayTimeline(key),
      listLexemes: (p) => core.listLexemes(p),
      lexemeDetail: ({ id }) => core.lexemeDetail(id),
      relatedWords: ({ lemma }) => core.relatedWords(lemma),
      syllabusList: () => core.syllabusList(),
      syllabusWords: (p) => core.syllabusWords(p),
      importPaper: (p) => core.importPaper(p.md, p.audioPaths || []),
      listPapers: () => core.listPapers(),
      getPaper: ({ id }) => core.getPaper(id),
      mediaUrl: ({ name }) => {
        const f = core.mediaPath(name);
        return f ? `app-media://${encodeURIComponent(name)}/` : null;
      },
      gradeAttempt: (p) => core.gradeAttempt(p.paperId, p.answers, p.startedAt),
      listWrong: ({ state }) => core.listWrong(state),
      wrongDueCount: () => core.wrongDueCount(),
      setWrongReason: (p) => core.setWrongReason(p.id, p.reason),
      redoWrong: (p) => core.redoWrong(p.id, p.picked),
      archiveWrong: ({ id }) => core.archiveWrong(id),
      // —— V6 语音模型仓库 ——
      modelCatalog: () => modelStore.catalog(),
      modelStatus: ({ id }) => ({ state: modelStore.status(id), manifest: modelStore.manifest(id) }),
      modelEnsure: async ({ id }) => modelStore.ensure(id, (ev) => {
        if (win && !win.isDestroyed()) win.webContents.send("model-progress", { id, ...ev });
      }),
      modelCancel: ({ id }) => ({ cancelled: modelStore.cancel(id) }),
      modelDelete: ({ id }) => modelStore.deleteModel(id),
      modelGetMirror: () => modelStore.getMirror(),
      modelSetMirror: ({ mirror }) => ({ mirror: modelStore.setMirror(mirror) }),
      modelGetMtMirror: () => ({ mirror: modelStore.getMtMirror() }),
      modelSetMtMirror: ({ mirror }) => ({ mirror: modelStore.setMtMirror(mirror) }),
      modelBaseUrl: () => "app://app/__model__",
      // —— 语音回归集：录音样本持久化与跨模型评测 ——
      regressionList: () => regressionStore.list(),
      regressionSave: (p) => regressionStore.save(p),
      regressionRead: ({ id }) => regressionStore.read(id),
      regressionDelete: ({ id }) => regressionStore.remove(id),
      regressionSetEval: (p) => regressionStore.setEval(p),
      // ASR 首次加载前：对可信清单做深校验，返回运行时所需 base/revision（不通过则要求重新下载）
      modelRuntime: async ({ id }) => {
        const spec = modelStore.spec(id);
        const v = await modelStore.verifyActive(id);
        if (!v.ok) throw new Error("模型未通过完整性校验，请重新下载");
        return { base: "app://app/__model__", repo: spec.repo, revision: spec.revision,
          files: spec.files.map((f) => f.path), dtype: spec.dtype, multilingual: !!spec.multilingual, state: "installed" };
      },
      // —— S7b 离线机翻缓存 ——
      mtCacheGet: ({ textId }) => core.translationGetAll(textId),
      mtCachePut: (p) => core.translationPut(p),
      mtCacheClear: ({ textId }) => core.translationClear(textId),
      // —— S3 每日好文 RSS ——
      feedsList: () => core.feeds.listFeeds(),
      feedsRefresh: (p) => core.feeds.refreshAll({ force: !!p.force }),
      feedsRefreshOne: (p) => core.feeds.refreshFeed(p.id, { force: !!p.force }),
      feedsAdd: (p) => core.feeds.addFeed(p.url, p.title || ""),
      feedsRemove: ({ id }) => core.feeds.removeFeed(id),
      feedsToggle: (p) => core.feeds.toggleFeed(p.id, !!p.enabled),
      feedItems: (p) => core.feeds.listItems({ status: p.status, limit: p.limit || 60, offset: p.offset || 0 }),
      feedItemStatus: (p) => core.feeds.setStatus(p.feedId, p.guid, p.status, p.textId ?? null),
      // S4：后台估算最新条目的覆盖率/CEFR
      feedAnalyze: (p) => core.analyzeFeedItems({ limit: p.limit || 30, recompute: !!p.recompute }),
      // S4：一键加入精读——抓正文 → 入库标注 → 回写 imported+text_id（已导入直接返回）
      feedImport: async (p) => {
        const item = core.feeds.getItem(p.feedId, p.guid);
        if (!item) throw new Error("推荐条目不存在");
        if (item.status === "imported" && item.text_id) return { textId: item.text_id, duplicated: true };
        const ex = await api.fetchReadable(item.link);
        const feed = core.feeds.listFeeds().find((f) => f.id === p.feedId);
        const a = core.annotateAndSave(ex.text, item.title || ex.title, {
          kind: "feed", label: feed?.title || "", uri: item.link, externalRef: `${p.feedId}|${p.guid}`,
        });
        core.feeds.setStatus(p.feedId, p.guid, "imported", a.text_id);
        return { textId: a.text_id, title: item.title || ex.title, truncated: !!ex.truncated, chars: ex.chars };
      },
      importFiles: async ({ paths }) => {
        const results = [];
        for (const p of paths || []) {
          const base = path.basename(p);
          try {
            const { text, truncated } = await extractText(p);
            const title = base.replace(/\.[^.]+$/, "");
            // S6：文件导入也走完整标注（stats/CEFR/来源），不再只存原文
            const a = core.annotateAndSave(text, title, { kind: "file", uri: p, externalRef: base });
            results.push({ file: base, ok: true, textId: a.text_id, truncated });
          } catch (e) {
            results.push({ file: base, ok: false, error: e && e.message ? e.message : String(e) });
          }
        }
        return results;
      },
    };
    // —— S14-1B Realtime 主进程中继（唯一正式鉴权路径：key 只存主进程，音频走 MessagePort/ArrayBuffer）——
    const relayLog = (level, message) => {
      try {
        fs.appendFileSync(path.join(__dirname, "data", "main.log"),
          new Date().toISOString() + " [relay:" + level + "] " + String(message) + "\n");
      } catch { /* ignore */ }
    };
    ipcMain.on("realtime-open", (event, opts) => {
      try {
        const consent = parseConsent(core.getSetting("cloud_consent_json", ""));
        if (!consent.audio) {
          event.senderFrame.postMessage("realtime-port-error", { message: "请先在云端设置中开启「录音原文上云」同意" });
          return;
        }
        const cipher = core.getSetting("cloud_key_cipher", "");
        if (!cipher) {
          event.senderFrame.postMessage("realtime-port-error", { message: "尚未保存 API Key" });
          return;
        }
        if (!safeStorage.isEncryptionAvailable()) {
          event.senderFrame.postMessage("realtime-port-error", { message: "系统加密能力不可用" });
          return;
        }
        const key = safeStorage.decryptString(Buffer.from(cipher, "base64"));
        const channel = new MessageChannelMain();
        createRelay({ port: channel.port2, apiKey: key, endpoint: opts?.endpoint, log: relayLog });
        event.senderFrame.postMessage("realtime-port", null, [channel.port1]);
      } catch (e) {
        try { event.senderFrame.postMessage("realtime-port-error", { message: e && e.message ? e.message : String(e) }); }
        catch { /* noop */ }
      }
    });
    ipcMain.handle("cmd", (_e, name, args) => {
      const fn = api[name];
      if (!fn) throw new Error(`unknown command: ${name}`);
      return fn(args ?? {});
    });

    startIngestServer();

    if (process.env.APP_REALTIME_SMOKE !== "1") createWindow(); // 通话链路冒烟不开窗口（主进程直驱 relay）

    // S3 每日好文：启动后静默刷新过期源（>6h 未同步；失败只记 last_error，不打扰用户）
    core.feeds.refreshAll().catch((e) => {
      try {
        require("node:fs").appendFileSync(path.join(__dirname, "data", "main.log"),
          new Date().toISOString() + " feeds refresh: " + (e && e.stack ? e.stack : String(e)) + "\n");
      } catch { /* ignore */ }
    });
  } catch (err) {
    fatalStartupPage(err);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// —— V4 浏览器扩展接收服务：仅绑 127.0.0.1，扩展把抽取到的正文 POST 进来直接入库 ——
const INGEST_PORT = 47823;
function startIngestServer() {
  const srv = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (req.method !== "POST" || req.url !== "/ingest") { res.writeHead(404); return res.end(); }
    let body = "";
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { res.writeHead(413); res.end("too large"); req.destroy(); return; }
      body += c;
    });
    req.on("end", () => {
      try {
        const p = JSON.parse(body || "{}");
        const text = String(p.text || "").trim();
        if (text.length < 100) { res.writeHead(422); return res.end(JSON.stringify({ ok: false, error: "正文过短" })); }
        if (text.length > MAX_CHARS) { res.writeHead(422); return res.end(JSON.stringify({ ok: false, error: "超出长度上限" })); }
        const stats = core.annotateAndSave(text.slice(0, MAX_CHARS), String(p.title || "").slice(0, 120) || undefined, {
          kind: "extension",
          label: String(p.title || "").slice(0, 120),
          uri: String(p.url || ""),
          externalRef: String(p.url || ""),
        });
        const payload = { ok: true, stats };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
        if (win && !win.isDestroyed()) win.webContents.send("ingested", { title: p.title || "", url: p.url || "", at: Date.now() });
        console.log("[ingest] 收到扩展文章:", (p.title || text.slice(0, 24)).slice(0, 60));
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    });
  });
  srv.on("error", (e) => console.error("[ingest] 本地接收服务启动失败（不影响应用）:", e.message));
  srv.listen(INGEST_PORT, "127.0.0.1", () => console.log("[ingest] 扩展接收服务 http://127.0.0.1:" + INGEST_PORT));
}
