const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const nl = "\r\n";
const anchor = "# 个人英语能力底座 · 交接文档" + nl;
if (!s.startsWith(anchor)) throw new Error("header anchor missing");
const entry = [
"> 更新：2026-09-24 · 版本 v2.36.0（**#124 V8-2d：云端显式同意 + safeStorage 加密 key**）",
"> - **原则落地（ADR-6 约束①）**：默认完全离线，本地大脑失败**不自动联网兜底**；云端发送必须由用户逐项显式授权，授权可查看、可随时撤回。",
"> - **新模块 cloud-consent.cjs**：CloudConsent 结构 {profile, historyText, audio, baseUrl, updatedAt}；DEFAULT_CONSENT 全关；normalizeConsent（布尔强转、端点截断 300、多余字段剔除、损坏输入回默认、绝不抛错）；parseConsent（解析 app_settings 中的 cloud_consent_json，损坏/缺失回默认）。",
"> - **core.cjs**：新增通用 getSetting(k, dflt)/setSetting(k, v)（app_settings upsert）。",
"> - **main.cjs**：electron require 加 safeStorage；新增 4 个 IPC：",
">   - cloudGetConsent：返回 consent + keySet + encryptionAvailable；",
">   - cloudSaveConsent：normalizeConsent 后写 cloud_consent_json；",
">   - cloudSetKey：safeStorage.isEncryptionAvailable 校验 → encryptString（Windows DPAPI）→ base64 存 cloud_key_cipher；空 key/加密不可用均抛错；",
">   - cloudClearKey：清空密文。",
"> - **preload.cjs**：暴露 cloudGetConsent/cloudSaveConsent/cloudSetKey/cloudClearKey；**api.ts**：CloudConsent 接口与四方法类型。",
"> - **ConversationPage 设置页**：新增「云端设置（可选）」卡片（跨两列）——文案明示「默认完全离线、本地失败不自动联网、逐项授权可随时关闭」；三个独立勾选（上传学习画像 / 上传历史对话文本 / 上传录音原文）；云端端点输入；API key 密码框，保存后显示「已加密保存」并可清除。",
"> - **新测试链 test/cloud-settings.cjs**（已加入 npm test，conv-context 后）：settings 默认/覆盖读写、parseConsent 空/合法/损坏、normalizeConsent 缺省/真值强转/超长截断/多余字段——14 checks。",
"> - **验证**：全量 npm test 零失败（**42 链**）；tsc=0；vite build=0；main/core 语法通过。",
"> - **待用户真机闸门**：设置页三个开关勾选后重开仍保持；key 保存后显示「已加密保存」，清除后消失；关闭全部开关状态下任何操作都不产生外网请求。",
"> - **未做（后续切片）**：真正的云端 Provider 调用与「本次/长期」发送弹窗在 V8-4；V8-3 语音全链路（五段延迟、LLM 租约入 coordinator、ASR/TTS 按轮切换、played_char_end、共存 RSS 实测）。",
].join(nl) + nl;
s = anchor + entry + s.slice(anchor.length);
fs.writeFileSync(p, s);
console.log("handoff v2.36.0 inserted");
