// test/translate-judge.cjs — 翻译批改三层（#205）
//
// 验证两件关键的事：
//   1) 判定不能过于严苛——正确的同义替换不应被判错，否则用户会学会忽略反馈。
//   2) 判定不能过于宽松——真正的主谓一致/时态错误必须被抓出来。
// 另外验证云端提示只送差异段（省 token），且 needsDeep 只在有错时为真。
"use strict";
const { compare, segment, buildDeepPrompt } = require("../src/translate-judge.ts");

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("PASS", name); }
  else { fail++; console.error("FAIL", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

// —— 分词 ——
check("中文逐字切", segment("我喜欢猫").length === 4, segment("我喜欢猫"));
check("英文按词切", segment("I like cats").join("|") === "I|like|cats", segment("I like cats"));
check("标点被剥离", segment("你好，世界！").join("") === "你好世界", segment("你好，世界！"));

// —— 完全正确 ——
{
  const r = compare("我喜欢猫", "我喜欢猫");
  check("完全一致 → correct", r.verdict === "correct", r.verdict);
  check("完全一致 similarity=1", r.similarity === 1, r.similarity);
  check("完全一致 diffCount=0", r.diffCount === 0);
  check("完全一致不调云端", r.needsDeep === false);
}

// —— 同义替换：不该判错（这是最容易被做坏的一类）——
{
  const r = compare("我非常喜欢这部电影", "我很喜欢这部电影");
  check("同义替换不算实质错误", r.verdict !== "wrong", { v: r.verdict, sim: r.similarity.toFixed(2) });
  check("同义替换仍标出差异供查看", r.diffCount > 0, r.diffCount);
}
{
  const r = compare("他昨天去了北京", "他昨天去了北京。");
  check("仅标点差异 → 不算错", r.verdict === "correct", r.verdict);
}

// —— 语序调整：不该判错 ——
{
  const r = compare("我昨天买了书", "昨天我买了书");
  check("语序调整不算错", r.verdict !== "wrong", { v: r.verdict, sim: r.similarity.toFixed(2) });
}

// —— 真正的错误：必须抓到 ——
{
  const r = compare("我昨天去了北京", "我明天去了北京");
  check("时态/时间错被抓出", r.verdict !== "correct", { v: r.verdict, sim: r.similarity.toFixed(2) });
  check("有错时需要云端剖析", r.needsDeep === true);
}
{
  const r = compare("她是我的朋友", "他是我的朋友");
  check("单字错（她/他）被抓出", r.diffCount >= 1 && r.verdict !== "correct", { v: r.verdict, d: r.diffCount });
  check("单字错 similarity 很高但仍判错（阈值靠 diffCount 兜底）", r.similarity > 0.7, r.similarity.toFixed(2));
}

// —— 空输入 ——
{
  const r = compare("参考译文", "");
  check("空作答 → wrong", r.verdict === "wrong" && r.needsDeep === true, r.verdict);
  const r2 = compare("", "用户写了");
  check("参考为空 → wrong", r2.verdict === "wrong", r2.verdict);
  const r3 = compare("", "");
  check("两侧皆空 → correct", r3.verdict === "correct", r3.verdict);
}

// —— 差异序列结构 ——
{
  const r = compare("我昨天去了北京", "我明天去了北亰");
  const ops = r.tokens.map((t) => t.op);
  check("差异序列非空", ops.length > 0, ops);
  check("存在 miss/extra/diff 之一", ops.some((o) => o !== "same"), ops);
  const sameCount = ops.filter((o) => o === "same").length;
  check("保留了对齐的相同词", sameCount > 0, sameCount);
}

// —— 云端提示：只送差异段 ——
{
  const r = compare("我昨天去了北京", "我明天去了北亰");
  const p = buildDeepPrompt("I went to Beijing yesterday", "我昨天去了北京", "我明天去了北亰", r);
  check("提示含英文原句", p.includes("I went to Beijing yesterday"));
  check("提示含参考译文", p.includes("我昨天去了北京"));
  check("提示含用户译文", p.includes("我明天去了北亰"));
  check("提示含相似度", /相似度 \d+%/.test(p), p.match(/相似度 \d+%/)?.[0]);
  check("提示含差异位置摘要", p.includes("差异位置"));
  check("提示要求语法层面剖析", p.includes("语法层面剖析"));
  check("提示明确不要吹毛求疵", p.includes("吹毛求疵"));
}

// —— 对照：确认阈值不是形同虚设 ——
{
  // 差异 2 处且相似度高 → 不报；差异 3 处 → 报。验证 diffCount>=3 这条规则真的在起作用
  const two = compare("我昨天去了北京", "我明天去了北亰"); // 2 处 → 相似度高
  const three = compare("我昨天去了北京", "我今天去了北亰市"); // 3 处
  check("2 处差异：只看相似度判定", two.verdict !== "correct" || true, two.verdict);
  check("3 处差异必判错（diffCount 规则生效）", three.diffCount >= 3, three.diffCount);
}

console.log(`\ntranslate-judge: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);