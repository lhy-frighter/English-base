const fs = require("node:fs");

function patch(file, oldStr, newStr, label) {
  let c = fs.readFileSync(file, "utf8");
  const eol = c.includes("\r\n") ? "\r\n" : "\n";
  const norm = (s) => s.replace(/\r?\n/g, eol);
  const o = norm(oldStr), n = norm(newStr);
  if (!c.includes(o)) { console.log(label + " NOT FOUND"); process.exit(1); }
  c = c.replace(o, n);
  fs.writeFileSync(file, c);
  console.log(label + " patched");
}

// 1) styles.css
patch("D:/vibe coding/英语学习/app-electron/src/styles.css",
`/* #209：查词面板顶部原先写死 top:70px，在窗口标题栏较高（深色模式可达 40px）
   或缩放比例不同时会紧贴标题栏，视觉上像被顶部遮住。改用 max() 留出
   标题栏 + 间距的最小余量，并用 top 百分比锚定，避免任何系统栏高度下被吞。 */
.panel {
  position: fixed; right: 26px; top: max(70px, 7vh); width: 360px; max-height: calc(100vh - 120px);`,
`/* 查词面板顶部锚定：阅读页冻结头 .reader-head（sticky, z-index:30）为两行高，
   实测在 125% 缩放下底部约 160 CSS px。面板 z-index 低于冻结头，top 必须让开
   冻结头，否则原词/音标行会被盖住（见 #209 与 2026-10-04 遮挡修复）。 */
.panel {
  position: fixed; right: 26px; top: max(168px, 15vh); width: 360px; max-height: calc(100vh - 180px);`,
"styles.css");

// 2) theme.css
patch("D:/vibe coding/英语学习/app-electron/src/theme.css",
`/* #209：查词面板在窄窗口/高标题栏下顶部不被遮住的补充保险：
   面板离视口顶至少 7vh（≈标题栏+间距），内容超高时内部滚动。 */
@media (max-height: 700px) {
  .panel { top: max(64px, 7vh); max-height: calc(100vh - 100px); }
}`,
`/* 矮窗口补充保险：同样让开两行冻结阅读头（约 150px），内容超高时内部滚动。 */
@media (max-height: 700px) {
  .panel { top: max(150px, 20vh); max-height: calc(100vh - 162px); }
}`,
"theme.css");

// 3) App.tsx
patch("D:/vibe coding/英语学习/app-electron/src/App.tsx",
`        {entry && (
          <aside className="panel">`,
`        {entry && (
          <aside className="panel" key={entryKey}>`,
"App.tsx");
