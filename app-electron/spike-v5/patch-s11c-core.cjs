// S11-c：migration v12 shadow_sentences + 跟读句 1/3/7 调度方法 + todayBrief.shadow_due
const fs = require("fs");
const fp = "core.cjs";
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

// 1) migration v12 注册
rep(
`  // v11：S9-0 数据契约——学习会话/恢复状态/漏网词相遇/覆盖率不可变快照/设置，考试前台活跃毫秒
  migrateV11,
];`,
`  // v11：S9-0 数据契约——学习会话/恢复状态/漏网词相遇/覆盖率不可变快照/设置，考试前台活跃毫秒
  migrateV11,
  // v12：S11-c 跟读句 1/3/7 轻量复习（句子级调度，不进 FSRS 卡池）
  \`CREATE TABLE IF NOT EXISTS shadow_sentences(
    id INTEGER PRIMARY KEY,
    sentence_hash TEXT NOT NULL UNIQUE,
    sentence TEXT NOT NULL,
    text_id INTEGER,
    source_title TEXT NOT NULL DEFAULT '',
    first_practiced_at INTEGER NOT NULL,
    last_practiced_at INTEGER NOT NULL,
    practice_count INTEGER NOT NULL DEFAULT 1 CHECK(practice_count>=1),
    stage INTEGER NOT NULL DEFAULT 0 CHECK(stage BETWEEN 0 AND 3),
    due_at INTEGER NOT NULL,
    best_similarity INTEGER NOT NULL DEFAULT 0 CHECK(best_similarity BETWEEN 0 AND 100),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','graduated','dismissed')));
   CREATE INDEX IF NOT EXISTS idx_shadow_due ON shadow_sentences(status,due_at);\`,
];`,
"migration v12");

// 2) 调度方法（挂在 getResumeState 之后）
const anchor = `  // S9-1：标注阶段记录"可成卡但尚无资产"的漏网词相遇事实`;
const methods = `  // —— S11-c：跟读句 1/3/7 轻量复习（只提醒重练，不生成 FSRS 卡）——
  // stage: 0=练完待 1 天，1=待 3 天，2=待 7 天，3=已出师；到期当天再次完成比对才推进
  static SHADOW_STEPS_DAYS = [1, 3, 7];
  static normalizeShadowSentence(s0) {
    return String(s0 ?? "").trim().replace(/\\s+/g, " ");
  }

  shadowPractice({ sentence, textId = null, title = "", similarity = 0 } = {}) {
    const sent = Core.normalizeShadowSentence(sentence);
    if (!sent) throw new Error("缺少跟读语境句");
    const hash = crypto.createHash("sha256").update(sent.toLowerCase()).digest("hex");
    const now = nowMs();
    const sim = Math.max(0, Math.min(100, Math.round(Number(similarity) || 0)));
    const tid = textId == null ? null : Number(textId);
    const ttl = String(title || "");
    const existing = this.user.prepare("SELECT * FROM shadow_sentences WHERE sentence_hash=?").get(hash);
    let stage, status, dueAt, advanced = false, graduated = false, isNew = false;
    if (!existing) {
      stage = 0; status = "active"; dueAt = now + DAY_MS; isNew = true;
      this.user.prepare(
        \`INSERT INTO shadow_sentences
         (sentence_hash,sentence,text_id,source_title,first_practiced_at,last_practiced_at,
          practice_count,stage,due_at,best_similarity,status)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)\`)
        .run(hash, sent, tid, ttl, now, now, 1, stage, dueAt, sim, status);
    } else {
      stage = existing.stage; status = existing.status; dueAt = existing.due_at;
      if (status === "active" && now >= existing.due_at) {
        stage = existing.stage + 1; advanced = true;
        if (stage >= 3) { status = "graduated"; dueAt = 0; graduated = true; }
        else dueAt = now + Core.SHADOW_STEPS_DAYS[stage] * DAY_MS;
      }
      this.user.prepare(
        \`UPDATE shadow_sentences SET last_practiced_at=?, practice_count=practice_count+1, stage=?, due_at=?,
           best_similarity=MAX(best_similarity,?), status=?,
           text_id=COALESCE(text_id,?),
           source_title=CASE WHEN source_title='' THEN ? ELSE source_title END
         WHERE id=?\`)
        .run(now, stage, dueAt, sim, status, tid, ttl, existing.id);
    }
    return { hash, isNew, advanced, graduated, stage, status, dueAt, sentence: sent };
  }

  shadowDue(limit = 20) {
    const now = nowMs();
    const n = Math.max(1, Math.min(200, Number(limit) || 20));
    return this.user.prepare(
      \`SELECT id, sentence, text_id AS textId, source_title AS sourceTitle, stage,
              due_at AS dueAt, practice_count AS practiceCount, best_similarity AS bestSimilarity,
              ?-due_at AS overdueMs
         FROM shadow_sentences WHERE status='active' AND due_at<=?
         ORDER BY due_at ASC LIMIT ?\`).all(now, now, n);
  }

  shadowDueCount() {
    return this.user.prepare(
      "SELECT COUNT(*) n FROM shadow_sentences WHERE status='active' AND due_at<=?").get(nowMs()).n;
  }

  shadowDismiss(id) {
    const r = this.user.prepare(
      "UPDATE shadow_sentences SET status='dismissed' WHERE id=? AND status='active'").run(Number(id));
    return r.changes > 0;
  }

`;
if (!s.includes("shadowPractice(")) {
  if (!s.includes(anchor)) throw new Error("方法锚点缺失");
  s = s.replace(anchor, methods + anchor);
  console.log("patched: 调度方法");
} else console.log("skip: 调度方法");

// 3) todayBrief 增加 shadow_due
rep(
`      wrong_due: wrongDue,
      recycle_multi: recycle.multi,
      recycle_total: recycle.total,
    };`,
`      wrong_due: wrongDue,
      recycle_multi: recycle.multi,
      recycle_total: recycle.total,
      shadow_due: this.shadowDueCount(),
    };`,
"todayBrief shadow_due");

fs.writeFileSync(fp, s, "utf8");
console.log("core saved");
