// S9-2 core：resume_state 读写（每 scope 一行 UPSERT，locator 必须合法 JSON）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const anchor = `      status: r.status, activeMs: r.active_ms,
    };
  }
`;
const add = anchor + `
  // S9-2：断点续学。scope='reading'|'shadow'，每 scope 仅保留最新一行
  saveResumeState(scope, refId, locator, contentHash = "") {
    if (scope !== "reading" && scope !== "shadow") throw new Error("非法 resume scope");
    const json = this._sessionLocator(locator);
    const t = nowMs();
    this.user.prepare(
      \`INSERT INTO resume_state(scope, ref_id, locator_json, content_hash, updated_at)
        VALUES(?,?,?,?,?)
        ON CONFLICT(scope) DO UPDATE SET ref_id=excluded.ref_id, locator_json=excluded.locator_json,
          content_hash=excluded.content_hash, updated_at=excluded.updated_at\`)
      .run(scope, String(refId ?? ""), json, String(contentHash || ""), t);
    return this.getResumeState(scope);
  }

  getResumeState(scope) {
    if (scope !== "reading" && scope !== "shadow") throw new Error("非法 resume scope");
    const r = this.user.prepare("SELECT * FROM resume_state WHERE scope=?").get(scope);
    if (!r) return null;
    return {
      scope: r.scope, refId: r.ref_id, locator: JSON.parse(r.locator_json || "{}"),
      contentHash: r.content_hash, updatedAt: r.updated_at,
    };
  }
`;
if (s.includes("saveResumeState(scope")) { console.log("skip"); }
else {
  if (!s.includes(anchor)) throw new Error("anchor missing");
  fs.writeFileSync(fp, s.replace(anchor, add), "utf8");
  console.log("patched core");
}
