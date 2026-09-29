// 真实库副本上的回收候选 sanity（只读副本，不碰工程 data/user.sqlite）
const path = require("path"), fs = require("fs"), os = require("os");
const { Core } = require("../core.cjs");

const srcDb = path.resolve(__dirname, "..", "data", "user.sqlite");
const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "rec-real-"));
fs.mkdirSync(path.join(appdata, "data"), { recursive: true });
fs.copyFileSync(srcDb, path.join(appdata, "data", "user.sqlite"));
const core = new Core(appdata);

const rc = core.recycleCount();
console.log("recycleCount:", rc);
const multi = core.recycleCandidates({ minTexts: 2, limit: 15 });
console.log("multi total:", multi.total);
for (const it of multi.items) {
  console.log(`  ${it.lemma.padEnd(22)} lv=${(it.level || "-").padEnd(4)} awl=${it.awl} texts=${it.texts} total=${it.total} frq=${String(it.frq).padStart(6)}  ${it.gloss.slice(0, 30)}`);
}
const one = core.recycleCandidates({ minTexts: 1, limit: 5 });
console.log("all-view total:", one.total, "top5:", one.items.map((x) => x.lemma).join(", "));
core.user.close();
fs.rmSync(appdata, { recursive: true, force: true });
