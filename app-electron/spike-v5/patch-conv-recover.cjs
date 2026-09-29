const fs = require("node:fs");

// —— core.cjs：加 convRecover ——
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let c = fs.readFileSync(cp, "utf8");
const anchor = `  // 启动回收：open 且 last_active 早于 10 分钟前 → abandoned，ended_at 补 last_active+一个刷新周期(20s)
  reapAbandonedSessions(now = nowMs()) {`;
if (!c.includes(anchor)) throw new Error("reap anchor missing");
const method = `  // 崩溃/重启恢复：generating → failed；speaking → interrupted（保留已播前缀作为权威历史）
  convRecover(now = nowMs()) {
    let n = 0;
    const rows = this.user.prepare(
      "SELECT id,status FROM conversation_turns WHERE status IN ('generating','speaking')",
    ).all();
    for (const r of rows) {
      if (r.status === "generating") {
        this.user.prepare(
          "UPDATE conversation_turns SET status='failed', error_code='interrupted_by_restart' WHERE id=?",
        ).run(r.id);
      } else {
        this.user.prepare(
          "UPDATE conversation_turns SET status='interrupted', interrupted_at=? WHERE id=?",
        ).run(now, r.id);
      }
      n++;
    }
    return { recovered: n };
  }

`;
c = c.replace(anchor, method + anchor);
fs.writeFileSync(cp, c);
console.log("core.convRecover added");

// —— main.cjs：启动时调用 ——
const mp = "D:/vibe coding/英语学习/app-electron/main.cjs";
let m = fs.readFileSync(mp, "utf8");
const callAnchor = `    } catch (be) {
      console.error("[backup] 每日快照失败（不影响使用）:", be);
    }
`;
if (!m.includes(callAnchor)) throw new Error("backup call anchor missing");
m = m.replace(
  callAnchor,
  callAnchor + `    try { core.convRecover(); } catch { /* 恢复失败不影响启动 */ }
`,
);
fs.writeFileSync(mp, m);
console.log("main.cjs calls convRecover on startup");
