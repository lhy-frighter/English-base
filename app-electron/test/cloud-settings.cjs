// V8-2d/V8-4 云端设置回归：
// app_settings 读写（默认值/覆盖）、parseConsent（空/合法/损坏 JSON）、
// normalizeConsent（缺省/非布尔强转/超长截断）、model 字段默认与合并。
// 运行：node test/cloud-settings.cjs
const { Core } = require("../core.cjs");
const { parseConsent, normalizeConsent, DEFAULT_CONSENT } = require("../cloud-consent.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-settings-"));
const core = new Core(dir);

// —— 1. settings 读写 ——
check("未设置返回默认值", core.getSetting("nope", "dflt") === "dflt");
check("未设置无默认返回空串", core.getSetting("nope2") === "");
core.setSetting("k1", "v1");
check("写入后可读", core.getSetting("k1") === "v1");
core.setSetting("k1", "v2");
check("覆盖写生效", core.getSetting("k1") === "v2");

// —— 2. parseConsent ——
{
  const d = parseConsent("");
  check("空串回默认", d.profile === false && d.historyText === false && d.audio === false);
  check("默认端点为 BigModel", d.baseUrl === "https://open.bigmodel.cn/api/paas/v4/");
  check("默认模型 glm-4.7-flash", d.model === "glm-4.7-flash");
  const ok = parseConsent(JSON.stringify({ profile: true, baseUrl: "https://x", model: "m1" }));
  check("合法 JSON 合并", ok.profile === true && ok.audio === false && ok.baseUrl === "https://x" && ok.model === "m1");
  // 旧版 JSON（无 model 字段）合并默认模型
  const legacy = parseConsent(JSON.stringify({ baseUrl: "https://old" }));
  check("旧 JSON 缺 model 补默认", legacy.model === "glm-4.7-flash" && legacy.baseUrl === "https://old");
  const bad = parseConsent("{not json");
  check("损坏 JSON 回默认不抛错", bad.profile === false && bad.historyText === false && bad.model === "glm-4.7-flash");
  check("默认对象开关全关", DEFAULT_CONSENT.profile === false && DEFAULT_CONSENT.audio === false && DEFAULT_CONSENT.historyText === false);
}

// —— 3. normalizeConsent ——
{
  const n = normalizeConsent(undefined);
  check("undefined 输入回默认", n.profile === false && n.historyText === false && n.audio === false);
  check("undefined 保留默认端点/模型", n.baseUrl === "https://open.bigmodel.cn/api/paas/v4/" && n.model === "glm-4.7-flash");
  const c = normalizeConsent({ profile: 1, historyText: "yes", audio: {}, baseUrl: 123, model: 456 });
  check("真值强转为布尔", c.profile === true && c.historyText === true && c.audio === true);
  check("非字符串端点/模型转字符串", typeof c.baseUrl === "string" && typeof c.model === "string");
  const long = normalizeConsent({ baseUrl: "u".repeat(500), model: "m".repeat(200) });
  check("端点超长截断到 300", long.baseUrl.length === 300);
  check("模型名超长截断到 120", long.model.length === 120);
  const withExtra = normalizeConsent({ profile: true, evil: "x" });
  check("多余字段不进入结果", !("evil" in withExtra) && withExtra.profile === true);
  check("updatedAt 被刷新", typeof withExtra.updatedAt === "number" && withExtra.updatedAt > 0);
}

console.log(`\ncloud-settings: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
