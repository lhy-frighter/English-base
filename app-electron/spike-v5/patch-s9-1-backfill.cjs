// S9-1 存量回填：旧文章补 coverage_assessments（标记 backfilled）与 unknown_encounters（一次性）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("未找到锚点: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}

// 构造函数：reaper 之前做一次性回填
rep(
"    // S9-1：启动回收——上次未正常关闭的 open 会话按遗弃处理\n    this.reapAbandonedSessions();",
"    // S9-1：存量文章一次性回填覆盖率快照与漏网词相遇（新文章走标注路径）\n    this.backfillCoverageAssessments();\n    this.backfillUnknownEncounters();\n    // S9-1：启动回收——上次未正常关闭的 open 会话按遗弃处理\n    this.reapAbandonedSessions();",
"构造函数回填调用");

// 方法体：插在 recordFirstCoverage 之后（用其收尾锚点）
const anchor = `        JSON.stringify({
          words: stats.words, learnedTokens: stats.learnedTokens, learnedUnique: stats.learnedUnique,
          lexicalWords: stats.lexicalWords, awlRate: stats.awlRate, statsVersion: "v11",
        }), nowMs());
    return true;
  }
`;
const add = anchor + `
  // S9-1：存量文章从 stats_json 补一条覆盖率快照（诚实标记 backfilled，新文章不补、以首标为准）
  backfillCoverageAssessments() {
    const rows = this.user.prepare("SELECT id, stats_json FROM texts").all();
    const ins = this.user.prepare(\`INSERT INTO coverage_assessments
      (text_id,kind,cefr,total_tokens,known_tokens,rate,snapshot_json,created_at)
      VALUES(?,?,?,?,?,?,?,?)\`);
    let cnt = 0;
    for (const r of rows) {
      if (this.user.prepare("SELECT 1 FROM coverage_assessments WHERE text_id=? AND kind='first_annotate'").get(r.id)) continue;
      let st = null; try { st = JSON.parse(r.stats_json || "{}"); } catch { continue; }
      const total = Math.max(0, Math.floor(st.words || 0));
      if (!total) continue;
      const known = Math.min(total, Math.max(0, Math.floor(st.learnedTokens || 0)));
      ins.run(r.id, "first_annotate", st.cefr || "", total, known, known / total,
        JSON.stringify({ words: st.words, learnedTokens: st.learnedTokens, lexicalWords: st.lexicalWords,
          awlRate: st.awlRate, statsVersion: "v11", backfilled: true, backfilledAt: nowMs() }), nowMs());
      cnt++;
    }
    return cnt;
  }

  // S9-1：存量文章重新跑一遍标注（不落库、不改 stats），一次性补漏网词相遇事实
  backfillUnknownEncounters() {
    const rows = this.user.prepare("SELECT id, raw_text FROM texts").all();
    let cnt = 0;
    for (const r of rows) {
      const has = this.user.prepare("SELECT 1 FROM unknown_encounters WHERE text_id=? LIMIT 1").get(r.id);
      if (has) continue;
      const tokens = this.annotate(r.raw_text);
      this.recordUnknownEncounters(r.id, tokens);
      cnt++;
    }
    return cnt;
  }
`;
rep(anchor, add, "回填方法体");

fs.writeFileSync(fp, s, "utf8");
console.log("完成", n);
