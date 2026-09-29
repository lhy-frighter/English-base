const fs = require("fs");
const fp = "D:\\vibe coding\\英语学习\\交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const anchor = "> 更新：2026-09-22 · 版本 v2.26.0";
if (!s.includes(anchor)) throw new Error("anchor missing");
if (s.includes("v2.27.0")) { console.log("already"); process.exit(0); }
const block = `> 更新：2026-09-23 · 版本 v2.27.0（**#113 S11-d wikt IPA 覆盖提升 + UI 文案人话化**）
> - **wikt-en 词包 IPA 661 → 1084（/5756，18.8%）**：builder v0.2 重写音标抽取——旧白名单缺长音符号 ː(U+02D0)、组合附加符(U+0300–036F)、æ/ð/ŋ/θ 等，正常音标（如 /ˌæbsəˈfʌkɪŋluːtli/）被整体拒绝；新口径=IPA 扩展区+修饰字母区+组合符宽字符集，且必须含音标核心符号（防纯拼写混入）；发音优先 General-American、次 RP，词级无 sounds 时回退义项级 sounds。
> - **已到抽取天花板**：对 4674 个仍缺音标词回查原始转储，4650 个词条在 Wiktionary 中**完全没有发音条目**（gamify、crocodylomorph、heliocentrism 等），24 个为不同词行（多为 name 词条）的音标，不属于本词。剩余缺口的唯一解法=本地 G2P（未来评估 Misaki Apache-2.0 路径，与商业 TTS G2P 许可证审计合并决策）；无音标词的小喇叭朗读不受影响（走 TTS）。
> - **UI 文案人话化（去内部术语）**：语音页页头"语音引擎"→"语音模型管理"、"模型下载"→"语音模型管理"，状态 installed/partial 显示为"已安装/未完成/未下载"，crossOriginIsolated 技术行改为人话；好文页"i+1 推荐"→"刚好适合"、"i+1 区间"→"最佳学习区间（稍有挑战、基本能读懂）"；考试页概念卡提示去掉"FSRS 调度"；"租约"仅存于代码注释，不出现在任何界面。
> - **验证**：wikt-pack 新增 2 条断言（IPA 覆盖≥1000、长音符号 ː 不被误拒），现 20 断言；**37 链全绿**；tsc=0；vite build=0；隐藏冒烟通过（启动自动备份 user-2026-09-23）。
> - 无新增真机闸门（改动为词包数据与文案，随下次使用自然可见）。

`;
s = s.replace(anchor, block + anchor);
fs.writeFileSync(fp, s, "utf8");
console.log("handoff v2.27.0 inserted");
