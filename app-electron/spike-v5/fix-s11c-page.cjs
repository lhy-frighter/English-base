// 修正：删除重复 refreshToday；送句只传 textId（title 由 core 查 texts 补）
const fs = require("fs");
const fp = "src/App.tsx";
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}
rep(
`  const openShadowReview = () => { setShadowReviewNonce((n) => n + 1); setTab("shadow"); };
  const refreshToday = useCallback(() => { void api.todayBrief().then(setToday).catch(() => {}); }, []);`,
`  const openShadowReview = () => { setShadowReviewNonce((n) => n + 1); setTab("shadow"); };`,
"删除重复 refreshToday");
rep(
`onClick={() => sendToShadow(selText, ann?.text_id, ann?.title)}`,
`onClick={() => sendToShadow(selText, ann?.text_id)}`,
"送句只传 textId");
fs.writeFileSync(fp, s, "utf8");
console.log("App fixed");
