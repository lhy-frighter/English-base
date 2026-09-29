const fs = require("fs");
const fp = "core.cjs";
let s = fs.readFileSync(fp, "utf8");
let n = 0;

// 1) 构造器调用（在 reap 之前）
if (!s.includes("this.repairReadAmounts();")) {
  const anchor = `    this.pruneFunctionLexemes();
    // S9-1：启动回收——上次未正常关闭的 open 会话按遗弃处理
    this.reapAbandonedSessions();`;
  if (!s.includes(anchor)) throw new Error("ctor anchor missing");
  s = s.replace(anchor, `    this.pruneFunctionLexemes();
    // 修复旧版阅读会话 amount=全文词数导致的精读词数虚高
    this.repairReadAmounts();
    // S9-1：启动回收——上次未正常关闭的 open 会话按遗弃处理
    this.reapAbandonedSessions();`);
  n++;
}

// 2) 方法定义（插在 reapAbandonedSessions 之后）
if (!s.includes("repairReadAmounts()")) {
  const anchor = `    return r.changes || 0;
  }

  _sessionLocator(loc) {`;
  if (!s.includes(anchor)) throw new Error("method anchor missing");
  const method = `    return r.changes || 0;
  }

  // 修复阅读会话词数：旧版每次打开都把全文总词数当 amount，短时间多次打开会虚高。
  // 按活跃时间与极速扫读上限（300 wpm，正常精读远低于此）封顶；一次性维护，幂等。
  repairReadAmounts() {
    if (this.user.prepare("SELECT 1 FROM app_settings WHERE k='read_amount_repaired_v1'").get()) return 0;
    const WPM_CAP = 300;
    const rows = this.user.prepare(
      "SELECT id, amount, active_ms FROM learning_sessions WHERE kind='read' AND unit='words' AND amount>0").all();
    const upd = this.user.prepare("UPDATE learning_sessions SET amount=? WHERE id=?");
    let fixed = 0;
    this.user.exec("BEGIN");
    try {
      for (const r of rows) {
        const cap = Math.round(((r.active_ms || 0) / 60000) * WPM_CAP);
        if (r.amount > cap) { upd.run(cap, r.id); fixed++; }
      }
      this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('read_amount_repaired_v1','1')").run();
      this.user.exec("COMMIT");
    } catch (e) {
      try { this.user.exec("ROLLBACK"); } catch { /* ignore */ }
      throw e;
    }
    return fixed;
  }

  _sessionLocator(loc) {`;
  s = s.replace(anchor, method);
  n++;
}

fs.writeFileSync(fp, s, "utf8");
console.log("core repairReadAmounts added, edits:", n);
