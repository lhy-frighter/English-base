// 备份/恢复回归（方案 §20）：快照生成/幂等/内容一致/滚动 7 份/损坏回退/无快照抛错
// 全部在 os.tmpdir 临时目录进行，不污染真实数据；运行：node test/backup.cjs
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { Core } = require("../core.cjs");

const SRC = path.join(__dirname, "..", "data");
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log((cond ? "PASS" : "FAIL"), name, extra ?? "");
  cond ? pass++ : fail++;
}
function freshDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "bak-test-"));
  for (const ext of ["", "-wal", "-shm"]) {
    const f = path.join(SRC, "user.sqlite" + ext);
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(d, "user.sqlite" + ext));
  }
  return d;
}
function tableCount(file, t) {
  const db = new DatabaseSync(file, { readOnly: true });
  const n = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  const ic = db.prepare("PRAGMA integrity_check").all();
  db.close();
  return { n, ok: ic.length === 1 && Object.values(ic[0])[0] === "ok" };
}

const d1 = freshDir();
const core = new Core(d1);
const liveTexts = tableCount(path.join(d1, "user.sqlite"), "texts").n;
const r1 = core.dailyBackup();
const snap = path.join(d1, "backups", r1.file);
check("首次生成快照", r1.action === "created" && fs.existsSync(snap) && fs.statSync(snap).size > 0);
check("同日再次启动跳过（幂等）", core.dailyBackup().action === "skipped");
const st = tableCount(snap, "texts");
check("快照可独立打开且 integrity_check=ok", st.ok);
check("快照行数与活库一致", st.n === liveTexts);
for (let i = 1; i <= 9; i++) {
  fs.writeFileSync(path.join(d1, "backups", `user-2026-08-${String(i).padStart(2, "0")}.sqlite`), Buffer.from("x"));
}
core.dailyBackup();
const kept = fs.readdirSync(path.join(d1, "backups")).filter((f) => /^user-.*\.sqlite$/.test(f)).sort();
check("滚动保留恰好 7 份", kept.length === 7);
check("最旧快照被裁剪", !kept.includes("user-2026-08-01.sqlite") && kept.includes(r1.file));

const d2 = freshDir();
const c2 = new Core(d2);
c2.dailyBackup();
const expectN = tableCount(path.join(d2, "backups", fs.readdirSync(path.join(d2, "backups"))[0]), "texts").n;
c2.user.close();
fs.writeFileSync(path.join(d2, "user.sqlite"), Buffer.from("NOT A SQLITE DATABASE".repeat(20)));
for (const ext of ["-wal", "-shm"]) { const f = path.join(d2, "user.sqlite" + ext); if (fs.existsSync(f)) fs.rmSync(f); }
const c2b = new Core(d2);
check("损坏后自动回退且有提示", !!c2b.recoveryNotice);
check("回退后数据与快照一致", c2b.user.prepare("SELECT COUNT(*) n FROM texts").get().n === expectN);
check("坏库被隔离为 .bak", fs.readdirSync(d2).some((f) => f.includes("corrupt")));

const d3 = freshDir();
fs.writeFileSync(path.join(d3, "user.sqlite"), Buffer.from("GARBAGE".repeat(50)));
let threw = false;
try { new Core(d3); } catch (e) { threw = /无可用快照|database/i.test(String(e.message)); }
check("无快照损坏时明确抛错", threw);

core.user.close();
c2b.user.close();
fs.rmSync(d1, { recursive: true, force: true });
fs.rmSync(d2, { recursive: true, force: true });
fs.rmSync(d3, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
