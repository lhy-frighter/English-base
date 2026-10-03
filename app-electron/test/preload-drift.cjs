// test/preload-drift.cjs — preload 暴露面与 TS 声明必须逐键一致（#197）
//
// 背景：preload 通过 contextBridge 暴露 111 个方法，而 src/api.ts 里手写了一份同形状的
// 声明。两份定义没有任何机制绑定，必然漂——实际已经漂了：
// `realtimeOpen` 只在 preload 里有，api.ts 漏了，于是 call-engine 只好自己手写
// `as unknown as { electronAPI: { realtimeOpen: ... } }`。类型系统完全看不见这个缺口。
//
// 本测试把「运行时真实暴露面」与「api.ts 声明的键集」对齐，任何一侧新增/删除而另一侧
// 没跟上时立刻失败。它和 ipc-contract 是互补的：那个锁「preload 方法有没有对应的主进程
// 处理器」，这个锁「preload 有没有在 TS 侧被声明出来」。
"use strict";
const fs = require("node:fs");
const path = require("node:path");

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("PASS", name); }
  else { fail++; console.error("FAIL", name, extra !== undefined ? extra : ""); }
}

const ROOT = path.join(__dirname, "..");

// —— 1) 从 preload.cjs 源码解析真实暴露面 ——
const preloadSrc = fs.readFileSync(path.join(ROOT, "preload.cjs"), "utf8");
const expose = preloadSrc.match(/exposeInMainWorld\(\s*"[^"]+"\s*,\s*\{([\s\S]*?)\n\}\s*\)/);
check("能在 preload.cjs 里定位 exposeInMainWorld 暴露块", !!expose);
if (!expose) { console.log(`\npreload-drift: ${pass} passed, ${fail} failed`); process.exit(1); }

const body = expose[1];
// 暴露块的键都是「行首两空格 + name: 」；嵌套对象（feeds.* 等）用 4 空格缩进，按缩进过滤掉
const preloadKeys = new Set();
for (const line of body.split("\n")) {
  const m = line.match(/^ {2}([a-zA-Z][a-zA-Z0-9]*):/);
  if (m) preloadKeys.add(m[1]);
}

// —— 2) 从 api.ts 解析 TS 声明的键集 ——
const apiSrc = fs.readFileSync(path.join(ROOT, "src", "api.ts"), "utf8");
const start = apiSrc.indexOf("export const api = (window as any).electronAPI as {");
check("能在 api.ts 里定位 electronAPI 声明块", start > 0);
const openBrace = apiSrc.indexOf("{", start);
let depth = 0, end = openBrace;
for (let i = openBrace; i < apiSrc.length; i++) {
  if (apiSrc[i] === "{") depth++;
  else if (apiSrc[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
}
const decl = apiSrc.slice(openBrace, end);
const tsKeys = new Set();
for (const line of decl.split("\n")) {
  const m = line.match(/^ {2}([a-zA-Z][a-zA-Z0-9]*):/);
  if (m) tsKeys.add(m[1]);
}

console.log(`（preload 暴露 ${preloadKeys.size} 个 / api.ts 声明 ${tsKeys.size} 个）`);

// —— 3) 双向比对 ——
const missingInTs = [...preloadKeys].filter((k) => !tsKeys.has(k)).sort();
const missingInPreload = [...tsKeys].filter((k) => !preloadKeys.has(k)).sort();

check("preload 每个方法都在 api.ts 有声明", missingInTs.length === 0,
  missingInTs.length ? "缺: " + missingInTs.join(", ") : "");
check("api.ts 没有声明 preload 不存在的方法", missingInPreload.length === 0,
  missingInPreload.length ? "多: " + missingInPreload.join(", ") : "");
check("两侧键数一致", preloadKeys.size === tsKeys.size,
  `${preloadKeys.size} vs ${tsKeys.size}`);

// —— 4) 回归锚点：realtimeOpen 这条曾经漏过（call-engine 被迫手写 as unknown as）——
//     若将来又被删掉声明，下面两条会先报警
check("realtimeOpen 在 preload 暴露面", preloadKeys.has("realtimeOpen"));
check("realtimeOpen 在 api.ts 声明", tsKeys.has("realtimeOpen"));

// —— 5) 渲染层不应再有手写的 electronAPI 形状断言（那正是漂移的产物）——
const callers = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { walk(p); continue; }
    if (/\.tsx?$/.test(f.name)) callers.push(p);
  }
};
walk(path.join(ROOT, "src"));
const offenders = [];
for (const p of callers) {
  const t = fs.readFileSync(p, "utf8");
  // 匹配 `electronAPI: {` 这种就地手写形状（api.ts 里那处正式绑定不算）
  const lines = t.split("\n");
  lines.forEach((l, i) => {
    if (/electronAPI\s*:\s*\{/.test(l) && !/electronAPI as /.test(l)) {
      offenders.push(`${path.relative(ROOT, p)}:${i + 1}`);
    }
  });
}
check("渲染层没有就地手写 electronAPI 形状", offenders.length === 0, offenders.join(", "));

console.log(`\npreload-drift: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);