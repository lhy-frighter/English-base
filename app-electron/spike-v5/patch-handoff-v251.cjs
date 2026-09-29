const fs = require("fs");
const fp = "D:\\vibe coding\\英语学习\\交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const anchor = "> 更新：2026-09-22 · 版本 v2.25.0";
if (!s.includes(anchor)) throw new Error("anchor missing");
if (s.includes("v2.25.1")) { console.log("already"); process.exit(0); }
const block = `> 更新：2026-09-22 · 版本 v2.25.1（**词库详情同根/近义词可点击 + 功能词全面禁卡**）
> - **词库详情卡同根/近义可交互**：词库页展开词元后，「同根」「近义」chips 从纯文本升级为与阅读面板同款的可点击组件（relatedChips）——点词块弹出全局词典面板（音标/释义/英英/建卡），点小喇叭直接发音。复习卡背的同根区保持静态（复习中不打断流程）。
> - **功能词（冠词/介词/连词/代词等封闭词类）全面禁止建卡**：①\`lookup()\` 对功能词返回 \`cardable:false, kind:'function'\`，面板显示"功能词随用随会，不建卡"并保留释义可查；②createNote / createStandaloneNote / createShadowNote 三个服务端入口统一抛"功能词不建卡"（防御纵深，不只靠前端隐藏按钮）；③启动一次性维护 \`pruneFunctionLexemes()\`（app_settings: func_lexemes_pruned，事务内级联删 review_log→cards→evidence_log→notes→lexemes 并同步内存 learned 集合，幂等）。真实库本次清理 1 个误建词元（the，含 5 卡 1 笔记），副本先行验证只删功能词、issue/queen/quick 等正常词元不受影响。
> - **验证**：s11-recycle 增至 **24 断言**（新增 lookup(the) 不可建卡、三个 create 入口拒绝 the/of、拒绝后词元零污染）；feeds.cjs 建卡用例改为按 cardable 选普通词；**36 链全绿**；tsc=0；vite build=0；隐藏冒烟通过（真实库清理已执行，lexemes 4→3、cards 20→15）。
> - 已知边界：can/will/may 等"情态动词/名词同形"词按首义项词性归为功能词（与 unknown_encounters 既有口径一致）；若未来要支持 n.罐头 等义项建卡，需按义项（sense 级）而非 lemma 级判定。

`;
s = s.replace(anchor, block + anchor);
fs.writeFileSync(fp, s, "utf8");
console.log("handoff v2.25.1 inserted");
