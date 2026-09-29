// 回收页加返回键（记住来源：今日页/词库页）
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

// 1) App.tsx
const fp = path.join(root, "src", "App.tsx");
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

rep(
`  const [recycleMsg, setRecycleMsg] = useState("");
  const RECYCLE_PAGE = 50;`,
`  const [recycleMsg, setRecycleMsg] = useState("");
  const [recycleFrom, setRecycleFrom] = useState<"today" | "lex">("today");
  const RECYCLE_PAGE = 50;`,
"来源 state");

rep(
`  const openRecycle = useCallback(() => {
    setTab("recycle"); setRecycleMsg(""); setRecycleSel(new Set());
    void loadRecycle(recycleMultiOnly);
  }, [recycleMultiOnly, loadRecycle]);`,
`  const openRecycle = useCallback((from: "today" | "lex" = "today") => {
    setRecycleFrom(from);
    setTab("recycle"); setRecycleMsg(""); setRecycleSel(new Set());
    void loadRecycle(recycleMultiOnly);
  }, [recycleMultiOnly, loadRecycle]);`,
"openRecycle 带来源");

rep(
`                      <button className="tcard" onClick={openRecycle}>
                        <b>漏网词回收</b>`,
`                      <button className="tcard" onClick={() => openRecycle("today")}>
                        <b>漏网词回收</b>`,
"今日卡调用");

rep(
`              <button className="btn-mini recycle-entry" onClick={openRecycle}`,
`              <button className="btn-mini recycle-entry" onClick={() => openRecycle("lex")}`,
"词库入口调用");

rep(
`            <div className="page-head">
              <h2>漏网词回收</h2>`,
`            <div className="page-head">
              <button className="btn-mini recycle-back" onClick={() => setTab(recycleFrom)}>← 返回{recycleFrom === "lex" ? "词库" : "今日"}</button>
              <h2>漏网词回收</h2>`,
"返回按钮");

fs.writeFileSync(fp, s, "utf8");
console.log("App.tsx saved");

// 2) 同步注入源 txt（保持一致，防未来重注）
const txtFp = path.join(__dirname, "recycle-page.tsx.txt");
let t = fs.readFileSync(txtFp, "utf8");
if (!t.includes("recycle-back")) {
  const a = `            <div className="page-head">
              <h2>漏网词回收</h2>`;
  const b = `            <div className="page-head">
              <button className="btn-mini recycle-back" onClick={() => setTab(recycleFrom)}>← 返回{recycleFrom === "lex" ? "词库" : "今日"}</button>
              <h2>漏网词回收</h2>`;
  if (!t.includes(a)) throw new Error("txt 锚点缺失");
  t = t.replace(a, b);
  fs.writeFileSync(txtFp, t, "utf8");
  console.log("txt synced");
}
