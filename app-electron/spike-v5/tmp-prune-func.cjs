const path = require("path"), fs = require("fs"), os = require("os");
const { Core } = require("../core.cjs");
const srcDb = path.resolve(__dirname, "..", "data", "user.sqlite");
const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "func-prune-"));
fs.copyFileSync(srcDb, path.join(appdata, "user.sqlite"));
const before = new (require("node:sqlite").DatabaseSync)(path.join(appdata, "user.sqlite"));
console.log("before lexemes:", before.prepare("SELECT lemma,pos,sense FROM lexemes").all());
before.close();
const core = new Core(appdata);
console.log("pruned:", core._prunedFunctionLexemes || "(none)");
const after = core.user.prepare("SELECT lemma FROM lexemes").all();
console.log("after lexemes:", after.map((r) => r.lemma));
console.log("cards:", core.user.prepare("SELECT COUNT(*) n FROM cards").get().n,
  "notes:", core.user.prepare("SELECT COUNT(*) n FROM notes").get().n);
// 幂等：再构造一次不再清
const flag = core.user.prepare("SELECT v FROM app_settings WHERE k='func_lexemes_pruned'").get();
console.log("flag:", flag);
core.user.close();
fs.rmSync(appdata, { recursive: true, force: true });
