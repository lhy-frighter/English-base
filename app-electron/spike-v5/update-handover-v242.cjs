const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = "# 个人英语能力底座 · 交接文档\r\n";
if (!s.startsWith(anchor)) throw new Error("header anchor missing");
const entry = [
"> 更新：2026-09-24 · 版本 v2.42.0（**V9 收尾：AssetCaptureSheet「转为练习」+ 分类型复习渲染 + 四模块接线 #142–#144**）",
"> - **#142 AssetCaptureSheet 统一「转为练习」组件**（src/components/AssetCaptureSheet.tsx）：底部弹层，打开时按选中文本建议类型（≤1 词→word，否则 chunk），五类按钮用户可改；canonical/gloss 可编辑，类型专属字段（chunk 语域、grammar 练习形式+正确答案、pronunciation 问题类型+IPA、concept 考点）；卡型预览、pronunciation 听示范。word 走宿主既有建卡链路（onWord），其余四类走 api.captureAsset；幂等键 ui-<origin>-<ref>-<kind>-<hash>，结果态区分新建/追加相遇/已收录。",
">   - 诚实取舍：任务标签含「DictPanel 抽取」，词典面板为 App.tsx 内联块、依赖十余个本地 state，纯抽取无用户价值且风险大，**未做**；统一「转为练习」入口已交付。",
"> - **#143 分类型复习渲染**：core getDue 五类资产卡正反面——chunk_recall（正面英文/背面中文意图）、chunk_cloze（例句挖空）、grammar_pattern（题目/答案/解释）、pron_perception（正面 TTS 播音/背面文本+IPA）、concept_recall（考点/策略）；DTO 加 asset_kind/payload。复习页：cardbar 五类标签、听辨正面自动播音（空格重播）、资产卡专属背面（不渲染词形/同根等单词区块）。",
"> - **#144 跨模块接线收口**：阅读（划选区 trans-strip）、对话（用户/助手气泡「转为练习」）、跟读台（① 目标句卡片）、考试错题本（每张错题卡）四个入口全部接通 AssetCaptureSheet。",
"> - **验证**：全量 **45 链零失败**（v14-migration 40 checks、asset-service 33 checks）；tsc=0；vite build=0；main/core/model-store/cloud-consent/preload 语法通过。",
"> - **V9 剩余挂账（未做，待裁决）**：①tutor-gate + TEACH 尾块——对话中中文兜底求说法（code-switching）、AI 教学点自动成卡；②#138 云端发音/语法深度分析；③真实库下次启动自动 v13→v14 迁移（已在副本验证），迁移后请确认数据。",
"> - **VAD v2.41.0 真机 5 项闸门仍等用户本人验收**（免提对话）。",
">",
"",
].join("\r\n");
s = anchor + entry + s.slice(anchor.length);
fs.writeFileSync(p, s);
console.log("handover updated to v2.42.0");
