const fs = require("fs");
// 1) JSX 加类
{
  const fp = "src/App.tsx";
  let s = fs.readFileSync(fp, "utf8");
  if (!s.includes("reader-head")) {
    const anchor = `        {tab === "read" && readerMode && ann && (
          <div className="page">
            <div className="page-head">
              <button className="ghost2" onClick={backToLibrary}>← 书库</button>`;
    if (!s.includes(anchor)) throw new Error("jsx anchor missing");
    s = s.replace(anchor, `        {tab === "read" && readerMode && ann && (
          <div className="page">
            <div className="page-head reader-head">
              <button className="ghost2" onClick={backToLibrary}>← 书库</button>`);
    fs.writeFileSync(fp, s, "utf8");
    console.log("jsx class added");
  } else console.log("jsx already");
}
// 2) CSS（.main padding 28px 36px，顶栏负边距铺满、内边距对齐正文）
{
  const fp = "src/styles.css";
  let s = fs.readFileSync(fp, "utf8");
  if (!s.includes(".reader-head")) {
    s += `
/* 阅读器顶栏冻结：滚动时退出/统计/译文开关始终可见 */
.reader-head {
  position: sticky; top: 0; z-index: 30;
  background: var(--bg, #fafaf7);
  margin: -28px -36px 16px;
  padding: 10px 36px;
  border-bottom: 1px solid var(--line, #e5e2da);
  flex-wrap: wrap; row-gap: 8px;
}
`;
    fs.writeFileSync(fp, s, "utf8");
    console.log("css added");
  } else console.log("css already");
}
