const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/docs/交接文档.md";
let doc = fs.readFileSync(p, "utf8");
const EOL = "\r\n";
const entry = [
"> 更新：2026-10-04 · **阅读词卡弹窗遮挡修复（UI）**",
"> - 问题：阅读页冻结头 .reader-head（sticky，z-index:30，两行高约 160 CSS px）盖住查词浮卡 .panel（z-index:10，原 top:max(70px,7vh)），wikt-en 长词条切换后原词/音标行不可见；同时同一 aside DOM 节点在词条切换间保留内部滚动位置。",
"> - 修复：.panel top 改为 max(168px,15vh)、max-height:calc(100vh - 180px)（styles.css）；矮窗口媒体查询（max-height:700px）同步改为 top:max(150px,20vh)（theme.css）；aside 加 key={entryKey}，每个词条重挂载，滚动位置归零（App.tsx）。",
"> - 排查：全站固定定位浮层已审计，.trans-strip/.tts-pill/.assess-pop/.cap-overlay 及抽屉/模态均锚定底部或全屏，无同类顶部遮挡；跟读页（ShadowPage）无固定浮卡。",
"> - 验证：tsc=0、vite build=0；目视由用户复验（点 wikt-en 扩展词、长词条滚动后切词、窄窗口）。",
">",
];
const lines = doc.split(EOL);
lines.splice(1, 0, entry.join(EOL));
fs.writeFileSync(p, lines.join(EOL));
console.log("handoff patched");

