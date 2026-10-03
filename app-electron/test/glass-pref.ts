// #191 液态玻璃逃生门：属性写入 / 持久化 / 默认值 / 异常兜底。
// 这类接线最容易静默失败——按钮渲染出来了，但 body[data-glass] 根本没写，
// 用户点了没反应、代码里也看不出问题。所以必须有断言守着「真的写上了」。
import { GLASS_KEY, readGlassOn, writeGlassOn, applyGlass } from "../src/glassPrefCore.ts";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.log("FAIL", name); }
}
function eq(name: string, a: unknown, b: unknown) {
  check(name + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));
}

// —— 假 localStorage / 假 document ——
function fakeStore(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    get: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    set: (k: string, v: string) => { map.set(k, v); },
  };
}
function fakeDoc() {
  const attrs: Record<string, string> = {};
  // dataset.x 映射到 data-x —— 这一步不做，假对象就会把 "glass" 当成属性名，
  // 断言「写上了 data-glass」就会以一个假失败告终。用 Proxy 还原这层映射。
  const toAttr = (k: string) => "data-" + k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  const body: any = {
    removeAttribute(n: string) { delete attrs[n]; },
    dataset: new Proxy({}, {
      get: (_t: object, k: string) => attrs[toAttr(k)],
      set: (_t: object, k: string, v: string) => { attrs[toAttr(k)] = v; return true; },
      deleteProperty: (_t: object, k: string) => { delete attrs[toAttr(k)]; return true; },
      has: (_t: object, k: string) => toAttr(k) in attrs,
    }),
  };
  return { attrs, body };
}

// —— 默认值：没存过 / 存了 "on" 都算开启，只有显式 "off" 才关 ——
eq("缺省=开启", readGlassOn(fakeStore().get), true);
eq("存 on=开启", readGlassOn(fakeStore({ [GLASS_KEY]: "on" }).get), true);
eq("存 off=关闭", readGlassOn(fakeStore({ [GLASS_KEY]: "off" }).get), false);
eq("脏值不算关闭", readGlassOn(fakeStore({ [GLASS_KEY]: "OFF " }).get), true);

// —— 异常兜底：隐私模式下 localStorage 抛错，不该阻断启动 ——
check("读取抛错回落开启", readGlassOn(() => { throw new Error("denied"); }));
check("写入抛错返回 false 且不抛出", writeGlassOn(() => { throw new Error("denied"); }, false) === false);

// —— 写入即持久化 ——
{
  const s = fakeStore();
  writeGlassOn(s.set, false);
  eq("关闭后存 off", s.map.get(GLASS_KEY), "off");
  eq("关闭后可读回 false", readGlassOn(s.get), false);
  writeGlassOn(s.set, true);
  eq("重开存 on", s.map.get(GLASS_KEY), "on");
}

// —— 属性真的落到 body 上（CSS 选择器是 [data-glass="off"]）——
{
  const d = fakeDoc();
  applyGlass(d, false);
  eq("关闭写 data-glass=off", d.attrs["data-glass"], "off");
  applyGlass(d, true);
  check("开启必须删属性而不是写 on", d.attrs["data-glass"] === undefined);
}

// —— 接线完整性：CSS 规则与 TS 写入点必须成对存在 ——
{
  const css = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
  const tsx = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const pref = readFileSync(new URL("../src/glassPrefCore.ts", import.meta.url), "utf8");
  check("CSS 有 [data-glass=\"off\"] 逃生门", css.includes('body[data-glass="off"] .glass'));
  check("逃生门同时关掉 .glass-strong", css.includes('body[data-glass="off"] .glass-strong'));
  check("core 写入的键名与 CSS 选择器一致", pref.includes('dataset.glass = "off"') && css.includes('data-glass="off"'));
  check("App.tsx 挂载了开关（不再是死规则）", tsx.includes("useGlassPref") && tsx.includes("side-glass"));
}

console.log(`${pass} 通过 / ${fail} 失败 / glass-pref`);
process.exit(fail ? 1 : 0);