// #117 审计回归：挖空干扰项、缩写句切分、功能词相遇过滤、挖空正确性
const { Core, extractSentence, buildCloze } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
const core = new Core(dir);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

// 1) meaningChoices：含正确项、无重复、干扰项不泄漏正确义项、同词性
{
  let leaks = 0, badPos = 0, noCorrect = 0, dups = 0;
  for (let i = 0; i < 30; i++) {
    const correct = "v. 调查，审查";
    const ch = core.meaningChoices(correct, "investigate");
    if (ch.length !== 4 || !ch.includes(correct)) noCorrect++;
    if (new Set(ch).size !== ch.length) dups++;
    for (const g of ch) {
      if (g === correct) continue;
      const m = /^\s*([a-z]{1,6})\./i.exec(g);
      if (m && m[1].toLowerCase() !== "v") badPos++;
      if (g.includes("调查")) leaks++;
    }
  }
  check("干扰项 30 轮均含正确项且 4 选不重复", noCorrect === 0 && dups === 0, `noCorrect=${noCorrect} dups=${dups}`);
  check("干扰项无词性泄漏（非 v.）", badPos === 0, `badPos=${badPos}`);
  check("干扰项不含正确义项 调查", leaks === 0, `leaks=${leaks}`);
}

// 2) extractSentence：缩写/小数/头衔不截断
{
  const text = "See Fig. 3.14 for details in the U.S. market. Dr. Smith arrived. Then we left.";
  const s1 = extractSentence(text, text.indexOf("market"));
  const s2 = extractSentence(text, text.indexOf("arrived"));
  const s3 = extractSentence(text, text.indexOf("left"));
  check("Fig./3.14/U.S. 不截断首句", s1 === "See Fig. 3.14 for details in the U.S. market.", JSON.stringify(s1));
  check("Dr. 不截断第二句", s2 === "Dr. Smith arrived.", JSON.stringify(s2));
  check("第三句正确切出", s3 === "Then we left.", JSON.stringify(s3));
}

// 3) 功能词不进 unknown_encounters，存量可清理
{
  core.annotateAndSave(
    "The committee of investigators and a senator will analyze the mechanism thoroughly tomorrow.",
    "fw-test",
  );
  const lemmas = core.user.prepare("SELECT lemma FROM unknown_encounters").all().map((r) => r.lemma);
  check("相遇表无功能词 the/of/and/a/will",
    !["the", "of", "and", "a", "will"].some((w) => lemmas.includes(w)), JSON.stringify(lemmas));
  check("相遇表保留内容词 investigators/mechanism",
    lemmas.some((w) => /investigator/.test(w)) && lemmas.includes("mechanism"), JSON.stringify(lemmas));
  check("相遇表无长度<3 的单字母", lemmas.every((w) => w.length >= 3), JSON.stringify(lemmas));
  check("isFunctionLemma 判定", core.isFunctionLemma("would") && core.isFunctionLemma("an")
    && !core.isFunctionLemma("investigate") && !core.isFunctionLemma("quick"));
  core.user.prepare("DELETE FROM app_settings WHERE k='func_encounters_pruned'").run();
  core.user.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES(?,?,?,?,?)")
    .run("the", 999, 3, 1, 1);
  core.pruneFunctionEncounters();
  const left = core.user.prepare("SELECT COUNT(*) n FROM unknown_encounters WHERE text_id=999").get().n;
  check("存量功能词污染可一次性清理", left === 0, `left=${left}`);
}

// 4) buildCloze：真实句挖空命中目标词、缩写句正常
{
  const c1 = buildCloze(core, "The investigators examined the mechanism carefully.", "investigator");
  check("屈折形态挖空不 miss", !c1.miss, JSON.stringify(c1).slice(0, 120));
  check("挖空答案回指 investigator", c1.answer && /investigator/i.test(c1.answer), c1.answer);
  const c2 = buildCloze(core, "The U.S. economy recovered quickly after the reform.", "economy");
  check("缩写句挖空 economy 正常", !c2.miss && /economy/i.test(c2.answer || ""), JSON.stringify(c2).slice(0, 120));
}

// 5) canonical：零频屈折词头与 exchange 0:base 标记还原；高频独立词不还原
{
  check("investigators→investigator", core.canonical("investigators") === "investigator");
  check("mechanisms→mechanism", core.canonical("mechanisms") === "mechanism");
  check("quicker→quick（高频屈折）", core.canonical("quicker") === "quick");
  check("studying→study", core.canonical("studying") === "study");
  check("people 保持自身", core.canonical("people") === "people");
  check("data 保持自身", core.canonical("data") === "data");
  check("investigator 保持自身", core.canonical("investigator") === "investigator");
  // 已学单数词元，阅读复数应判 learned
  const r = core.resolve("investigator", "word", null);
  core.upsertLexeme(r, "n. 调查员");
  const ann = core.annotate("The investigators examined the mechanism.");
  const tok = ann.find((t) => /investigator/i.test(t.text));
  check("已学单数→复数 learned=true", !!tok && tok.learned === true);
  // 相遇表按原形归并
  core.user.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES(?,?,?,?,?)").run("mechanisms", 77, 2, 5, 9);
  core.user.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES(?,?,?,?,?)").run("mechanism", 77, 1, 3, 8);
  core.user.prepare("DELETE FROM app_settings WHERE k='encounters_consolidated_v1'").run();
  core.consolidateEncounterLemmas();
  const rows = core.user.prepare("SELECT lemma,count,first_seen_at f,last_seen_at l FROM unknown_encounters WHERE text_id=77").all();
  check("相遇表单复数归并（count=3,f=3,l=9）",
    rows.length === 1 && rows[0].lemma === "mechanism" && rows[0].count === 3 && rows[0].f === 3 && rows[0].l === 9,
    JSON.stringify(rows));
  // 合并不得让助动词复活（has/had→have 应直接删除）
  core.user.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES(?,?,?,?,?)").run("has", 78, 4, 1, 2);
  core.user.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES(?,?,?,?,?)").run("had", 78, 3, 1, 2);
  core.user.prepare("DELETE FROM app_settings WHERE k='encounters_consolidated_v1'").run();
  core.user.prepare("DELETE FROM app_settings WHERE k='encounters_cleanup_v2'").run();
  core.consolidateEncounterLemmas();
  core.cleanupEncountersV2();
  const aux = core.user.prepare("SELECT COUNT(*) n FROM unknown_encounters WHERE lemma IN ('have','has','had')").get().n;
  check("合并后助动词不复活", aux === 0, `aux=${aux}`);
}

// 6) 二刷审计：功能词 exchange 家族关闭、零频动词化门控、canonical exBase 优先、-ly 还原
{
  const fam = (w) => core.relatedWords(w).family.map((x) => x.word);
  check("be/her/them/french exchange 家族为空",
    fam("be").length === 0 && fam("her").length === 0 && fam("them").length === 0 && fam("french").length === 0,
    JSON.stringify({ be: fam("be"), her: fam("her"), french: fam("french") }));
  check("party 保留 partying、剔除零频 partied",
    fam("party").includes("partying") && !fam("party").includes("partied"));
  check("bird 保留 birding、剔除零频 birded",
    fam("bird").includes("birding") && !fam("bird").includes("birded"));
  check("become 保留 became（不规则自声明屈折）", fam("become").includes("became"));
  check("start 保留 started/starting", fam("start").includes("started") && fam("start").includes("starting"));
  check("happy 保留 happier/happiest", fam("happy").includes("happier") && fam("happy").includes("happiest"));
  check("chairman 保留 chairmen（自声明复数）", fam("chairman").includes("chairmen"));
  check("家族无连字符成员", fam("tradition").every((w) => !w.includes("-")));
  check("denied→deny（exBase 零频还原）", core.canonical("denied") === "deny");
  check("qualified→qualify", core.canonical("qualified") === "qualify");
  check("varied→vary", core.canonical("varied") === "vary");
  check("bustier→busty（不被反向垃圾带到 bustiers）", core.canonical("bustier") === "busty");
  check("better→good / worse→bad", core.canonical("better") === "good" && core.canonical("worse") === "bad");
  check("ferreted→ferret（不信零频脏原形 ferrete）", core.canonical("ferreted") === "ferret");
  check("adversarially→adversarial（-ly 规则还原）", core.canonical("adversarially") === "adversarial");
  check("investigated 保持/还原到 investigate", core.canonical("investigated") === "investigate");
}

// 7) answer rating 非法值拒绝（不污染调度）
{
  const made = core.createStandaloneNote({ word: "serendipity", label: "word", phrase: false, sense: "n. 意外新发现" });
  const cid = core.user.prepare("SELECT id FROM cards WHERE note_id=? LIMIT 1").get(made.note_id).id;
  let threw = false;
  try { core.answer({ cardId: cid, rating: 0 }); } catch { threw = true; }
  check("rating=0 抛错", threw);
  const logs = core.user.prepare("SELECT COUNT(*) n FROM review_log WHERE card_id=?").get(cid).n;
  check("非法 rating 不写 review_log", logs === 0, `logs=${logs}`);
}

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
