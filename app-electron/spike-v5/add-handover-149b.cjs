const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = "全 miss 留空。";
if (s.indexOf(anchor) < 0) throw new Error("anchor missing");
const lines = [
  "\r\n> - **#149 跟读台问题词 → 发音资产标注**：",
  "\r\n>   - 跟读结果问题词弹条新增「🎯 记为发音问题」：sheet 预填 pronunciation，词级 IPA 自动填（api.phonetics），疑似替换默认「音素」、漏词默认「弱读」，可改连读/重音/节奏；确认后 onDone 回传 CaptureAssetResult，自动加 pron_production 产出卡。",
  "\r\n>   - 卡顿 pill 可点击 → 预填「节奏」发音资产。",
  "\r\n>   - 对话 sheet 发音视图新增「🎙 送入跟读台检测这句」（ConversationPage 新 prop onSendShadow，App 走 sendToShadow 跳跟读台），闭合「对话句→跟读检测→个别词发音标注」链路。",
].join("");
s = s.replace(anchor, anchor + lines);
fs.writeFileSync(p, s);
console.log("handover #149 added");
