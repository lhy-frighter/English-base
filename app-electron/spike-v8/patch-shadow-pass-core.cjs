const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(cp, "utf8");
let changed = false;
function rep(old, neu, label) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.replace(old, neu); changed = true; console.log("patched", label);
}

// 1) 签名加 origin
rep(
  "  shadowPractice({ sentence, textId = null, title = \"\", similarity = 0 } = {}) {\n" +
  "    const sent = Core.normalizeShadowSentence(sentence);\n" +
  "    if (!sent) throw new Error(\"缺少跟读语境句\");",
  "  shadowPractice({\n" +
  "    sentence, textId = null, title = \"\", similarity = 0,\n" +
  "    originKind = \"reading\", originRef = \"\",\n" +
  "  } = {}) {\n" +
  "    const sent = Core.normalizeShadowSentence(sentence);\n" +
  "    if (!sent) throw new Error(\"缺少跟读语境句\");\n" +
  "    if (![\"reading\", \"conversation\"].includes(originKind))\n" +
  "      throw new Error(\"originKind 非法\");",
  "sig");

// 2) INSERT 带 origin
rep(
  "        `INSERT INTO shadow_sentences\n" +
  "         (sentence_hash,sentence,text_id,source_title,first_practiced_at,last_practiced_at,\n" +
  "          practice_count,stage,due_at,best_similarity,status)\n" +
  "         VALUES(?,?,?,?,?,?,?,?,?,?,?)`)\n" +
  "        .run(hash, sent, tid, ttl, now, now, 1, stage, dueAt, sim, status);",
  "        `INSERT INTO shadow_sentences\n" +
  "         (sentence_hash,sentence,text_id,source_title,first_practiced_at,last_practiced_at,\n" +
  "          practice_count,stage,due_at,best_similarity,status,origin_kind,origin_ref)\n" +
  "         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)\n" +
  "        .run(hash, sent, tid, ttl, now, now, 1, stage, dueAt, sim, status,\n" +
  "          originKind, String(originRef || \"\"));",
  "insert");

// 3) UPDATE 补 origin
rep(
  "      this.user.prepare(\n" +
  "        `UPDATE shadow_sentences SET last_practiced_at=?, practice_count=practice_count+1, stage=?, due_at=?,\n" +
  "           best_similarity=MAX(best_similarity,?), status=?,\n" +
  "           text_id=COALESCE(text_id,?),\n" +
  "           source_title=CASE WHEN source_title='' THEN ? ELSE source_title END\n" +
  "         WHERE id=?`)\n" +
  "        .run(now, stage, dueAt, sim, status, tid, ttl, existing.id);",
  "      this.user.prepare(\n" +
  "        `UPDATE shadow_sentences SET last_practiced_at=?, practice_count=practice_count+1, stage=?, due_at=?,\n" +
  "           best_similarity=MAX(best_similarity,?), status=?,\n" +
  "           text_id=COALESCE(text_id,?),\n" +
  "           origin_kind=CASE WHEN origin_kind='reading' AND ?='conversation' THEN 'conversation' ELSE origin_kind END,\n" +
  "           origin_ref=CASE WHEN origin_ref='' AND ?<>'' THEN ? ELSE origin_ref END,\n" +
  "           source_title=CASE WHEN source_title='' THEN ? ELSE source_title END\n" +
  "         WHERE id=?`)\n" +
  "        .run(now, stage, dueAt, sim, status, tid,\n" +
  "          originKind, String(originRef || \"\"), String(originRef || \"\"),\n" +
  "          ttl, existing.id);",
  "update");

// 4) 新查询方法（插在 shadowDismiss 之后）
if (s.indexOf("shadowPassedForSentences(") === -1) {
  const anchor = "  // ============ S12 平行文本能力测评（冻结蓝图，不冻结文章）============";
  const add =
"  // S13-d-1 来源句跟读通过标记\n" +
"  shadowPassedForSentences({ sentences = [] } = {}) {\n" +
"    const out = [];\n" +
"    for (const s0 of sentences) {\n" +
"      const sent = Core.normalizeShadowSentence(s0);\n" +
"      if (!sent) { out.push(false); continue; }\n" +
"      const hash = crypto.createHash(\"sha256\").update(sent.toLowerCase()).digest(\"hex\");\n" +
"      const row = this.user.prepare(\n" +
"        \"SELECT status FROM shadow_sentences WHERE sentence_hash=?\").get(hash);\n" +
"      out.push(Boolean(row) && row.status === \"graduated\");\n" +
"    }\n" +
"    return out;\n" +
"  }\n\n" +
"  shadowPassedForTurn(turnId) {\n" +
"    const row = this.user.prepare(\n" +
"      \"SELECT status FROM shadow_sentences WHERE origin_kind='conversation' AND origin_ref=? AND status='graduated'\")\n" +
"      .get(String(turnId));\n" +
"    return Boolean(row);\n" +
"  }\n\n" + anchor;
  s = s.slice(0, s.indexOf(anchor)) + add + s.slice(s.indexOf(anchor));
  changed = true; console.log("queries added");
}

if (changed) { fs.writeFileSync(cp, s); console.log("written"); }
else console.log("no changes");
