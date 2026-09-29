// 分层词库回归：L0 ECDICT 优先 + L1 领域词包补词/补义 + 连字符 MWE 归一 + 专名占位不建卡
// 运行：node test/dict-layers.cjs
const { Core } = require("../core.cjs");
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dict-layers-"));
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

// ---------- 第一阶段：无词包，基线行为（隔离内置词包）----------
const core = new Core(dir, { bundledPacks: false });

const lab = (text, w) => {
  const t = core.annotate(text).find((x) => x.label !== "punct" && x.text.toLowerCase() === w.toLowerCase());
  return t || null;
};
let t = lab("The dot-product attention works well today.", "dot-product");
check("连字符单词 dot-product 归一命中 L0 MWE dot product", t?.label === "mwe" && t?.phrase === "dot product", JSON.stringify(t));

t = lab("Self attention is not here.", "self");
check("L0 无 self attention 时不冒认为 MWE（self 普通词）", t?.label !== "mwe", t?.label);

t = lab("The author Vaswani proposed a model in the paper.", "Vaswani");
check("句中大写未登录词判专名", t?.label === "proper", t?.label);

t = lab("Zxcvbn is an unknown word at sentence start.", "Zxcvbn");
check("句首大写未登录词不冒判专名（按未收录）", t?.label === "miss", t?.label);

const allCap = lab("The ZXQW model failed.", "ZXQW");
check("全大写未登录词判专名", allCap?.label === "proper", allCap?.label);
const knownAcro = lab("NASA uses GPU clusters.", "GPU");
check("全大写但词典可解的缩写词按词处理（cap_word）", knownAcro?.label === "cap_word", knownAcro?.label);

const prop = core.lookup("Vaswani", "proper", null, null);
check("专名 lookup 返回解释性占位", prop?.cardable === false && prop?.kind === "proper" && prop.translation.includes("专有名词"));
check("专名不进查词密度日志", core.user.prepare("SELECT COUNT(*) n FROM lookup_log").get().n === 0);

let threw = false;
try { core.createNote({ word: "Vaswani", label: "proper", phrase: null, sense: "", textId: 1, offset: 0 }); }
catch { threw = true; }
check("专名建卡被拒（resolve 为空）", threw);

const directMwe = core.resolve("dot-product", "mwe", "dot-product");
check("直接 API 的连字符 MWE 走归一兜底", directMwe?.isMwe === true && directMwe?.lemma === "dot product", directMwe?.lemma);

// ---------- 第二阶段：挂一个 CS/AI 词包 ----------
const packDir = path.join(dir, "packs");
fs.mkdirSync(packDir, { recursive: true });
const pdb = new DatabaseSync(path.join(packDir, "cs-ai.sqlite"));
pdb.exec(`
CREATE TABLE words(word TEXT PRIMARY KEY, phonetic TEXT, pos TEXT, translation TEXT, definition TEXT, tag TEXT, bnc INTEGER, frq INTEGER);
CREATE TABLE mwe(phrase TEXT PRIMARY KEY, translation TEXT, pos TEXT, tag TEXT);
CREATE TABLE lemma(flexion TEXT PRIMARY KEY, lemma TEXT);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
INSERT INTO meta VALUES
 ('id','cs-ai'),('name','CS/AI 术语包'),('license','CC-BY-SA-4.0'),('source','test fixture'),('version','0.1');
INSERT INTO words VALUES ('softmax','','n.','[计] Softmax 归一化指数函数','','cs-ai',0,0);
INSERT INTO words VALUES ('tokenization','','n.','[计] 分词；词元化','','cs-ai',0,0);
INSERT INTO words VALUES ('transformer','','n.','[计] Transformer 模型（基于自注意力的神经网络架构）','','cs-ai',0,0);
INSERT INTO words VALUES ('matrix','','n.','矩阵（词包补充义，不应覆盖 L0）','','cs-ai',0,0);
INSERT INTO mwe VALUES ('self attention','[计] 自注意力','n.','cs-ai');
INSERT INTO mwe VALUES ('multi-head attention','[计] 多头注意力','n.','cs-ai');
INSERT INTO lemma VALUES ('tokenisations','tokenization');
`);
pdb.close();

const core2 = new Core(dir, { bundledPacks: false });
check("词包被挂载（仅用户目录 fixture）", core2.packs.length === 1 && core2.packs[0].id === "cs-ai", JSON.stringify(core2.packs));

const sm = core2.resolve("softmax", "word", null);
check("词包独有词可解析", sm?.lemma === "softmax" && sm.translation.includes("Softmax"));
check("词包词带来源徽章", sm?.layers?.[0]?.id === "cs-ai", JSON.stringify(sm?.layers));

const tf = core2.resolve("transformer", "word", null);
check("同词头补充义项：L0 原义保留", tf.translation.includes("变压器"), tf.translation.slice(0, 40));
check("同词头补充义项：词包新义追加", tf.translation.includes("Transformer 模型"), tf.translation.slice(-60));
check("L0 优先：tag 仍取 ECDICT", tf.tag.includes("cet6"), tf.tag);

const mx = core2.resolve("matrix", "word", null);
check("词包同词头不覆盖 L0 行（音标/频序口径不变）", mx.tag.includes("gre"), mx.tag);
check("词包同词头补充义追加", mx.translation.includes("词包补充义"));

const infl = core2.resolve("tokenisations", "word", null);
check("词包 lemma 词形归并生效", infl?.lemma === "tokenization", infl?.lemma);

t = core2.annotate("Self-attention is the core mechanism.").find((x) => x.phrase === "self attention");
check("连字符 self-attention 命中词包 MWE", t?.label === "mwe", JSON.stringify(t));

t = core2.annotate("Multi-head attention dominates NLP.").find((x) => x.phrase === "multi-head attention");
check("混合连字符短语 multi-head attention 命中", t?.label === "mwe", JSON.stringify(t));

const spaced = core2.annotate("Self attention dominates NLP.").filter((x) => x.phrase === "self attention");
check("空格形 self attention 命中且只有一个短语头", spaced.length === 1, spaced.length);

const mweEntry = core2.resolve("self-attention", "mwe", "self-attention");
check("词包连字符 MWE 直接解析", mweEntry?.lemma === "self attention" && mweEntry?.layers?.[0]?.id === "cs-ai");

// 考纲统计不受词包 tag 影响（词包词不进六级牌组总量）
const cet6 = core2.syllabusList().find((g) => g.tag === "cet6");
check("词包 cs-ai tag 不污染考纲牌组总量", cet6.total > 1000, cet6.total);

core.user.close();
core2.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
