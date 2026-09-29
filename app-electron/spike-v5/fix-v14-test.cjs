const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/test/v14-migration.cjs";
let s = fs.readFileSync(p, "utf8");
function mustReplace(oldStr, newStr, label) {
  if (!s.includes(oldStr)) throw new Error("NOT FOUND: " + label);
  s = s.replace(oldStr, newStr);
}
mustReplace(
  `  db.prepare("INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
    VALUES(?,'d','bad','reading',?,'e1')").run(chkId, now);`,
  `  db.prepare(\`INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
    VALUES(?,'d','bad','reading',?,'e1')\`).run(chkId, now);`,
  "e1"
);
mustReplace(
  `  db.prepare("INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
    VALUES(?,'d','correct','bad',?,'e2')").run(chkId, now);`,
  `  db.prepare(\`INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
    VALUES(?,'d','correct','bad',?,'e2')\`).run(chkId, now);`,
  "e2"
);
mustReplace(
  `  db.prepare("INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
    VALUES(?,'chunk_used','used_spontaneously','conversation',?,'e4')").run(chkId, now).changes === 1);`,
  `  db.prepare(\`INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
    VALUES(?,'chunk_used','used_spontaneously','conversation',?,'e4')\`).run(chkId, now).changes === 1);`,
  "e4"
);
fs.writeFileSync(p, s);
console.log("fixed multiline strings");
