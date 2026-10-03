// test/corrupt-data.cjs — 损坏数据不得伪装成正常记录（#195）
//
// 背景：assessmentHistory / getPaper 过去都是 `catch {}` 后返回空结构。
// 代价不是「报错」，而是**看起来正常**：损坏的测评快照展开后 wpm/comp 全是 undefined，
// 页面按类型当 number 用，渲染出 NaN，而这条记录仍像一次正常测评。
// 更隐蔽的是「合法 JSON 但不是对象」——展开字符串会得到 {0:'j',1:'u',...} 这种下标键。
//
// coverage_assessments 有 CHECK(json_valid(...))，写入时就挡住了；
// 但 struct_json 没有 CHECK，且历史库/外部导入仍可能带坏件。
// 所以这里直接构造等价场景验证映射逻辑，不依赖能否真的写进坏行。
"use strict";
const { DatabaseSync } = require("node:sqlite");

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("PASS", name); }
  else { fail++; console.error("FAIL", name, extra !== undefined ? extra : ""); }
}

// —— 与 core.cjs:assessmentHistory 同构的映射（新逻辑）——
function mapAssess(r) {
  let s = null;
  try { s = JSON.parse(r.snapshot_json); } catch (e) {
    console.warn("[test] 解析失败 cefr=" + r.cefr);
  }
  if (!s || typeof s !== "object") {
    return { cefr: r.cefr, score: Math.round(r.rate * 100), created_at: r.created_at, corrupt: true };
  }
  return { cefr: r.cefr, score: Math.round(r.rate * 100), created_at: r.created_at, corrupt: false, ...s };
}

// —— 旧逻辑（用于对照，证明这个测试确实抓得住回归）——
function mapAssessOld(r) {
  let s = {};
  try { s = JSON.parse(r.snapshot_json); } catch { /* */ }
  return { cefr: r.cefr, score: Math.round(r.rate * 100), created_at: r.created_at, ...s };
}

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE coverage_assessments(
  id INTEGER PRIMARY KEY, kind TEXT, cefr TEXT, rate REAL, snapshot_json TEXT, created_at INTEGER)`);
const ins = db.prepare("INSERT INTO coverage_assessments (kind,cefr,rate,snapshot_json,created_at) VALUES(?,?,?,?,?)");
const OK = { wpm: 120, comp: 80, coverage: 70, speed: 90, dependence: 95, correct: 8, questions: 10 };
ins.run("parallel_test", "C1", 0.72, "{CORRUPT", 3000);                 // 解析失败
ins.run("parallel_test", "C1", 0.55, '"just-a-string"', 2000);           // 合法 JSON 但是字符串
ins.run("parallel_test", "C1", 0.61, JSON.stringify(OK), 1000);          // 正常

const rows = db.prepare("SELECT cefr,rate,snapshot_json,created_at FROM coverage_assessments ORDER BY created_at DESC").all();

// 1) 坏行必须被标记，而不是静默当成正常数据
const mapped = rows.map(mapAssess);
check("解析失败行标记 corrupt", mapped[0].corrupt === true, JSON.stringify(mapped[0]));
check("字符串行标记 corrupt", mapped[1].corrupt === true, JSON.stringify(mapped[1]));
check("正常行 corrupt=false", mapped[2].corrupt === false);

// 2) 坏行绝不能带出 undefined 数值字段（旧逻辑的病根）
for (const m of [mapped[0], mapped[1]]) {
  for (const k of ["wpm", "comp", "coverage", "speed", "dependence", "correct", "questions"]) {
    check(`坏行不携带 ${k}`, !(k in m), JSON.stringify(m));
  }
}

// 3) 字符串展开不得产生下标键污染
check("无 0/1/2 下标键", !("0" in mapped[1]) && !("1" in mapped[1]), JSON.stringify(mapped[1]));

// 4) 正常行字段完整保留
check("正常行保留 wpm", mapped[2].wpm === 120, JSON.stringify(mapped[2]));
check("正常行保留 correct/questions", mapped[2].correct === 8 && mapped[2].questions === 10);

// 5) 对照：旧逻辑在同一批数据上确实是有问题的（证明本测试有效）
const old = rows.map(mapAssessOld);
check("对照：旧逻辑解析失败行不带 corrupt", old[0].corrupt === undefined);
check("对照：旧逻辑字符串行产生下标键", "0" in old[1] && old[1][0] === "j", JSON.stringify(old[1]).slice(0, 60));
check("对照：旧逻辑坏行缺 wpm（页面会渲染 NaN）", !("wpm" in old[0]));

db.close();
console.log(`\ncorrupt-data: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);