// test/unicode-words.cjs — Latin Extended 字母分词、专名序列、邮箱/URL 中性标注
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Core } = require("../core.cjs");

let pass = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS", name); }
  else { console.error("FAIL", name, extra !== undefined ? "→" + JSON.stringify(extra) : ""); process.exitCode = 1; }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v5-uni-"));
const core = new Core(dir);
const words = (s) => core.annotate(s).filter((t) => t.label !== "punct");
const lab = (s, w) => {
  const t = words(s).find((t) => t.text.toLowerCase() === w.toLowerCase());
  return t ? t.label : null;
};

// 1. Latin Extended 大写姓名不再被切碎，且与后继大写词构成姓名序列 → proper
check("Łukasz 整词且 proper", lab("Łukasz Kaiser joined.", "Łukasz") === "proper");
check("Jürgen 整词且 proper", lab("Jürgen Schmidhuber spoke.", "Jürgen") === "proper");
check("Çaglar 整词且 proper", lab("Çaglar Gülçehre agreed.", "Çaglar") === "proper");
check("Gülçehre 整词", lab("Çaglar Gülçehre agreed.", "Gülçehre") !== null);
// 句首大写未知词但后继小写 → 仍按 miss（不放过普通生词）
check("句首未知+小写后继 仍 miss", lab("Łukasz spoke.", "Łukasz") === "miss");
// 缩写名首字母后的姓 → proper（"M. Sugiyama,"）
check("M. Sugiyama 姓氏 proper", lab("editors M. Sugiyama, and R.", "Sugiyama") === "proper");

// 2. 邮箱 / URL 内 token 全部 proper
{
  const ws = words("mail lukaszkaiser@google.com or http://example.com/x?a=1 www.foo.bar end.");
  const bad = ws.filter((t) => /^(lukaszkaiser|google|com|example|http|www|foo|bar|x|a|1)$/.test(t.text) && t.label !== "proper");
  check("邮箱/URL 区间中性标注", bad.length === 0, bad);
}

// 3. 法语含撇号短语不被切碎（外语未收录仍 miss，但必须是整 token）
{
  const ws = words("la phrase qu’elle était là.");
  check("qu’elle 是整 token", ws.some((t) => t.text === "qu’elle"), ws.map((t) => t.text));
  check("était 是整 token", ws.some((t) => t.text === "était"), ws.map((t) => t.text));
}

// 4. core.decodeHtmlEntities 规则
const { decodeHtmlEntities } = require("../core.cjs");
check("core 无分号命名实体", decodeHtmlEntities("caf&agrave;") === "cafà");
check("core query 保护", decodeHtmlEntities("?x=1&copy=2") === "?x=1&copy=2");
check("core 数字实体", decodeHtmlEntities("&#xC7;aglar") === "Çaglar");

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / unicode-words`);
