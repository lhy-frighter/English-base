const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/api.ts";
let s = fs.readFileSync(p, "utf8");
const old = `export interface CloudConsent {
  profile: boolean;      // 学习画像
  historyText: boolean;  // 历史对话文本
  audio: boolean;        // 录音原文
  baseUrl: string;       // OpenAI 兼容端点
  model: string;         // 云端模型名
  updatedAt: number;
}`;
const neu = `export interface CloudConsent {
  profile: boolean;      // 学习画像
  historyText: boolean;  // 历史对话文本
  audio: boolean;        // 录音原文
  grammarCloud: boolean; // 文本送云端做语法深度分析（S15-1）
  baseUrl: string;       // OpenAI 兼容端点
  model: string;         // 云端模型名
  updatedAt: number;
}`;
if (s.indexOf(old) === -1) { console.log("ANCHOR MISSING"); process.exit(2); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log("api.ts patched");
