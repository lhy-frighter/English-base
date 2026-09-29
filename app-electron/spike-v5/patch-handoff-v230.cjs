const fs = require("fs");
const fp = "../交接文档.md";
let s = fs.readFileSync(fp, "utf8");
if (s.includes("V8-0 数据契约")) { console.log("already present"); process.exit(0); }
const entry = [
"# 个人英语能力底座 · 交接文档",
"",
"> 更新：2026-09-23 · 版本 v2.30.0（**V8-0 数据契约：对话表与 ADR-6**）",
"> - **ADR-6 立项，状态 APPROVED WITH CONDITIONS**（项目根新增 `ADR-6.md`）：裁决级联语音流水线（采集→ASR→大脑→切句→TTS→播放）、大脑默认本地、Local/Cloud 双 Provider OpenAI 同构、显式打断协议、按键说话+自由对话首发；六条条件（云端显式同意+safeStorage、五段延迟实测、播放游标级已播文本、LLM 常驻租约、模型缓存单权威+SRI fail-deny、轮次状态机+turn_key）验证通过后才升 FROZEN。",
"> - **migration v13**（core.cjs 新增可重入 migrateV13）：",
">   - `conversation_sessions`（session_key UNIQUE、topic_json CHECK json_valid 存{goal,cefr,suggestedTurns}、open/closed/abandoned、active_ms、brain_engine/model_revision、augmented、cefr_at_start、turns_count）；",
">   - `conversation_turns`（turn_key UNIQUE、session FK ON DELETE CASCADE、七态 status：user_draft/user_confirmed/generating/speaking/completed/interrupted/failed、text/committed_text/played_char_end、provider/model_revision、asr_engine/model、edited、audio_ref、local/cloud_feedback_json CHECK、augment_status、interrupted_at、error_code、UNIQUE(session_id,seq)）；",
">   - `learning_sessions` 表重建：kind CHECK 扩展 `conversation`、unit 扩展 `turns`，旧行 SELECT 迁移、索引重建；检测到 CHECK 已含 conversation 则跳过（可重入）。",
"> - 云端同意/开关存 app_settings（cloud_consent_json），safeStorage 加密 key 密文存 cloud_key_cipher（V8-2/4 接线）。",
"> - 新增 TS 契约 `src/conversation/provider.ts`（Msg、ChatProvider、ConversationTopic、CloudConsent 默认全关、INTERRUPT 信号；不 import WebLLM）。",
"> - **验证**：新链 `test/v13-conversation.cjs`（全新库/七态/非法 status·role·json 拒绝/turn_key 与 seq 唯一/播放游标/级联删除/v12→v13 真实升级旧行不丢/拨版本重入）；五个旧链版本断言同步到 13；**39 链全绿**；tsc=0；隐藏冒烟通过，真实库已升 user_version=13、两表存在、旧会话保留。",
"> - 未装新依赖：WebLLM 留到 V8-1 spike（届时需用户批准 npm install）。",
"> - 下一步：V8-1 spike——WebGPU 可用性、Qwen2.5-1.5B/3B q4、20 个冻结教学场景、五段延迟 p50/p95、LLM 常驻+ASR/TTS 切换、共存 RSS、缓存权威裁决、SRI fail-deny。",
"",
].join("\r\n");
const oldHead = "# 个人英语能力底座 · 交接文档\r\n";
if (!s.startsWith(oldHead)) throw new Error("handoff head missing");
s = entry + s.slice(oldHead.length);
fs.writeFileSync(fp, s, "utf8");
console.log("handoff v2.30.0 entry added");
