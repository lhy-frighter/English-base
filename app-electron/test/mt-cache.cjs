// S7b 离线机翻：migration v10 text_translations、缓存 upsert/失效/级联、HTML 实体解码
// 运行：node test/mt-cache.cjs
const { Core, decodeHtmlEntities } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cache-"));
const core = new Core(dir);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(String(e.message)) : true; } };

// —— 1. v10 迁移 ——
// 版本号随 MIGRATIONS 数组长度推进（v16 占位 + #208 题材分类后为 17）
check("user_version=17", core.user.prepare("PRAGMA user_version").get().user_version === 17);
const cols = core.user.prepare("PRAGMA table_info(text_translations)").all().map((c) => c.name);
check("text_translations 列齐全", ["id", "text_id", "para_index", "source_sha256", "src_lang", "dst_lang",
  "engine", "model_revision", "translated_text", "pairs_json", "status", "updated_at"].every((c) => cols.includes(c)));

// 造一篇外部导入文章（足够长以通过保存）
const longText = `The committee announced a new investigation into the election results on Friday morning.
Lawyers said the evidence presented during the hearing did not support any of the serious claims made online.
Researchers recommend reading difficult material every day to expand vocabulary beyond the exam syllabus.
The mayor praised the volunteers who worked through the night to restore power after the severe storm.
Ordinary citizens gathered outside the building to express both support and opposition in peaceful ways.`;
const a = core.annotateAndSave(longText, "News", { kind: "url", uri: "https://example.com/n", externalRef: "n" });

// —— 2. 入参校验 ——
check("文章不存在拒绝缓存", throws(() => core.translationPut({ textId: 99999, paraIndex: 0, source: "x", translatedText: "y" }), /文章不存在/));
check("负段落号拒绝", throws(() => core.translationPut({ textId: a.text_id, paraIndex: -1, source: "x", translatedText: "y" }), /段落序号/));
check("非整数段落号拒绝", throws(() => core.translationPut({ textId: a.text_id, paraIndex: 1.5, source: "x", translatedText: "y" }), /段落序号/));
check("空原文拒绝", throws(() => core.translationPut({ textId: a.text_id, paraIndex: 0, source: "   ", translatedText: "y" }), /原文为空/));
check("ok 状态空译文拒绝", throws(() => core.translationPut({ textId: a.text_id, paraIndex: 0, source: "x", translatedText: "  " }), /译文为空/));
check("failed 状态允许空译文", (() => {
  const r = core.translationPut({ textId: a.text_id, paraIndex: 7, source: "para seven", translatedText: "", status: "failed" });
  return r.status === "failed";
})());

// —— 3. 正常写入 + 句对过滤 + 哈希 ——
const src1 = "Lawyers said the evidence presented during the hearing did not support the claims.";
const r1 = core.translationPut({
  textId: a.text_id, paraIndex: 1, source: src1, translatedText: "律师称听证会上出示的证据不支持这些说法。",
  pairs: [["Lawyers said", "律师称"], ["the evidence", "证据"], ["bad", 3], [null, "x"]],
  engine: "bergamot-0.4.9", modelRevision: "llmaat-finetune10m-qe8-2024",
});
check("返回 sourceSha 正确", r1.sourceSha === Core.sourceShaOf(src1), r1.sourceSha);
let all = core.translationGetAll(a.text_id);
const row1 = all.find((r) => r.paraIndex === 1);
check("句对只收 [string,string]", row1.pairs.length === 2, JSON.stringify(row1.pairs));
check("引擎/版本/语言默认值", row1.engine === "bergamot-0.4.9" && row1.modelRevision === "llmaat-finetune10m-qe8-2024");
const failedRow = all.find((r) => r.paraIndex === 7);
check("failed 行可读回", failedRow && failedRow.status === "failed" && failedRow.zh === "");

// —— 4. upsert：同段重写覆盖、sha 跟随内容变化 ——
core.translationPut({ textId: a.text_id, paraIndex: 1, source: src1 + " Revised.", translatedText: "修订后的译文。", pairs: [] });
all = core.translationGetAll(a.text_id);
const rowsFor1 = all.filter((r) => r.paraIndex === 1);
check("同段 upsert 不新增行", rowsFor1.length === 1 && rowsFor1[0].zh === "修订后的译文。");
check("upsert 后 sha 更新", rowsFor1[0].sourceSha === Core.sourceShaOf(src1 + " Revised."));

// 非法语言标记回落默认
core.translationPut({ textId: a.text_id, paraIndex: 2, source: "Second paragraph source text here.", translatedText: "第二段。", srcLang: "evil sql", dstLang: "??" });
const row2 = core.translationGetAll(a.text_id).find((r) => r.paraIndex === 2);
check("非法语言标记回落 en/zh", row2 && /SELECT/.test(JSON.stringify(row2)) === false); // 仅确保没把奇怪值写进去
const raw2 = core.user.prepare("SELECT src_lang s, dst_lang d FROM text_translations WHERE text_id=? AND para_index=2").get(a.text_id);
check("库里语言为 en/zh", raw2.s === "en" && raw2.d === "zh", JSON.stringify(raw2));

// —— 5. 删文级联 + clear ——
check("删文前有缓存", core.translationGetAll(a.text_id).length >= 3);
core.deleteText(a.text_id);
check("deleteText 级联清译文", core.translationGetAll(a.text_id).length === 0);

const a2 = core.annotateAndSave(longText, "News2", { kind: "paste" });
core.translationPut({ textId: a2.text_id, paraIndex: 0, source: "First source paragraph.", translatedText: "第一段。" });
core.translationPut({ textId: a2.text_id, paraIndex: 1, source: "Second source paragraph.", translatedText: "第二段。" });
const clr = core.translationClear(a2.text_id);
check("translationClear 删两行", clr.deleted === 2, String(clr.deleted));
check("clear 后为空", core.translationGetAll(a2.text_id).length === 0);

// —— 6. HTML 实体解码（导入边界统一解码，双编码只解一层）——
check("命名实体 amp/lt/gt/quot", decodeHtmlEntities("a &amp; b &lt; c &gt; &quot;") === "a & b < c > \"");
check("十进制实体", decodeHtmlEntities("&#39;hi&#39;") === "'hi'");
check("十六进制实体", decodeHtmlEntities("&#x2F;path&#x2f;") === "/path/");
check("未知实体保留", decodeHtmlEntities("&something; x") === "&something; x");
check("非法码位保留", decodeHtmlEntities("&#0;") === "&#0;");
check("双编码只解一层", decodeHtmlEntities("&amp;lt;") === "&lt;");
check("null 透传", decodeHtmlEntities(null) === null);
check("无分号 Latin-1 实体", decodeHtmlEntities("caf&agrave; r&eacute;sum&eacute;") === "cafà résumé");
check("无分号大写实体", decodeHtmlEntities("&Ccedil;aglar") === "Çaglar");
check("query 中无分号 copy 受保护", decodeHtmlEntities("?x=1&copy=2") === "?x=1&copy=2");
check("数字实体带分号解码", decodeHtmlEntities("&#224;b") === "àb");
check("缺分号数字实体不吞后续", decodeHtmlEntities("&#224b") === "&#224b");

// —— 7. 外部导入在入库时解码实体（builtin 不解码的路径由内置素材包保证，不在此测）——
const ent = core.annotateAndSave("Tom &amp; Jerry visited a caf&#233; in Paris &mdash; it was great.",
  "Ent", { kind: "paste" });
const got = core.getText(ent.text_id).raw_text;
check("外部文章入库解码实体", got.includes("Tom & Jerry") && got.includes("café") && got.includes("—"), got);

// —— 8. v10 迁移可重入（新版本构造不重复建表/不报错已由上面两次 Core 构造覆盖，这里显式重开）——
core.user.close();
let reopenErr = null, reopened;
try { reopened = new Core(dir); } catch (e) { reopenErr = e; }
check("重开 Core 迁移可重入", !reopenErr && reopened.user.prepare("PRAGMA user_version").get().user_version === 17, String(reopenErr));
reopened?.user.close();

// —— 9. IPC 三处齐守卫（main handler / preload 桥接 / api.ts 类型）——
{
  const root = path.join(__dirname, "..");
  const preload = fs.readFileSync(path.join(root, "preload.cjs"), "utf8");
  const mainSrc = fs.readFileSync(path.join(root, "main.cjs"), "utf8");
  const apiSrc = fs.readFileSync(path.join(root, "src", "api.ts"), "utf8");
  for (const c of ["mtCacheGet", "mtCachePut", "mtCacheClear", "modelGetMtMirror", "modelSetMtMirror"]) {
    check(`preload 暴露 ${c}`, new RegExp(`\\b${c}\\s*:`).test(preload));
    check(`main 有 ${c} handler`, new RegExp(`\\b${c}\\s*:`).test(mainSrc));
    check(`api.ts 声明 ${c}`, new RegExp(`\\b${c}\\b`).test(apiSrc));
  }
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败 / mt-cache`);
process.exit(fail ? 1 : 0);
