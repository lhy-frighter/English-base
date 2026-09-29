// S8a 词形扩展回归：弯引号归一 + n't 缩约 + 所有格 + Morphy 规则屈折回退（frq 门控）
// 只读真实词典，不写用户数据；运行：node test/s8-lemma.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s8-lemma-"));
const core = new Core(dir);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}
const lem = (w) => core.resolve(w, "word", null)?.lemma ?? null;
const labels = (s) => core.annotate(s).filter((t) => t.label !== "punct").map((t) => `${t.text}:${t.label}`);

// —— 1. 弯引号缩约归一到 ECDICT 直引号词头 ——
check("弯引号 didn’t 归一为 didn't 词头", lem("didn’t") === "didn't", lem("didn’t"));
check("弯引号 you’re 可解析", !!lem("you’re"), lem("you’re"));
check("弯引号 I’m 可解析", !!lem("i’m"), lem("i’m"));
check("弯引号 we’ve 可解析", !!lem("we’ve"), lem("we’ve"));
check("弯引号 they’d 可解析", !!lem("they’d"), lem("they’d"));

// —— 2. n't 不规则缩约（ECDICT 未收录的走 NT_EXPAND）——
check("mightn’t → might（NT_EXPAND 兜底）", lem("mightn’t") === "might", lem("mightn’t"));
check("won’t 可解析", !!lem("won’t"), lem("won’t"));
check("can’t 可解析", !!lem("can’t"), lem("can’t"));
check("弯引号 doesn’t 可解析", !!lem("doesn’t"), lem("doesn’t"));

// —— 3. 弯引号所有格截尾 ——
check("world’s → world", lem("world’s") === "world", lem("world’s"));
check("person’s → person", lem("person’s") === "person", lem("person’s"));
check("highway’s → highway", lem("highway’s") === "highway", lem("highway’s"));
check("Aristotle’s 可解析（截到 aristotle）", !!lem("Aristotle’s"), lem("Aristotle’s"));

// —— 4. Morphy 规则屈折回退（lemma 表未收录的长尾变形）——
check("lockdowns → lockdown（规则复数）", lem("lockdowns") === "lockdown", lem("lockdowns"));
check("dreamworlds → dreamworld（规则复数）", lem("dreamworlds") === "dreamworld", lem("dreamworlds"));
check("walkings → walking（复数形式不在词表）", lem("walkings") === "walking", lem("walkings"));
check("hitted → hit（双写辅音 + ed）", lem("hitted") === "hit", lem("hitted"));
check("规则回退在 annotate 中标记 word_lemma",
  labels("Lockdowns spread").some((x) => x.startsWith("Lockdowns:word_lemma")),
  labels("Lockdowns spread").join(" "));

// —— 5. frq>0 门控：零频假词头/外语不得误还原 ——
check("ricas 不得误还原为 rica（零频）", lem("ricas") === null, lem("ricas"));
check("nidas 不得误还原为 nida（零频）", lem("nidas") === null, lem("nidas"));
check("conceivers 规则层不还原零频 conceiver（frq 门控仍生效）", core.ruleLemma("conceivers") === null, core.ruleLemma("conceivers"));
check("conceivers 经 wikt-en 词包显式 lemma 放行到 conceiver", lem("conceivers") === "conceiver", lem("conceivers"));
check("小写 al-biruni’s 不被假装解析",
  labels("al-biruni’s work").every((x) => !x.startsWith("al-biruni’s:word") && !x.startsWith("al-biruni’s:contraction")),
  labels("al-biruni’s work").join(" "));

// —— 6. 同形优先与既有行为不回归 ——
check("eagle 仍解析为本词", lem("eagle") === "eagle", lem("eagle"));
check("lithium 仍解析为本词", lem("lithium") === "lithium", lem("lithium"));
check("actioning 仍归并到 action（lemma 表优先于规则）", lem("actioning") === "action", lem("actioning"));
check("MWE 通道不回归", core.resolve("take care of", "mwe", "take care of")?.isMwe === true);

// —— 7. 整句标注：弯引号句子零 miss ——
const sent = "She didn’t think the world’s economies couldn’t recover; it’s true, they’re fine.";
const toks = labels(sent);
check("弯引号整句无 miss/无未解析", !toks.some((x) => x.endsWith(":miss")), toks.join(" "));

// —— 8. 旧词重现穿透屈折与所有格 ——
core.learned.add("lockdown");
check("已学 lockdown 后 lockdowns 标 learned",
  core.annotate("lockdowns ended").some((t) => t.text.toLowerCase() === "lockdowns" && t.learned === true));
core.learned.add("world");
check("已学 world 后 world’s 标 learned",
  core.annotate("the world’s stage").some((t) => t.text === "world’s" && t.learned === true));

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
