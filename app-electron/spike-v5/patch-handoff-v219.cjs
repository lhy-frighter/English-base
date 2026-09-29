// 交接文档升 v2.19.0（S9-3 今日页）
const fs = require("fs");
const path = require("path");
const doc = path.resolve(__dirname, "..", "..", "交接文档.md");
let s = fs.readFileSync(doc, "utf8");
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("未找到锚点: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}
const NL = "\r\n";
const header =
"> 更新：2026-09-21 · 版本 v2.19.0（**S9-3「今日」首页：冷启动进今日 + 唯一主按钮 + 次级入口**；v2.18.0 为 S9-2 断点续学，真机闸门已过）" + NL +
"> - **固定调度规则 v1**（core `todayBrief()`）：①有到期卡或实际可学新卡→复习；②无卡且有阅读断点→继续精读；③都没有→今日好文。" + NL +
"> - **队列口径**：queue = due_review + min(今日新卡余额 NEW_PER_DAY=12, 库中 state=0 新卡实数)；空库不会因「余额 12」误推复习（本版修正点）。每卡预估 30 秒，最少 1 分钟。" + NL +
"> - **core/IPC**：`todayBrief()` 返回 `{primary, due_cards, fresh_today, queue, est_minutes, resume:{refId,title,pi,ch}, wrong_due}`；IPC todayBrief（main/preload/api.ts，新增 TodayBrief 接口）。" + NL +
"> - **前端**：Tab 联合类型新增 `today` 且**默认进今日（不自动恢复上次 tab）**，侧栏导航首位「今日」；今日页一个大主按钮（复习 N 张约 M 分钟 / 继续精读《标题》第 N 段 / 看看今日好文），下方次级卡片：继续精读（有断点且非主按钮时）、错题复习（wrong_due>0）、每日好文、跟读台；进入今日页自动刷新 brief。跟读续练/漏网词回收次级卡待 S11-b/c 落地后再出现。" + NL +
"> - **样式**：styles.css 末尾 `.today-page/.today-primary/.tp-main/.tp-sub/.today-sec/.today-cards/.tcard`（铜色主按钮，无新依赖、纯 CSS）。" + NL +
"> - **验证**：新增 `test/s9-today.cjs` **8 断言**（空库→feed、有断点无卡→reading 且带标题段号、建卡后→review 且队列受新卡实数约束、删文 resume 清空）；**31 链 npm test 全绿**、tsc=0、vite build=0、隐藏冒烟通过。" + NL +
"> - **待用户目视闸门**：冷启动是否落在今日；三种状态主按钮文案与跳转（有卡→复习直接开练；无卡有断点→打开文章并恢复段落；全空→好文页）；错题到期卡仅在有到期错题时出现。" + NL;
rep("> 更新：2026-09-21 · 版本 v2.18.0（",
    header + "> 更新：2026-09-21 · 版本 v2.18.0（",
"头部");

rep("   ├─ test/s9-resume.cjs   # v2.18 S9-2 resume_state UPSERT/读取/校验/删文级联（13 断言）",
    "   ├─ test/s9-resume.cjs   # v2.18 S9-2 resume_state UPSERT/读取/校验/删文级联（13 断言）" + NL +
    "   ├─ test/s9-today.cjs    # v2.19 S9-3 todayBrief 三态调度/队列口径/删文（8 断言）",
"代码地图");

rep("npm test     # 30 链：", "npm test     # 31 链：", "§8 链数");
rep("s9-session(27) + s9-resume(13) + model-store(53)",
    "s9-session(27) + s9-resume(13) + s9-today(8) + model-store(53)",
"§8 链接入");

rep("**S9-2 断点续学已完成（v2.18.0，待用户杀进程真机闸门）**。下一步＝**#104 S9-3「今日」首页**：冷启动进今日；顶部唯一主按钮「继续今日学习」（到期复习优先，其次 resume_state 继续上次阅读，显示预计卡数/分钟）；其下四类次级入口（阅读/跟读/考试/好文）；不再自动恢复上次 tab。之后 S10 仪表盘（聚合 API 按《S9-数据契约》§4 四互斥主流 UNION ALL，查词/成卡/翻译只计次数不折分钟）→ S11 → V8 对话",
    "**S9-3「今日」首页已完成（v2.19.0，待用户目视闸门）**。下一步＝**#105 S10-1 仪表盘聚合 API**：按《S9-数据契约》§4 用只读 UNION ALL 聚合四互斥主流（read/shadow/review/exam）分钟序列、动作次数（查词/成卡/翻译只计次数不折分钟）、热力图、连胜、日时间线，能力趋势读 coverage_assessments 不可变快照；跨天/日界测试。之后 #106 S10-2 仪表盘前端（投入区/能力区分开）→ S11 → V8 对话",
"§9 主线");

fs.writeFileSync(doc, s, "utf8");
console.log("完成", n);
