const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
if (s.indexOf("V10 一体化联动") !== -1) { console.log("already"); process.exit(0); }
const lines = [
"> 更新：2026-09-25 · **V10 一体化联动（#152–#158 + migration v15）封板**（无版本发布；全双工语音通话挂起：8GB 显存装不下、云端 0.18 元/分钟暂不接；商业化暂缓）",
"> - **migration v15**：①asset_evidence 重建扩展为 **十值 result**（新增 practice_observation/improved/recognized/used_spontaneously/used_prompted/used_after_correction，旧 6 值拷贝）；②shadow_sentences 加 origin_kind（reading/conversation）/origin_ref（可重入 ALTER）；③新建 **debrief_drafts**（复盘草稿持久化，UNIQUE(origin_kind,origin_ref)）。",
"> - **#152 跟读 inline drill + 句级三分**：问题词点击切换开合（再点关闭）；就地卡「模型音/我的录音/再读这个词/存入复习/详细编辑」+ 问题类型三分（音素/弱读/节奏，系统建议 sub→音素、miss→弱读）；「再读」走 ASR 得**文本匹配度**（资产不存在纯练习不写库，已存在才写 practice_observation/improved）；「存入复习」复用已有发音资产不重建 + 产出卡；句级三分卡：文本匹配度/完整度/流利度（确定性 fluencyScore）。",
"> - **#153 复盘草稿 + 来源反向视图**：core debrief 七方法（put/list/get/setStatus、textDebriefCandidates、textLearnedSummary、conversationSummary 经 session→turns）；DebriefPanel 候选勾选/批量加入复习（word 语境建卡、其余 captureAsset，幂等）/跳过；离开阅读自动生成草稿、阅读头部「本文已学 X 词·N 资产·Z 句通过」+「复盘本文」；今日页「待复盘」；对话「结束并复盘」写草稿。",
"> - **#154 用出证据三分类**：detectUsedAssets（中文轮跳过；word lemma 集合 + chunk 规范化整句匹配；**prompted→used_prompted、纠正后→used_after_correction、否则 used_spontaneously**），source_ref 精确到 turnKey；grammar 不做自由对话识别。",
"> - **#155 复习卡「再用一次」**：assetUseCounts 汇总四类用出；资产卡背展示统计 + 按钮 → 自动建引导会话（promptedRef 标记，用户造句记 used_prompted）。",
"> - **#156 弱点跨模块调度 priority-v1**：assetPriority 有界加性六分项（overdue 0–3/recurrence 0–3/recent_error 0–2/exam 0–1/output_gap 0–1 − success_decay 0–2），priorityList 带中文推荐理由；今日页「弱点复习」区块；对话启动自动注入 ≤2 个弱点（系统提示词第 4 参 weakAssets，明确邀请后用出 = prompted 非 spontaneous）。",
"> - **#157 跟读达标回写**：shadowPractice 带 origin；shadowPassedForSentences/shadowPassedForTurn；阅读句末/对话助手气泡显示「✓ 已跟读通过」；sendToShadow(text,opts) 支持 conversation origin。",
"> - **#158 考试错题跨域 + 考后薄弱清单**：examWeakList 返回 ExamWeakItem（题干/题型/答案/考点/is_listening）；错题卡听力题「🎙 送跟读台精听」、非听力「💬 对话演练」；今日页「考后薄弱清单」区块。",
"> - **验证**：全量 **53 链零失败**（新增 v15-migration 28、debrief 扩至 47；s11-shadow-review 偶发 flaky 独立重跑通过）；tsc=0；vite build=0（dist 含 ort/bergamot/vad/smartturn/legal 拷贝）。",
"> - **真实库现状**：data/user.sqlite 仍 user_version=14，**下次启动自动升 v15**（自动备份 pre-v15、失败回滚）。",
"> - **待真机复验（用户本人，V10 统一复验）**：①inline drill 再读/存卡/tag 切换/三分；②复盘全链（离开自动草稿→今日待复盘→批量加入幂等）；③用出三分类手感；④再用一次引导造句；⑤弱点区块理由 + 对话弱点注入；⑥✓ 标记；⑦错题精听/对话演练 + 考后清单；⑧更早挂账：免提自然轮次、VAD 五项、ASR 封板真机闸门。",
">",
];
const marker = "# 个人英语能力底座 · 交接文档\r\n";
if (s.indexOf(marker) !== 0) throw new Error("doc header mismatch");
s = marker + lines.join("\r\n") + "\r\n" + s.slice(marker.length);
fs.writeFileSync(p, s);
console.log("inserted");
