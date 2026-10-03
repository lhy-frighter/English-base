// test/silent-catch.cjs — 静默吞异常的白名单守卫（#201）
//
// 背景：这个代码库里曾有 100+ 处 `.catch(() => {})`。它们的危害不是「报错」，
// 而是**什么都看不见**：写失败时数据丢了，用户不知道、日志里也没有。
// 本轮把其中属于「数据写入 / 用户可见读取」的部分全部改成 console.error 或 toast，
// 只留下真正可以忽略的一类：fire-and-forget 的资源释放与可选增强初始化。
//
// 白名单是有意的，不是「懒得改」：
//   inference.release(...)  释放推理 worker，失败后没有可做的补救，也没有用户可见后果
//   vad.destroy()           卸载 VAD 控制器，同上
//   worker.terminate()      停 worker，同上
//   smartTurn.init()        可选增强（断句模型），加载不到就该安静降级，不该打扰用户
//
// 新增白名单条目前请先问：失败了用户需不需要知道？需要就别加。
"use strict";
const fs = require("node:fs");
const path = require("node:path");

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("PASS", name); }
  else { fail++; console.error("FAIL", name, extra !== undefined ? extra : ""); }
}

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");

// 允许静默的调用形态：释放/销毁/可选增强初始化
const ALLOW = [
  /inference\.release\(/,
  /vad\.destroy\(/,
  /\.destroy\(\)\.catch/,
  /worker\.terminate\(/,
  /smartTurn\.init\(\)/,
];

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== "spike-v8") walk(p, out); continue; }
    if (/\.tsx?$/.test(f.name)) out.push(p);
  }
  return out;
}

const offenders = [];
let total = 0;
for (const file of walk(SRC)) {
  const raw = fs.readFileSync(file, "utf8");
  // 先剥注释：文档里会引用 .catch(() => {}) 这个字符串，不能当成代码
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    if (!line.includes("catch(() => {})")) return;
    total++;
    if (ALLOW.some((re) => re.test(line))) return;
    offenders.push(`${path.relative(ROOT, file)}:${i + 1}  ${line.trim().slice(0, 78)}`);
  });
}

check("静默 catch 只出现在白名单内的 fire-and-forget 清理类", offenders.length === 0,
  "\n     " + offenders.join("\n     "));
console.log(`（扫描到 .catch(() => {}) 共 ${total} 处，其中 ${total - offenders.length} 处属白名单清理）`);

// 对照：确保证守卫不是空过——把一个数据写入塞进去必须被抓到
const probe = 'api.debriefPut({ a: 1 }).catch(() => {});';
check("对照组：数据写入上的静默 catch 会被判违规", !ALLOW.some((re) => re.test(probe)));
check("对照组：白名单形态确实被放行", ALLOW.some((re) => re.test('inference.release("tts").catch(() => {});')));

console.log(`\nsilent-catch: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);