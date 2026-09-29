// 语音回归样本仓库回归：存取/持久化/校验/评测留存/删除/文件名安全。运行：node test/regression.cjs
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { RegressionStore } = require("../regression.cjs");

let pass = 0, fail = 0;
function check(name, cond, extra) { console.log((cond ? "PASS" : "FAIL"), name, extra ?? ""); cond ? pass++ : fail++; }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "regression-"));
const store = new RegressionStore(dir);

// 1) 保存英文样本
const bytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
const c1 = store.save({ lang: "en", ref: "Never abandon a good plan.", source: "shadow", model: "whisper-tiny.en", hyp: "never a good plan", ms: 700, mime: "audio/webm", bytes });
check("保存返回 id 与服务端生成文件名", /^r[a-z0-9]+\.webm$/.test(c1.file), c1.file);
check("文件名不含路径/穿越", !c1.file.includes("/") && !c1.file.includes("\\") && !c1.file.includes(".."));
check("录音文件落盘", fs.existsSync(path.join(dir, "regression", c1.file)));
check("初始 evals 为空", JSON.stringify(c1.evals) === "{}");

// 2) 非法语言回落 en、来源默认 shadow
const c2 = store.save({ lang: "fr", ref: "hello there", source: "weird", hyp: "", ms: 1, mime: "audio/webm", bytes: Buffer.from("abc") });
check("未知语言回落 en", c2.lang === "en" && c2.source === "shadow", `${c2.lang}/${c2.source}`);

// 3) 校验：空字节拒绝、超大拒绝（且不落文件）
const beforeCount = store.list().length;
let e1 = false, e2 = false;
try { store.save({ lang: "en", ref: "x", bytes: Buffer.alloc(0) }); } catch { e1 = true; }
try { const fake = new Uint8Array([1]); Object.defineProperty(fake, "byteLength", { value: 99 * 1024 * 1024 }); store.save({ lang: "en", ref: "x", bytes: fake }); } catch { e2 = true; }
check("空录音拒绝", e1);
check("超大录音拒绝", e2);
check("拒绝不产生新样本", store.list().length === beforeCount, String(store.list().length));

// 4) read 原样返回字节
const got = store.read(c1.id);
check("read 返回相同字节", Buffer.from(got.bytes).equals(bytes));
check("read 不存在 id 抛错", (() => { try { store.read("nope"); return false; } catch { return true; } })());

// 5) setEval 按模型留存并持久化（重新实例化后仍在）
store.setEval({ id: c1.id, model: "whisper-tiny.en", result: { ms: 700, text: "never a good plan", sim: 60, wer: 0.4, misses: 1, subs: 0, extras: 0, cjkRatio: 0, hallucinated: false } });
store.setEval({ id: c1.id, model: "whisper-base", result: { ms: 1500, text: "never abandon a good plan", sim: 100, wer: 0, misses: 0, subs: 0, extras: 0, cjkRatio: 0, hallucinated: false } });
const reopened = new RegressionStore(dir);
const rc1 = reopened.list().find((c) => c.id === c1.id);
check("两个模型的评测结果都留存", Object.keys(rc1.evals).length === 2 && rc1.evals["whisper-base"].sim === 100, JSON.stringify(Object.keys(rc1.evals)));

// 6) 删除清文件与清单
const del = reopened.remove(c2.id);
check("remove 返回 deleted", del.deleted && !fs.existsSync(path.join(dir, "regression", c2.file)) && !reopened.list().some((c) => c.id === c2.id));
check("删除不存在样本返回 deleted:false", reopened.remove("nope").deleted === false);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败 / regression`);
process.exit(fail ? 1 : 0);
