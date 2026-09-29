// #117 审计回归：relatedWords/meaningChoices v5（POS 感知形态规则、近义词精确义项段、干扰项同词性）
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s11rel-"));
const core = new Core(dir);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

const the = core.relatedWords("the");
check("the 无假同根（不再出现 theban/theist/thereon）", the.family.length === 0,
  JSON.stringify(the.family.map((x) => x.word)));
const of = core.relatedWords("of");
check("of 无同根", of.family.length === 0);
check("under/again 无假屈折", core.relatedWords("under").family.length === 0 && core.relatedWords("again").family.length === 0);

const inv = core.relatedWords("investigate").family.map((x) => x.word);
check("investigate 含屈折 investigated", inv.includes("investigated"));
check("investigate 含派生 investigation", inv.includes("investigation"));
check("investigate 含施动 investigator", inv.includes("investigator"));
check("investigate 近义词含 examine", core.relatedWords("investigate").synonyms.some((x) => x.word === "examine"));

const quick = core.relatedWords("quick").family.map((x) => x.word);
check("quick 含比较级/副词", quick.includes("quicker") && quick.includes("quickly"));
check("quick 不含复合词 quicksilver/quickwater", !quick.includes("quicksilver") && !quick.includes("quickwater"));
check("同根不含连字符复合词", inv.concat(quick).every((w) => !w.includes("-")));

// v5 新增：脏 exchange、假派生、罕见垃圾屈折
const become = core.relatedWords("become").family.map((x) => x.word);
check("become 不含脏 exchange 码 'd'", !become.includes("d"), JSON.stringify(become));
check("become 含 became/becoming", become.includes("became") && become.includes("becoming"));
const child = core.relatedWords("child").family.map((x) => x.word);
check("child 只剩 children（无 childbed/childed/childer）", child.length === 1 && child[0] === "children", JSON.stringify(child));
const start = core.relatedWords("start").family.map((x) => x.word);
check("start 不含 startled/startling（异词）", !start.includes("startled") && !start.includes("startling"), JSON.stringify(start));
check("start 含 started/starting", start.includes("started") && start.includes("starting"));
const work = core.relatedWords("work").family.map((x) => x.word);
check("work 不含垃圾屈折 workes", !work.includes("workes"), JSON.stringify(work));
const happy = core.relatedWords("happy").family.map((x) => x.word);
check("happy y→i：happily/happiness/happier", happy.includes("happily") && happy.includes("happiness") && happy.includes("happier"),
  JSON.stringify(happy));
const stateSyn = core.relatedWords("state").synonyms.map((x) => x.word);
check("state 近义词无 war/health/book 子串碰撞", !stateSyn.includes("war") && !stateSyn.includes("health") && !stateSyn.includes("book"),
  JSON.stringify(stateSyn));

for (const w of ["the", "investigate", "quick", "queen", "happy", "develop"]) {
  const r = core.relatedWords(w);
  check(`${w} 同根不含自身`, !r.family.some((x) => x.word === w));
}

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
