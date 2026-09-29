// 交接文档升 v2.18.0（S9-2 断点续学）
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
"> 更新：2026-09-21 · 版本 v2.18.0（**S9-2 断点续学：阅读锚点 5s 节流落库 + 重开恢复 + 哈希漂移提示**；v2.17.0 为 S9-1 会话记录）" + NL +
"> - **锚点口径（《S9-数据契约》§1.2）**：段落索引 `pi` + 段内字符偏移 `ch`（caretPositionFromPoint/caretRangeFromPoint 取视口线位置）+ 该段英文的 SHA256 `content_hash`；**不存滚动像素**，字体/窗口变化后仍可恢复。" + NL +
"> - **core**：`saveResumeState(scope,refId,locator,hash)` UPSERT（每 scope 一行，scope 限 reading/shadow，locator 走 JSON 校验）、`getResumeState(scope)`；删文已级联清 reading 断点（v11 既有）。" + NL +
"> - **IPC**：resumePut/resumeGet（main+preload+api.ts，新增 ResumeState 类型）。" + NL +
"> - **App.tsx**：`.reader` 挂 readerRef；滚动停止后最多 5s 落一次（位置未变不写），页面隐藏/beforeunload/切文章/回书库时立即补落；打开旧文章 220ms 后按锚点段落 `scrollIntoView` 归位并提示「已恢复到上次阅读位置（第 N 段）」；机翻到达导致版面下移后按同段重新归位一次；哈希对不上（文章被替换）回开头并提示「原文已变化」；词卡跳转原文（jumpWord）优先于断点恢复。" + NL +
"> - **shadow scope 预留**：跟读台断点未写入（单句流程，S11-c 跟读句复习时再接）。" + NL +
"> - **验证**：新增 `test/s9-resume.cjs` **13 断言**（UPSERT 单行/覆盖、DTO 读回、双 scope 独立、非法 scope/坏 JSON 拒绝、删文级联 reading 保留 shadow）；**30 链 npm test 全绿**、tsc=0、vite build=0、隐藏冒烟通过。" + NL +
"> - **待用户真机闸门（杀进程）**：打开一篇长文滚到中段 → 等 ≥5s（或切走标签页触发立即落库）→ 任务管理器直接结束进程 → 重开应用、从书库打开同一篇 → 应自动回到该段并出现恢复提示；再测从词卡点词跳转原文时不被断点覆盖。" + NL;
rep("> 更新：2026-09-21 · 版本 v2.17.0（",
    header + "> 更新：2026-09-21 · 版本 v2.17.0（",
"头部 v2.18");

rep("   ├─ test/s9-session.cjs  # v2.17 S9-1 会话 begin/heartbeat/close、启动回收、相遇表/覆盖率写入与回填（27 断言）",
    "   ├─ test/s9-session.cjs  # v2.17 S9-1 会话 begin/heartbeat/close、启动回收、相遇表/覆盖率写入与回填（27 断言）" + NL +
    "   ├─ test/s9-resume.cjs   # v2.18 S9-2 resume_state UPSERT/读取/校验/删文级联（13 断言）",
"代码地图测试");

rep("npm test     # 29 链：", "npm test     # 30 链：", "§8 链数");
rep(" + unicode-words(12) + s9-contract(34) + s9-session(27) + model-store(53)",
    " + unicode-words(12) + s9-contract(34) + s9-session(27) + s9-resume(13) + model-store(53)",
"§8 链接入");

rep("**S9-1 会话记录已完成（v2.17.0）**。下一步＝**#103 S9-2 断点续学**（resume_state 写入：阅读锚点段落 pi+段内字符 ch+content_hash，5s 节流；冷启动/继续上次恢复；真 Electron 杀进程闸门：重开后落在原段落、open 会话被回收）→ #104 S9-3 今日页（唯一主按钮）→ S10 仪表盘（聚合 API 按《S9-数据契约》§4 四互斥主流 UNION ALL）→ S11 → V8 对话",
    "**S9-2 断点续学已完成（v2.18.0，待用户杀进程真机闸门）**。下一步＝**#104 S9-3「今日」首页**：冷启动进今日；顶部唯一主按钮「继续今日学习」（到期复习优先，其次 resume_state 继续上次阅读，显示预计卡数/分钟）；其下四类次级入口（阅读/跟读/考试/好文）；不再自动恢复上次 tab。之后 S10 仪表盘（聚合 API 按《S9-数据契约》§4 四互斥主流 UNION ALL，查词/成卡/翻译只计次数不折分钟）→ S11 → V8 对话",
"§9 主线");

fs.writeFileSync(doc, s, "utf8");
console.log("完成", n);
