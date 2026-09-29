// 去重补丁：删除重复插入的 spike-v5 代码地图行与 §11 V5 决策行（幂等）
const fs = require("fs");
const path = require("path");
const doc = path.resolve(__dirname, "..", "..", "交接文档.md");
let s = fs.readFileSync(doc, "utf8");
const before = s;

const spikeLine = "   ├─ spike-v5/           # v2.15 PDF 硬化（构建期数据不分发）：diagnose1-4 基于真实 pdfjs TextItem 的诊断、probe-dict 词典信号校准、baseline.cjs（before/after 双指标，baseline-before.json 冻结勿覆盖）、verify-lex-fix 词典裁决验证、patch-core-entities 一次性实体补丁（已执行幂等）；冻结夹具在 test-fixtures/pdf/\r\n";
const dqSpike = "Wiktionary 需求驱动词包落地（S8c）、残余 miss 主因是 PDF 抽取\r\n" + spikeLine + spikeLine;
const sqSpike = "Wiktionary 需求驱动词包落地（S8c）、残余 miss 主因是 PDF 抽取\r\n" + spikeLine;
if (s.includes(dqSpike)) { s = s.replace(dqSpike, sqSpike); console.log("去重 spike-v5 行"); }
else console.log("spike 行无重复（或形态不符）");

const rowLine = "| PDF 抽取硬化（V5 hardening） | 先冻结夹具+before 基线再动抽取器，双指标验收（坏词下降 + 正文保留率≥99%，禁止删词刷指标）；上下标用字号 0.83×/dy 阈值角色状态机；连字符/粘连一律**词典裁决**（ECDICT bnc≤12000 或 frq≥100，含 lemma 词头信号），切不动诚实 miss 不猜字；SUFFIX_DENY 禁语素片段；Ł 等在 core 标注侧用 \\p{Lu} 与 Latin 扩展字母类修复；公式穿插断词与真未收录词为已知边界；只影响新导入 | v2.15.0（2026-09-21） |\r\n";
const dqRow = rowLine + rowLine;
if (s.includes(dqRow)) { s = s.replace(dqRow, rowLine); console.log("去重 §11 行"); }
else console.log("§11 行无重复（或形态不符）");

if (s !== before) fs.writeFileSync(doc, s, "utf8");
console.log("done");
