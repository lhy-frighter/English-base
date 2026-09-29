const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = "# 个人英语能力底座 · 交接文档\r\n";
if (!s.startsWith(anchor)) { console.error("header anchor missing"); process.exit(1); }
const entry = [
"> 更新：2026-09-23 · 版本 v2.33.0（**V8-2b：文字对话 UI 与轮次状态机接线**）",
"> - **新增对话页 src/conversation/ConversationPage.tsx**（App.tsx 侧栏在「跟读」后加「对话」nav，tab 联合加 chat）：",
">   - 设置视图：左卡「开始新对话」——话题目标（必填）、6 个话题预设 chips（Campus life/Travel/Technology and AI/Hobbies/Job interview/Academic research）、CEFR 段选 A2/B1/B2/C1（默认 B1）、建议轮数 6/8/10/12（默认 8）；右卡「历史会话」（convList 最近 12 条，显示标题/时间/轮数/状态，点击进入，closed 也可继续）。",
">   - 聊天视图：sticky 页头（←新话题=abandon 回设置、标题、CEFR·n/建议轮数、结束并复盘）；user 右靛青气泡、assistant 左白气泡，generating 流式渲染，failed 显示 errorCode；user 气泡下方展示轻纠错（✏️ 铜金条）；底部输入条回车/按钮发送，busy 禁用。",
">   - 发送流程：生成 user/asst turn_key（幂等）→ convAddTurn user(user_confirmed)+assistant(generating) → 首次加载显示百分比进度 → systemPrompt + 最近 8 条临时窗口（#123 替换为 token 预算滑窗+摘要）→ stream(maxTokens 220) → parseCorrection 剥离末行 [CORRECTION: ...] → assistant completed/text/committedText，有纠错写 user 轮 localFeedback；失败 assistant failed/errorCode。",
">   - 结束复盘：加 assistant generating，用复盘 system prompt（两条优点+三个待复习点）stream(maxTokens 260) → completed → convClose(closed,activeMs) → 回设置并刷新历史。",
">   - 仪表盘接线：进入聊天 sessionBegin kind=conversation/unit=turns（key conversation:sessionKey），20s heartbeat（amount=user 轮数），activeMs 页面可见时每秒累计；结束/离开 sessionClose。",
"> - **新增 src/conversation/runtime.ts**：模块级单例 localEngine（LocalConversationEngine）与 CURRENT_MODEL=DEFAULT_LOCAL_MODEL(3B)，页面切换/重挂载复用会话级常驻引擎；V8-3 再接推理租约。",
"> - **core.cjs 新增 6 个对话方法**（位置在 reapAbandonedSessions 前；_convSessionDto/_convTurnDto 蛇形→驼峰、topic/feedback JSON parse）：",
">   - convCreate：topic={goal 必填 trim≤500、cefr 默认 B2、suggestedTurns 2–40 钳制默认 8}；sessionKey 幂等；status open、brain_engine 默认 local、title=goal 前 200 字。",
">   - convList（ORDER BY started_at DESC,id DESC）、convGet（turns seq ASC）。",
">   - convAddTurn：turnKey 幂等（同 key 返回旧行）；role user/assistant；默认 status user→user_confirmed、assistant→generating；seq 缺省同 session MAX+1；写后更新 last_active_at 与 turns_count（user 轮数）。",
">   - convUpdateTurn：白名单字段动态 UPDATE（status/text/committedText/playedCharEnd/errorCode/interruptedAt/provider/modelRevision/audioRef/localFeedback/cloudFeedback/augmentStatus/edited），feedback 非数组归一 []。",
">   - convClose：open→closed/abandoned，写 ended_at、activeMs 单调钳制；重复 close 幂等。",
">   - beginSession 放开 kind=conversation、unit=turns；修两个 NOT NULL 坑（audio_ref/error_code INSERT 用 ''）。",
"> - **接线**：main.cjs 注册 6 个 conv* IPC（api 对象，sessionClose 后）；preload.cjs 暴露；api.ts 加 ConvSession/ConvTurn 类型与 6 方法签名、sessionBegin kind/unit 加宽。",
"> - **新测试链 test/conv-session.cjs**（已加入 npm test，位于 v13-conversation 后）：空目标拒绝/默认值/钳制/幂等、turnKey 幂等/seq 自增/默认 status、completed 更新/非法 status CHECK 拒绝/feedback 写入与归一/播放游标、seq 升序、convList 倒序、close closed/abandoned/重复幂等、turns_count、beginSession conversation/turns 与非法 kind 拒绝/非法 unit 归一。",
"> - **验证**：全量 npm test 零失败（**40 链**）；tsc=0；vite build=0；node -c core.cjs/main.cjs 通过；真机启动 4 进程存活、主进程与日志无错误。",
"> - **待用户真机闸门**（GUI/目视只能本人）：①设置页双栏布局与预设 chips；②开始对话后流式回复、③故意写错句验证轻纠错展示、④结束并复盘生成总结、⑤历史会话点入。",
"> - 下一步：#123 V8-2c token 预算滑窗+摘要（摘要仅提示上下文、不覆盖原始轮次/纠错/成卡，按 token 预算并为输出预留空间）；#124 V8-2d 云端显式同意三开关+safeStorage。",
"",
].join("\r\n");
s = anchor + entry + s.slice(anchor.length);
fs.writeFileSync(p, s);
console.log("v2.33.0 entry inserted");
