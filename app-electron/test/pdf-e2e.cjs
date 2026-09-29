// test/pdf-e2e.cjs — 真实冻结 PDF 端到端夹具（缺文件则 skip，不失败）
// 三份公开 arXiv 论文仅作测试夹具：attention.pdf / instructgpt.pdf / vae.pdf
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { extractText } = require("../import-tools.cjs");
const { Core } = require("../core.cjs");

const ROOT = path.join(__dirname, "..");
const FIX = path.join(ROOT, "test-fixtures", "pdf");
const FILES = ["attention.pdf", "instructgpt.pdf", "vae.pdf"];
if (!FILES.every((f) => fs.existsSync(path.join(FIX, f)))) {
  console.log("SKIP pdf-e2e（缺少 test-fixtures/pdf 冻结夹具）");
  process.exit(0);
}

let pass = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS", name); }
  else { console.error("FAIL", name, extra !== undefined ? "→" + JSON.stringify(extra) : ""); process.exitCode = 1; }
}
const missCount = (core, text) => core.annotate(text).filter((t) => t.label === "miss").length;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v5-e2e-"));
  const core = new Core(dir);
  const beforePath = path.join(ROOT, "spike-v5", "baseline-before.json");
  const before = fs.existsSync(beforePath)
    ? JSON.parse(fs.readFileSync(beforePath, "utf8")).files : null;
  const texts = {};
  for (const f of FILES) {
    const { text } = await extractText(path.join(FIX, f));
    texts[f] = text;
    check(`${f} 提取非空`, text.length > 20_000, text.length);
    if (before && before[f]) {
      check(`${f} 正文保留率≥99%（vs before 字符数）`,
        text.length >= before[f].chars * 0.99,
        { before: before[f].chars, after: text.length });
    }
  }

  const att = texts["attention.pdf"];
  check("Łukasz Kaiser 完整保留", /Łukasz Kaiser/.test(att));
  check("d_model-dimensional 下标重建", /d_model-dimensional/.test(att));
  check("d_ff 下标重建", /d_ff/.test(att));
  check("log_k(n) 下标重建", /log_k\(n\)/.test(att));
  check("无旧下标压平 dmodel", !/\bdmodel\b/.test(att));
  check("无 d f f 碎片", !/d f f/.test(att));
  check("表格粘连已切 Law will never be perfect", /Law will never be perfect/.test(att));
  check("无 butits 粘连", !/butits/.test(att));
  check("position-wise 保留连字符", /position-wise/.test(att));
  check("attention-based 保留连字符", /attention-based neural machine/.test(att));
  check("transformations 断词修复", /transformations/.test(att));
  check("attention miss ≤10（基线 61）", missCount(core, att) <= 10, missCount(core, att));

  const vae = texts["vae.pdf"];
  check("vae naive 分音符归一", /naive/.test(vae));
  check("vae parameters 完整存在", /parameters/.test(vae));
  check("vae 无 datapoint 粘连", !/datapoint/.test(vae));
  check("vae 无 minibatches 粘连", !/minibatches/.test(vae));
  check("vae miss ≤25（基线 66）", missCount(core, vae) <= 25, missCount(core, vae));

  const ig = texts["instructgpt.pdf"];
  check("instructgpt 无 labelers 之外的表格粘连（datapoints）", !/datapoints/.test(ig));
  check("instructgpt miss ≤320（基线 505）", missCount(core, ig) <= 320, missCount(core, ig));

  core.user.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} 通过 / pdf-e2e`);
})().catch((e) => { console.error(e); process.exit(1); });
