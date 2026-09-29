// 逐链运行 npm test 中的 43 条命令，收集退出码与各自最后一行摘要
const { execFileSync } = require("node:child_process");
const t = require("../package.json").scripts.test;
const cmds = t.split(" && ");
let failCount = 0;
const rows = [];
for (const cmd of cmds) {
  const m = cmd.match(/^node (?:--experimental-strip-types )?test\/(\S+)$/);
  const name = m ? m[1] : cmd;
  try {
    const out = execFileSync(process.execPath, cmd.replace(/^node /, "").split(" "), {
      cwd: __dirname + "/..",
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const lines = out.trim().split(/\r?\n/).filter(Boolean);
    const summary = lines[lines.length - 1];
    rows.push(`OK   ${name.padEnd(24)} ${summary}`);
  } catch (e) {
    failCount++;
    rows.push(`FAIL ${name.padEnd(24)} exit=${e.status}`);
  }
}
console.log(rows.join("\n"));
console.log(`\nchains: ${cmds.length}, failed: ${failCount}`);
process.exit(failCount ? 1 : 0);
