// 标注管线回归测试：
//   node test/golden.cjs            —— 与 golden 基线比对（阈值 95%）
//   node test/golden.cjs --update   —— 以当前管线输出刷新基线（仅在有意更改管线后使用）
// 硬断言（任何模式都必须过）：token 拼回 === 原文（零丢失）。
// 基线刷新记录：2026-09-12 —— MWE 垃圾过滤（内容词≥2）与 Atlanta's 类归属优先级调整后重置基线。
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Core } = require("../core.cjs");

const GOLD = path.resolve(__dirname, "..", "..", "V0验证工具包", "results", "golden");
const TEXTS = path.resolve(__dirname, "..", "..", "V0验证工具包", "texts");
const FILES = ["textA_news", "textB_essay", "textC_academic"];
const THRESHOLD = 0.95;
const UPDATE = process.argv.includes("--update");

const core = new Core(fs.mkdtempSync(path.join(os.tmpdir(), "eb-golden-")));
let total = 0;
let hit = 0;
const lines = [];
let zeroLoss = true;

for (const f of FILES) {
  const raw = fs.readFileSync(path.join(TEXTS, f + ".txt"), "utf8");
  const tokens = core.annotate(raw);
  // 硬断言：零丢失
  const recon = tokens.map((t) => t.text).join("");
  if (recon !== raw) { zeroLoss = false; lines.push(`${f}: ✗ 零丢失断言失败`); }

  const wordToks = tokens.filter((t) => t.label !== "punct").map((t) => ({ t: t.text, label: t.label }));
  const goldenPath = path.join(GOLD, f + ".tokens.jsonl");

  if (UPDATE) {
    fs.writeFileSync(
      goldenPath,
      wordToks.map((t) => JSON.stringify(t)).join("\n") + "\n"
    );
    lines.push(`${f}: 基线已刷新（${wordToks.length} tokens）`);
    continue;
  }

  const golden = fs
    .readFileSync(goldenPath, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const n = Math.min(wordToks.length, golden.length);
  let ok = 0;
  const diffs = [];
  for (let i = 0; i < golden.length; i++) {
    const a = wordToks[i];
    const g = golden[i];
    if (!a || a.t !== g.t) { diffs.push(`#${i} 文本错位: ${g.t} vs ${a ? a.t : "(无)"}`); continue; }
    if (a.label === g.label) ok++;
    else diffs.push(`#${i} ${g.t}: ${g.label} → ${a.label}`);
  }
  total += ok;
  hit += golden.length;
  const rate = ok / golden.length;
  lines.push(
    `${f}: ${ok}/${golden.length} (${(rate * 100).toFixed(1)}%)` +
    (diffs.length ? `\n    差异示例: ${diffs.slice(0, 3).join(" | ")}` : "")
  );
}

if (!UPDATE) {
  const rate = hit ? total / hit : 0;
  console.log(lines.join("\n"));
  console.log(`总一致率 ${(rate * 100).toFixed(1)}%（阈值 ${(THRESHOLD * 100).toFixed(0)}%）· 零丢失: ${zeroLoss ? "通过" : "失败"}`);
  process.exit(rate >= THRESHOLD && zeroLoss ? 0 : 1);
} else {
  console.log(lines.join("\n"));
  console.log("零丢失:", zeroLoss ? "通过" : "失败");
  process.exit(zeroLoss ? 0 : 1);
}
