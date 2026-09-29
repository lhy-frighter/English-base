// 交接文档顶部插入 #151 完成条目（CRLF，倒序）
const fs = require("node:fs");
const p = "../交接文档.md";
let s = fs.readFileSync(p, "utf8");
const marker = "# 个人英语能力底座 · 交接文档\r\n";
if (!s.includes(marker)) throw new Error("title marker not found");
if (s.includes("#151 S13-0b TurnAssembler + 自动提交状态机完成")) {
  console.log("already inserted"); process.exit(0);
}
const entry = [
  "> 更新：2026-09-25 · **#151 S13-0b TurnAssembler + 自动提交状态机完成**（免提自然轮次，无版本发布；生产改动：vad-controller.ts、ConversationPage.tsx、vite.config.js、tsconfig.json + 6 个新文件）",
  "> - 新增 src/conversation/：fft.ts（混合基 2/5/3 Cooley-Tukey FFT，11 tests）、smartturn-mel.ts（Whisper 8s mel 移植，50 冻结 feat 对照 max err 1.05e-5）、smartturn-manifest.ts（模型清单+阈值 0.5+MAX_WAIT 2500ms）、smartturn-worker.ts（独立 Worker，ort-web numThreads=1 免 SAB）、smartturn.ts（服务单例：fetch+字节数+SHA256 校验、串行 predict、fatal reset）、turn-assembler.ts（idle/listening/awaiting 状态机 + energyTrim，15 tests）。",
  "> - ConversationPage 接线：VAD onSpeechStart→assembler.notifyStart、onSpeechEnd→assembler.notifyEnd；整轮收束 onCommit 后才 Whisper base 转写一次并发送（原 onVadSpeechEnd 主体重构为 transcribeAndSend）；awaiting 态提示区出现「立即发送」按钮（commitNow）；关免提/新话题 assembler.reset + smartTurn.dispose。",
  "> - 组装规则：各段 energyTrim（20ms 帧 RMS，thr=max(0.01,0.05×peak)，首尾保留 120ms，退化回退原段）；段间按墙钟 gap（tStart−(prev.tEnd−1400)，clamp gap−240 于 60–3000ms）补静音；判定服务异常时 prob=1 逐段直接提交，不阻塞学习。",
  "> - 工程配套：vad-controller 三回调带 performance.now() 时间戳；vite copySmartTurn（模型→dist/smartturn、ort mjs/wasm→dist/smartturn/ort）；tsconfig 开 allowImportingTsExtensions；手工 vendor onnxruntime-common（1.22-dev，供 ort-web 类型解析）。",
  "> - **验证**：全量 **50 链零失败**（新增 fft 11、smartturn-mel 50 对照、turn-assembler 15）；tsc=0；vite build=0（copy-smartturn 3 文件）。",
  "> - **待真机闸门（用户本人）**：免提说含句中停顿的一整轮不被截断、说完自动提交延迟手感、awaiting「立即发送」、关免提后 Smart Turn Worker 退出。",
  "> - **下一步 #152**：S13-a-1 跟读 inline drill + 句级三分。",
  ">",
  "",
].join("\r\n");
s = s.replace(marker, marker + entry);
fs.writeFileSync(p, s);
console.log("inserted");
