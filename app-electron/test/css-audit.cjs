// CSS 防腐化审计（ui-design-flow 优化1）：作用域感知的重复选择器检测 + 花括号平衡 + 孤儿类报告。
// 背景：多轮 AI 并行编辑曾产生同文件重复选择器与分支丢失（交接文档 #181/#182）。
// 运行：node test/css-audit.cjs
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
let pass = 0, fail = 0;
function check(name, cond, extra) { console.log((cond ? "PASS" : "FAIL"), name, extra ?? ""); cond ? pass++ : fail++; }

// —— 收集 CSS 源：独立 .css 文件 + 组件内联 <style>{`…`}</style> 块 ——
function collectCss() {
  const files = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (/\.css$/.test(f.name)) {
        files.push({ file: path.relative(ROOT, p), css: fs.readFileSync(p, "utf8") });
      } else if (/\.tsx?$/.test(f.name)) {
        const t = fs.readFileSync(p, "utf8");
        let m;
        const re = /<style>\s*\{\s*`([\s\S]*?)`\s*\}\s*<\/style>/g;
        let i = 0;
        while ((m = re.exec(t)) !== null) {
          i++;
          if (m[1].includes("${")) continue; // 含插值的样式块跳过（无法静态解析）
          files.push({ file: path.relative(ROOT, p) + "#style" + i, css: m[1] });
        }
      }
    }
  };
  walk(SRC);
  return files;
}

// —— 作用域感知解析：@media/@supports 体是独立作用域；@font-face/@keyframes 整块跳过 ——
// 返回 { rules: [{ scope, selector, body }], depthErr }，选择器列表已拆分并归一空白
function parseScopes(css) {
  const out = [];
  let i = 0;
  let depthErr = 0;
  const skipComment = () => {
    if (css[i] === "/" && css[i + 1] === "*") {
      const e = css.indexOf("*/", i);
      i = e === -1 ? css.length : e + 2;
      return true;
    }
    return false;
  };
  // css[i] 指向 '{'，返回体字符串并把 i 推到闭括号之后
  const block = () => {
    i++; // consume {
    let d = 1;
    const start = i;
    while (i < css.length && d > 0) {
      if (skipComment()) continue;
      if (css[i] === "{") d++;
      else if (css[i] === "}") d--;
      i++;
    }
    if (d > 0) depthErr++; // 未闭合
    return css.slice(start, d === 0 ? i - 1 : i);
  };
  let buf = "";
  while (i < css.length) {
    if (skipComment()) continue;
    const c = css[i];
    if (c === "{") {
      const sel = buf.trim();
      buf = "";
      if (/^@(media|supports)/i.test(sel)) {
        const body = block();
        for (const r of parseScopes(body).rules) {
          out.push({ scope: sel.replace(/\s+/g, " "), selector: r.selector, body: r.body });
        }
      } else if (sel.startsWith("@")) {
        block(); // @font-face/@keyframes/@import 等：体不参与选择器统计
      } else {
        const body = block();
        const normBody = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
        for (const s of sel.split(",")) {
          const norm = s.replace(/\s+/g, " ").trim();
          if (norm) out.push({ scope: "@top", selector: norm, body: normBody });
        }
      }
      continue;
    }
    if (c === "}") { depthErr++; i++; continue; } // 多余闭括号
    buf += c;
    i++;
  }
  return { rules: out, depthErr };
}

// —— 孤儿类信息报告（不作为断言：动态类/主进程注入类误报多）——
// 只从「解析出的选择器」取类名，不扫原文：原文里 @font-face 的 data URI、注释、
// 字符串字面量都会带出 .md / .css / .woff2 这类根本不存在的伪类名。
function classNames(css) {
  const set = new Set();
  for (const { selector } of parseScopes(css).rules) {
    for (const m of selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) set.add(m[1]);
  }
  return set;
}
function usedClasses() {
  const set = new Set();
  // 取 className= 之后、下一个 } 或换行之前的整段，再只从「引号字面量」里切词。
  // 旧写法要求 className= 后面紧跟引号，于是 className={cond ? "a b" : "c"} 这种
  // 多类三元表达式整条匹配不上，"nav-item"/"active" 会被误报成孤儿。
  const add = (t) => {
    for (const m of t.matchAll(/className=\{?([^}>\n]*)/g)) {
      for (const lit of m[1].matchAll(/[`"']([^`"']*)[`"']/g)) {
        for (const c of lit[1].split(/\s+/)) if (/^[a-z][\w-]*$/i.test(c)) set.add(c);
      }
    }
  };
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (/\.(tsx?|cjs)$/.test(f.name)) add(fs.readFileSync(p, "utf8"));
    }
  };
  walk(SRC);
  for (const f of ["main.cjs", "preload.cjs"]) {
    try { add(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch { /* 缺文件忽略 */ }
  }
  return set;
}

const files = collectCss();
check("收集到 CSS 源（styles/theme/内联块）", files.length >= 2, files.map((f) => f.file).join(", "));

const used = usedClasses();

// 引用了但全仓库（含内联 style 块）未定义的类（report-only INFO）：
// 拼写漂移/漏写样式的静默缺陷检测器。白名单 = 结构钩子与动态拼接前缀（无样式属正常）。
const allDefined = new Set();
for (const { css } of files) for (const c of classNames(css)) allDefined.add(c);
const HOOK_OK = new Set(["sent-g", "sh", "hm-l", "vcall-page", "vp"]); // 结构钩子/拼接前缀无样式属正常
const missing = [...used.keys()]
  .filter((c) => !allDefined.has(c) && !HOOK_OK.has(c) && !c.endsWith("-"));
if (missing.length) console.log("INFO", `引用未定义类 ${missing.length} 个：` + missing.slice(0, 10).join(" | "));

for (const { file, css } of files) {
  const { rules, depthErr } = parseScopes(css);
  check(`${file} 花括号平衡`, depthErr === 0, depthErr ? `${depthErr} 处不匹配` : "");
  // 同文件同作用域重复选择器：
  //   规则体完全相同 = 复制粘贴腐化 → FAIL；不同 = 有意层叠（共享组+覆写）→ INFO
  const seen = new Map();
  const dups = [];
  const layered = [];
  for (const { scope, selector, body } of rules) {
    const k = scope + " :: " + selector;
    if (seen.has(k)) {
      if (seen.get(k) === body) dups.push(k);
      else layered.push(k);
    }
    seen.set(k, body);
  }
  check(`${file} 同作用域无重复规则`, dups.length === 0, dups.slice(0, 6).join(" | "));
  if (layered.length) console.log("INFO", `${file} 层叠覆写 ${layered.length} 处（report-only）：` + layered.slice(0, 6).join(" | "));
  // 孤儿类：定义了但全仓库无人引用（信息报告）
  // 必须打出名字，否则这条 INFO 只是个数字，没法逐条判断哪些能删、哪些是动态类误报。
  const defined = classNames(css);
  const orphans = [...defined].filter((c) => !used.has(c));
  if (orphans.length) {
    console.log("INFO", `${file} 孤儿类 ${orphans.length} 个（report-only，含动态/注入类误报）：`);
    for (let i = 0; i < orphans.length; i += 12) console.log("     " + orphans.slice(i, i + 12).join(" | "));
  }
}

console.log(`\n${pass} 通过 / ${fail} 失败 / css-audit`);
process.exit(fail ? 1 : 0);
