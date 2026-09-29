// 交接文档升 v2.25.0（S11-b 漏网词回收）
const fs = require("fs");
const fp = "D:\\vibe coding\\英语学习\\交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const anchor = "> 更新：2026-09-22 · 版本 v2.24.0";
if (!s.includes(anchor)) throw new Error("anchor missing");
if (s.includes("v2.25.0")) { console.log("already"); process.exit(0); }
const block = `> 更新：2026-09-22 · 版本 v2.25.0（**#111 S11-b 漏网词回收：跨篇相遇词聚合 + 今日/词库双入口 + 批量成卡**）
> - **产品闭环**：阅读中反复遇到却没建卡的词，自动沉淀到「漏网词回收」；今日页主按钮下方出现次级卡（多篇相遇 >0 才出现），词库页头有同名入口（带数量角标）。
> - **core 三方法**：\`recycleCandidates({minTexts=2,limit=50,offset=0})\` 聚合 unknown_encounters，**NOT EXISTS lexemes（排除 __concept__）** 保证"未掌握=尚未进入词元资产"，成卡后候选自动消失但相遇事实保留；逐词联 dict.words 取音标/首行译义/tag/frq，联 texts 取相遇来源（最多 3 篇标题+次数）；排序=考纲等级（zk→gre）→ AWL 学术词族 → 常用度（frq 排名小在前、零频垫底）→ 相遇篇数/次数；功能词双保险拦截、词包缺失查不到的词跳过。\`recycleCount()\` 返回 {total, multi（≥2 篇）}。\`recycleAdd(words)\` 批量走 createStandaloneNote（recall+l_recog+spelling 三卡），**sense 强制取词典首行译义**（避免 recall 卡退化成"词=词"，shadow-note P0-2 同款教训），返回 {added, already, skipped}（功能词 reason=function、未收录 reason=unresolved）。todayBrief 增 recycle_multi/recycle_total。
> - **前端（App.tsx 新增 tab='recycle'，不进侧栏）**：分段开关「多篇相遇（N）/全部（N）」、全选本页、勾选批量「加入词卡（N）」、逐行 🔈 发音、考纲徽章+「学术」AWL 徽章、相遇篇数/次数/来源文章、加载更多（每页 50）、空态；成卡后刷新列表/今日卡/计数并提示"已加入 N 个，M 个已在词库，跳过 K 个"。
> - **真实库副本验证（只读副本，不碰生产库）**：5039 相遇行 → 候选 3398 个，其中多篇相遇 **918** 个；榜首 issue/available/significant/approach/individual/institution/assume/access/conduct/demonstrate 等高频学术词，排序符合预期。
> - **验证**：新增 \`test/s11-recycle.cjs\` **20 断言**（跨篇聚合/来源/考纲徽章/单篇门槛/分页/功能词排除/计数/todayBrief/批量成卡 3 张/拦截两类跳过词/成卡后候选消失且相遇保留/重复 already/recall 卡 sense 中文非空/排序/删文级联），已注册进 npm test（**现 36 链全绿**）；tsc=0；vite build=0（index js 354.91kB/gzip 112.84kB，css 38.44kB）；隐藏 Electron 冒烟 SMOKE_LOADED/SMOKE_DONE。
> - **待用户目视闸门**：①今日页出现「漏网词回收」次级卡（真实库应显示 918）；②回收页多篇/全部切换、勾选、全选、批量加入后列表刷新与提示；③词库页头入口与角标；④成卡后复习队列出现新 recall/l_recog/spelling 卡。
> - **已知边界**：ECDICT 高频学术词普遍同时带 gre 标签，徽章可能大量显示 GRE（排序仍正确，徽章只是最高等级标签）；one/first 等数词写入侧未拦截，若出现在候选中后续在排序层再定；回收成卡是无语境三卡，语境例句仍按原设计等阅读中再次遇到时自动补。

`;
s = s.replace(anchor, block + anchor);
fs.writeFileSync(fp, s, "utf8");
console.log("inserted, bytes:", s.length);
