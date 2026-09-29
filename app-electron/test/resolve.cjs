// resolve 词头解析回归：同形优先（规避 ECDICT lemma 表反向条目）+ 正常词形归并
// 只读真实词典，不写用户数据；运行：node test/resolve.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

// Core 构造需要可写 dataDir（迁移/挂词典），给临时目录；dict 走 __dirname/data
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-test-"));
const core = new Core(dir);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

check("eagle 解析为本词（不被反向条目 eagled 劫持）", core.resolve("eagle", "word", null)?.lemma === "eagle");
check("lithium 解析为本词（不被 lithiums 劫持）", core.resolve("lithium", "word", null)?.lemma === "lithium");
const infl = core.resolve("actioning", "word", null);
check("正常词形仍归并到词头 action", infl?.lemma === "action", infl?.lemma);
const cap = core.resolve("Eagle", "word", null);
check("大写输入同样命中本词", cap?.lemma === "eagle", cap?.lemma);
const mwe = core.resolve("take care of", "mwe", "take care of");
check("短语走 mwe 通道", mwe?.isMwe === true && mwe?.lemma === "take care of");

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
