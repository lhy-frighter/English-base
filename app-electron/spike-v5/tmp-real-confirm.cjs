const { Core } = require("../core.cjs");
const path = require("node:path");
const core = new Core(path.join(__dirname, "..", "data"));
const ins = core.insights(90);
console.log("真实库 90 天精读词数:", ins.totals.readWords);
const flag = core.user.prepare("SELECT v FROM app_settings WHERE k='read_amount_repaired_v1'").get();
console.log("修复标记:", flag ? flag.v : null);
core.user.close();
