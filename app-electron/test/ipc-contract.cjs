// IPC 契约测试：桩掉 electron，加载真实 main.cjs，捕获 ipcMain.handle("cmd") 处理器，
// 用"渲染层经 preload 发出的原始形态"逐条打进去，断言 core 收到的参数正确。
// 背景：曾出现 assessmentFinish（camelCase vs snake_case）、assessmentHistory/debriefGet
//（对象 vs 裸值）三处边界错位——直连 core 的单测全绿但渲染层必挂，本测试专锁这一层。
// 运行：node test/ipc-contract.cjs
const Module = require("node:module");
const path = require("node:path");
const assert = require("node:assert");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

// —— 记录型 core 桩：任何方法调用都记录 (方法名, 参数)，返回 Promise 兼容同步/异步两种用法 ——
const coreCalls = [];
const rec = (name) => (...args) => {
  coreCalls.push([name, ...args]);
  return Promise.resolve({});
};
const recordingCore = new Proxy({}, {
  get(_t, prop) {
    if (prop === "feeds") {
      return new Proxy({}, { get: (_t2, p2) => rec("feeds." + String(p2)) });
    }
    return rec(String(prop));
  },
});
class FakeCore { constructor() { return recordingCore; } }

// —— electron 桩：捕获 cmd 处理器与 preload 暴露面 ——
let cmdHandler = null;
let preloadApi = null;
const unknownCommands = [];
const electronStub = {
  app: {
    setPath() {}, whenReady: () => Promise.resolve(), on() {}, quit() {}, exit() {},
    requestSingleInstanceLock: () => true,
    getPath: () => path.join(__dirname, "..", "data"),
  },
  BrowserWindow: class { constructor() { this.webContents = { on() {}, send() {} }; } loadURL() { return Promise.resolve(); } },
  ipcMain: {
    handle(_channel, fn) { cmdHandler = fn; },
    on() {},
  },
  Menu: { setApplicationMenu() {} },
  protocol: { registerSchemesAsPrivileged() {}, handle() {} },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: () => Buffer.from("x"), decryptString: () => "k" },
  contextBridge: { exposeInMainWorld(_n, api) { preloadApi = api; } },
  ipcRenderer: {
    // preload 的 call() 走 invoke("cmd", name, args)：在此转发给真实 cmd 处理器并记录 unknown command
    invoke: async (_ch, name, args) => {
      if (cmdHandler) {
        try { await cmdHandler(null, name, args ?? {}); }
        catch (e) { if (String(e.message).includes("unknown command")) unknownCommands.push(name); }
      }
      return {};
    },
    send() {}, // realtime-open 走单向 IPC（主进程回 MessagePort），桩掉即可
    on() {}, removeListener() {},
  },
  webUtils: { getPathForFile: () => "" },
};

// —— 拦截 require：electron → 桩；./core.cjs → 记录型桩 ——
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return electronStub;
  if (request === "./core.cjs" && parent && String(parent.filename).endsWith("main.cjs")) {
    return { Core: FakeCore };
  }
  return origLoad(request, parent, isMain);
};

require("../main.cjs");
require("../preload.cjs"); // 同一 electron 桩下加载 preload，捕获 contextBridge 暴露面
Module._load = origLoad;

const ready = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await ready(150); // 等 whenReady 回调注册完 cmd 处理器
  check("main.cjs 注册了 cmd 处理器", typeof cmdHandler === "function");

  // 1) assessmentFinish：渲染层 camelCase → core 期望 snake_case（此前交卷必挂）
  coreCalls.length = 0;
  await cmdHandler(null, "assessmentFinish", {
    formId: "form-a1", activeMs: 65000, lookups: 3, translatedParas: 2, answers: [0, 1, 3],
  });
  const af = coreCalls.find(([n]) => n === "assessmentFinish");
  check("assessmentFinish 透传并归一字段", !!af && af[1].form_id === "form-a1"
    && af[1].active_ms === 65000 && af[1].translated_paras === 2 && af[1].lookups === 3,
    JSON.stringify(af && af[1]));

  // 2) assessmentHistory：preload 包 {limit} → main 必须解构成数字（此前对象直入 SQL 绑定抛错）
  coreCalls.length = 0;
  await cmdHandler(null, "assessmentHistory", { limit: 10 });
  const ah = coreCalls.find(([n]) => n === "assessmentHistory");
  check("assessmentHistory 解构 limit", !!ah && ah[1] === 10, JSON.stringify(ah && ah[1]));

  // 3) debriefGet：preload 包 {draftKey} → main 必须解构成字符串
  coreCalls.length = 0;
  await cmdHandler(null, "debriefGet", { draftKey: "reading:12" });
  const dg = coreCalls.find(([n]) => n === "debriefGet");
  check("debriefGet 解构 draftKey", !!dg && dg[1] === "reading:12", JSON.stringify(dg && dg[1]));

  // 4) preload 裸值特例三件套：数组/数字/字符串原样直达 core
  coreCalls.length = 0;
  await cmdHandler(null, "recycleAdd", ["word1", "word2"]);
  await cmdHandler(null, "shadowDismiss", 42);
  await cmdHandler(null, "assessmentStart", "blueprint-b1");
  check("recycleAdd 裸数组直达", coreCalls.some(([n, a]) => n === "recycleAdd" && Array.isArray(a) && a[0] === "word1"));
  check("shadowDismiss 裸数字直达", coreCalls.some(([n, a]) => n === "shadowDismiss" && a === 42));
  check("assessmentStart 裸字符串直达", coreCalls.some(([n, a]) => n === "assessmentStart" && a === "blueprint-b1"));

  // 5) 全表命令存在性：preload 暴露面里所有走 IPC 的方法经 invoke 转发后都不得报 unknown command
  // （事件监听 onIngested/onModelProgress 与本地 pathForFile 不走 cmd 通道，跳过）
  await ready(50);
  assert.ok(preloadApi, "preload 暴露面已捕获");
  const skip = new Set(["onIngested", "onModelProgress", "pathForFile"]);
  for (const name of Object.keys(preloadApi)) {
    if (typeof preloadApi[name] !== "function" || skip.has(name)) continue;
    try { await preloadApi[name]({}); } catch { /* 业务参数校验错误不关心，只关心 unknown command */ }
  }
  check("preload 全部 IPC 方法在 main 已注册（无 unknown command）", unknownCommands.length === 0,
    unknownCommands.join(", ") || "全部命中");

  console.log(`\nipc-contract: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
