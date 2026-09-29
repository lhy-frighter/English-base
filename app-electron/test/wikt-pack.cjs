// Wiktionary 扩展词包回归：挂载/解析/屈折/英英释义建卡/L0 不被污染
// 运行：node test/wikt-pack.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wikt-pack-"));
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

const core = new Core(dir); // 默认挂内置词包（含 cs-ai 与 wikt-en）
check("wikt-en 词包已挂载", core.packs.some((p) => p.id === "wikt-en"), JSON.stringify(core.packs.map((p) => p.id)));

// 1) 词包独有词：无中文、有英英释义、带来源徽章
const gamify = core.resolve("gamify", "word", null);
check("gamify 可解析", gamify?.lemma === "gamify", gamify?.lemma);
check("gamify 无中文 translation", (gamify?.translation || "") === "", gamify?.translation);
check("gamify 有英英释义", /convert into.*game/i.test(gamify?.definition || ""), gamify?.definition);
check("gamify 带 wikt-en 徽章", gamify?.layers?.[0]?.id === "wikt-en", JSON.stringify(gamify?.layers));
check("gamify tag 为词包 id（不含考纲标签）", gamify?.tag === "wikt-en", gamify?.tag);

// 2) 词包 lemma 屈折映射（forms 表）
const infl = core.resolve("instrumentalised", "word", null);
check("instrumentalised 经词包 lemma 归并到 instrumentalise", infl?.lemma === "instrumentalise", infl?.lemma);
const croco = core.resolve("crocodylomorphs", "word", null);
check("crocodylomorphs → crocodylomorph", croco?.lemma === "crocodylomorph", croco?.lemma);
const gamified = core.resolve("gamified", "word", null);
check("gamified → gamify", gamified?.lemma === "gamify", gamified?.lemma);

// 3) L0 零频词的屈折由词包 lemma 补上（conceivers→conceiver，ECDICT 有 conceiver frq=0）
const conceivers = core.resolve("conceivers", "word", null);
check("conceivers → conceiver（L0 零频词 + 词包屈折）", conceivers?.lemma === "conceiver", conceivers?.lemma);

// 4) annotate 不再标 miss
const toks = core.annotate("They gamify learning and instrumentalised the approach; crocodylomorphs are extinct.");
const misses = toks.filter((t) => t.label === "miss").map((t) => t.text);
check("新词在 annotate 中全部可解析", misses.length === 0, JSON.stringify(misses));

// 5) 西语假朋友仍不还原（门控不被词包破坏）
check("ricas 仍不可解析", core.resolve("ricas", "word", null) === null);

// 5b) 考纲牌组总量不被词包词污染（与无词包基线一致）
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "wikt-base-"));
const coreNoPacks = new Core(dir2, { bundledPacks: false });
const cet6With = core.syllabusList().find((g) => g.tag === "cet6")?.total ?? -1;
const cet6Without = coreNoPacks.syllabusList().find((g) => g.tag === "cet6")?.total ?? -2;
check("词包不改变考纲牌组总量", cet6With === cet6Without, `${cet6Without} -> ${cet6With}`);
coreNoPacks.user.close();
fs.rmSync(dir2, { recursive: true, force: true });

// 6) 英英释义建卡：词表收录 sense 非空（前端回退英英释义后）
const enSense = (gamify.definition || "").split("\n").map((s) => s.trim()).find(Boolean);
const standalone = core.createStandaloneNote({ word: "gamify", label: "word", phrase: null, sense: enSense });
const lex = core.user.prepare("SELECT sense FROM lexemes WHERE id=?").get(standalone.lexeme_id);
check("词表收录词元 sense 为英英释义（非空）", !!lex.sense && /game/i.test(lex.sense), lex.sense);

// 7) 跟读成卡默认义项回退英英释义（不传 sense、无中文）
const shadow = core.createShadowNote({ word: "instrumentalised", sentence: "The state instrumentalised education for its goals." });
const slex = core.user.prepare("SELECT sense FROM lexemes WHERE id=?").get(shadow.lexeme_id);
check("跟读成卡默认义项回退英英释义且无词性前缀", !!slex.sense && /instrument/i.test(slex.sense) && !/^v\.\s/.test(slex.sense), slex.sense);

// 8) 词包 meta 合规信息
const { DatabaseSync } = require("node:sqlite");
const pdb = new DatabaseSync(path.join(__dirname, "..", "data", "packs", "wikt-en.sqlite"), { readOnly: true });
const meta = Object.fromEntries(pdb.prepare("SELECT key,value FROM meta").all().map((r) => [r.key, r.value]));
check("meta 标 CC-BY-SA-4.0", /CC-BY-SA-4\.0/.test(meta.license || ""), meta.license);
check("meta 含 Wiktionary 来源", /Wiktionary/.test(meta.source || ""), meta.source);
const n = pdb.prepare("SELECT (SELECT COUNT(*) FROM words) w,(SELECT COUNT(*) FROM lemma) l").get();
check("词包规模合理（words 1k–20k）", n.w > 1000 && n.w < 20000, `${n.w} words / ${n.l} lemma`);
const ipa = pdb.prepare("SELECT COUNT(*) n FROM words WHERE phonetic!=''").get().n;
check("IPA 覆盖 ≥1000（builder v0.2 放宽抽取）", ipa >= 1000, ipa + " / " + n.w);
const abso = pdb.prepare("SELECT phonetic FROM words WHERE word='abso-fucking-lutely'").get();
check("长音符号 ː 不再被误拒", !!abso && abso.phonetic.includes("ː"), abso && abso.phonetic);
pdb.close();

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
