const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const entry = `# 个人英语能力底座 · 交接文档
> 更新：2026-09-26 · **S15-1 云端语法深度分析封板（#160–#164）**（V11 Part A；S14 全双工通话仍仅 Spike 获批；Azure 发音档未启动；商业化暂缓）
> - **#161 response_format 真机探测**：glm-4-flash 三种 case 均 200——json_object 真支持（裸可解析 JSON）、json_schema 被静默忽略（返回 markdown fence 自由结构）；故引擎定为 json_object + 严格提示词 + Schema 校验。另查明 safeStorage 解密前提：独立脚本必须同样 setPath userData 到 data/webllm-profile（OSCrypt Local State 在此）。
> - **#162 grammar-engine 两层拆分**：纯逻辑层 grammar-normalize.ts（fnv/normalizeType/locateQuote/extractJson/normalize，零浏览器依赖）+ 编排层 grammar-engine.ts（consent/key 校验、postJson 非流式 response_format json_object、429/5xx 退避 1.5s、localStorage 缓存、Schema 失败修复重试 1 次）。缓存键含 text+context+baseUrl+model+prompt_version+schema_version。cloud-consent 新增 grammarCloud 独立开关。
> - **#163 GrammarDiagnosisPanel + 三入口**：内联面板（score_est 徽章、错误行勾选 + 类型中文标签 + 删除线 quote→correct + rule_zh、rewritten/native_tip 勾选作 chunk、批量 captureAsset）。三入口：①对话页用户气泡「深度语法分析」（前 6 轮 context，按 turnKey 去重）；②考试写作题卡「☁️ 云端深度批改」（origin exam，paperId:qIndex）；③阅读划选条「深度语法分析」（origin reading，text_id；选区清空同步）。
> - **#164 60 句冻结集 + 封板验证**：test/fixtures/grammar-frozen-60.json 七类（typical 24/correct 10/multi 8/ambiguous 5/mixed 4/injection 3/names_numbers 6）；新测试链 test/grammar-normalize.ts 46 项（extractJson/locateQuote/normalize 保留丢弃/occurrence 回退/去重/缺字段/score 钳制/正确句/夹具结构），已挂 npm test。main.cjs backup 日志硬化（防御异常返回，不再因日志崩溃）。
> - **口径锁定**：score_est 为 0–100 模型估计、非正式分数；quote+occurrence 必须映射回原文，映射不上丢弃；rewritten 只修错保原意、native_tip 可大幅改写；正确句必须返回空 errors 不得误报。
> - **验证**：全量 **55 链零失败**（新增 grammar-normalize 46）；tsc=0；vite build=0。
> - **待真机复验（用户本人）**：三入口各跑一次（尤其麦克风跟读句→深度语法分析→勾选成卡）；正确句不得误报；60 句冻结集质量评测可按需用真机 runner 跑。
> - **下一步**：S14-1A 协议探针（WAV RIFF 头/PCM vs MP3、事件顺序、真实价格、**取消后历史一致性 P0**）→ S14-1B 主进程中继（MessagePort/背压/key 不下发/日志脱敏）→ S14-1C 真机裁决，全过才批 S14-2 + migration v16；S15-2 Azure 发音档待启动。
>
`;
const head = "# 个人英语能力底座 · 交接文档\r\n";
if (s.indexOf(head) !== 0) { console.log("HEAD MISSING"); process.exit(2); }
// 保持 CRLF
const entryCrlf = entry.replace(/\r?\n/g, "\r\n");
s = entryCrlf + s.slice(head.length);
fs.writeFileSync(p, s);
console.log("handoff doc updated");
