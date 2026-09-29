// 前端查词面板：功能词条目展示说明 + 仍可看释义
const fs = require("fs");
const fp = "src/App.tsx";
let s = fs.readFileSync(fp, "utf8");
const oldStr = `              {entry.cardable === false ? (
                <div className="muted">{entry.translation}</div>
              ) : senses.length === 0 ? (`;
const newStr = `              {entry.cardable === false ? (
                entry.kind === "function" ? (
                  <div>
                    <div className="muted">功能词（冠词、介词、连词、代词等封闭词类），随用随会，不建卡。</div>
                    {entry.translation && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {entry.translation.split("\\\\n").slice(0, 3).join("；")}
                      </div>
                    )}
                  </div>
                ) : <div className="muted">{entry.translation}</div>
              ) : senses.length === 0 ? (`;
if (s.includes(newStr)) { console.log("skip"); }
else {
  if (!s.includes(oldStr)) throw new Error("锚点缺失");
  s = s.replace(oldStr, newStr);
  fs.writeFileSync(fp, s, "utf8");
  console.log("patched");
}
