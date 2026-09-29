const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/api.ts";
let s = fs.readFileSync(p, "utf8");

const ifaceOld = `export interface CloudConsent {
  profile: boolean;      // 学习画像
  historyText: boolean;  // 历史对话文本
  audio: boolean;        // 录音原文
  baseUrl: string;       // OpenAI 兼容端点
  updatedAt: number;
}`;
const ifaceNew = `export interface CloudConsent {
  profile: boolean;      // 学习画像
  historyText: boolean;  // 历史对话文本
  audio: boolean;        // 录音原文
  baseUrl: string;       // OpenAI 兼容端点
  model: string;         // 云端模型名
  updatedAt: number;
}`;
if (!s.includes(ifaceOld)) throw new Error("CloudConsent iface anchor missing");
s = s.replace(ifaceOld, ifaceNew);

const keyOld = `  cloudClearKey: () => Promise<{ keySet: boolean }>;
`;
const keyNew = `  cloudClearKey: () => Promise<{ keySet: boolean }>;
  cloudGetKey: () => Promise<string>;
`;
if (!s.includes(keyOld)) throw new Error("cloudClearKey api anchor missing");
s = s.replace(keyOld, keyNew);

fs.writeFileSync(p, s);
console.log("api.ts cloud model + cloudGetKey typed");
