// 交接文档顶部插入 #150 spike 条目（带断言，可重跑）
const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const marker = "# 个人英语能力底座 · 交接文档\r\n";
if (!s.startsWith(marker)) {
  if (s.includes("#150 S13-0a Smart Turn v3.2 spike 通过")) {
    console.log("already patched"); process.exit(0);
  }
  throw new Error("marker not found");
}
if (s.includes("#150 S13-0a Smart Turn v3.2 spike 通过")) {
  console.log("already patched"); process.exit(0);
}
const block = [
"> 更新：2026-09-25 · **#150 S13-0a Smart Turn v3.2 spike 通过**（生产代码未动，无版本发布）",
"> - 模型 `smart-turn-v3.2-cpu.onnx`（int8，**8,679,182B**，sha256 `2bb026316b14a660486a75b1733cd3fbab8c2fd0314dc9af7be49f8cca967e4f`）已归档 `vendor/smart-turn/`，**BSD-2-Clause**（LICENSE 已归档）；Whisper Tiny encoder + 线性头，输入 input_features[1,80,800]、输出 logits（sigmoid>0.5 判说完）。",
"> - 冻结 50 条官方测试集样本（eng 35 / zho 15，标签均衡）：总体 acc **94%**、英文 **97.1%**、中文 **86.7%**，与官方基准（92.63/94.26/85.79）高度吻合 → 模型、mel、阈值全部验证正确；CPU 单次推理 **12–16ms**。",
"> - 中文 FNR 高（本测 14.3%、官方 9.26%，英文仅 1.99%）→ 产品必须有「最大等待 2.5s 强制提交 + 立即发送按钮」兜底。",
"> - 产物：`spike-v8/SMART-TURN-SPIKE-REPORT.md`、smartturn-{picked.json,meta.json,result.json}、smartturn-clips（50 f32）、smartturn-feats（50 feat）、smartturn-raw（50 flac）。",
"> - **下一步 #151**：TurnAssembler 状态机——VAD 候选停顿 → Smart Turn（mel 移植到 Worker TS，以本报告指标为回归基线）→ 说完才 Whisper 整轮转写一次；未说完继续收音；Smart Turn/VAD 不进 InferenceCoordinator 租约。",
">",
""
].join("\r\n");
s = marker + block + s.slice(marker.length);
fs.writeFileSync(p, s);
console.log("patched ok");
