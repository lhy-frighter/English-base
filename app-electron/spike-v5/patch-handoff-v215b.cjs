// 一次性补丁：交接文档升 v2.15.0（幂等，带断言）；行内片段锚点，CRLF
const fs = require("fs");
const path = require("path");
const doc = path.resolve(__dirname, "..", "..", "交接文档.md");
let s = fs.readFileSync(doc, "utf8");
const orig = s;
let n = 0;
const NL = "\r\n";
function rep(oldStr, newStr, label) {
  if (!s.includes(oldStr)) {
    if (s.includes(newStr)) { console.log("skip(已应用):", label); return; }
    throw new Error("未找到锚点: " + label);
  }
  s = s.replace(oldStr, newStr);
  n++;
  console.log("patched:", label);
}

rep(
"pdf(pdfjs+版式感知双栏重排)、docx(mammoth)、图片 OCR(tesseract.js)；导出 PDF 五个纯函数",
"pdf(pdfjs+版式感知双栏重排)、docx(mammoth)、图片 OCR(tesseract.js)；v2.15 PDF 硬化：partRole/groupPdfLines 上下标状态机（d_model/d_ff/log_k(n)）、linesToParagraphs 词典裁决连字符、dehyphenatePageBreaks 页边界断词、getPdfLex 懒加载词典、repairGluedWords 词典 DP 切粘连（SUFFIX_DENY）、normalizePdfArtifacts 分音符/无点 i、decodeEntities 实体边界；PDF 纯函数全部导出",
"代码地图 import-tools");

rep(
"   ├─ test/pdf-layout.cjs # V5 PDF 版式回归（聚行/双栏重排/通栏标题/断词/复合词/页眉页码 11 断言，合成坐标不依赖真 PDF）",
"   ├─ test/pdf-layout.cjs # v2.15 PDF 版式+硬化回归（聚行/双栏/上下标 d_model/d_ff/log_k(n)/x^2/词典裁决连字符/跨页断词/粘连 DP+SUFFIX_DENY/伪影归一/实体边界 42 断言，合成坐标不依赖真 PDF）" + NL +
"   ├─ test/pdf-e2e.cjs    # v2.15 真实 PDF 端到端回归（三份冻结夹具 attention/instructgpt/vae，缺文件 skip；正文保留率≥99% 对 baseline-before、下标/粘连/连字符/专名/naive 关键快照、miss 上限闸 25 断言）" + NL +
"   ├─ test/unicode-words.cjs# v2.15 Latin 扩展字母回归（Łukasz/Jürgen/Çaglar/Gülçehre 整词 proper、句首保守 miss、M. Sugiyama、邮箱 URL 中性、法语 token、core 实体 12 断言）",
"测试清单 pdf 三链");

rep(
"Wiktionary 需求驱动词包落地（S8c）、残余 miss 主因是 PDF 抽取\r\n",
"Wiktionary 需求驱动词包落地（S8c）、残余 miss 主因是 PDF 抽取" + NL +
"   ├─ spike-v5/           # v2.15 PDF 硬化（构建期数据不分发）：diagnose1-4 基于真实 pdfjs TextItem 的诊断、probe-dict 词典信号校准、baseline.cjs（before/after 双指标，baseline-before.json 冻结勿覆盖）、verify-lex-fix 词典裁决验证、patch-core-entities 一次性实体补丁（已执行幂等）；冻结夹具在 test-fixtures/pdf/" + NL,
"spike-v5 目录");

rep(
"跨页重复页眉页脚（≥3 页同文）与顶/底边距区孤立页码剔除；**刻意不做原版式还原（方案 V5 砍项\"双栏美化\"），浮动图表 caption 可能插在栏间是已知残留**",
"跨页重复页眉页脚（≥3 页同文）与顶/底边距区孤立页码剔除；**v2.15 硬化**：字号/垂直位移识别上下标重建 d_model、d_ff、log_k(n)、x^2；行末与页/栏边界连字符用 ECDICT 词典裁决（拼回是词→直拼 transformations，两半都是词→保留 position-wise/attention-based）；表格区丢空格粘连用词典 DP 切分（butits→but its、Lawwillneverbe→Law will never be，SUFFIX_DENY 防 tion/ment 类假切，切不动诚实保留）；¨ı 等 LaTeX 伪影归一；Latin 扩展字母（Łukasz/Çaglar/Jürgen）与邮箱 URL 在 core 标注侧修复。三份冻结 arXiv 论文 miss 632→303（−52%）、正文零丢失（保留率 ≥99%）；**只影响新导入，旧文章需删除后重新导入**；**刻意不做原版式还原（方案 V5 砍项\"双栏美化\"），浮动图表 caption 可能插在栏间是已知残留；公式符号插在断词中间（如 param-θ eters）无法安全合并是已知边界**",
"§5 PDF bullet");

rep(
"10. **PDF 抽取坏词是残余未登录词的最大头（v2.14 实测约 45%）**：数学下标压平（d_model→dmodel、d_ff→dff、log_k→logk）、词间丢空格粘连（butits/applicationshouldbe/whatwe）、HTML 实体名残片（agrave/iacute，decodeHtmlEntities 对无分号命名实体或 PDF 路径可能未覆盖）、Ł 等字符丢失（Łukasz→ukasz）、连字符丢失（positionwise/attentionbased）。**V5 PDF 抽取硬化片待用户拍板**，词典层已证实无法解决",
"10. **PDF 抽取坏词已在 v2.15 系统性修复（冻结集 miss 632→303、粘连 21→0、下标 22→1、实体 0）**；残余三类诚实边界：①公式符号插在断词中间（Subse-(i,l)φ…quently、param-θ eters、condi-∗∗tional）坐标与词典层都无法安全合并；②reparameterization/labelers/instructgpt 等 ECDICT/词包真未收录词保持 miss（靠后续领域词包，不靠猜切）；③源 PDF 自身拼写错误（approriate/proabilistic）不修。Figure 注意力表 transform[3]=0 的几何信息在 PDF.js 原始 item 已丢失，坐标层无解，仅词典 DP 可救一部分。**旧已导入文章需删除重新导入才走新管线**",
"§7 第10条");

rep(
"npm test     # 25 链：golden(10) + epub + backup + resolve + s8-lemma(30) + dict-layers(27) + wikt-pack(18) + delete-text(33) + feeds(28) + text-sources(33) + paper(33→见各链实际) + url + awl + pdf-layout + model-store(53) + model-catalog(32) + serve-file(25) + lrecog + spelling + shadow-note(25) + regression + shadow-align(29) + shadow-send(20) + mt-cache(44) + tts-chunks(61)（本机 pnpm 被 SAC 拦截，统一用 npm）",
"npm test     # 27 链：golden(10) + epub + backup + resolve + s8-lemma(30) + dict-layers(24) + wikt-pack(18) + delete-text(14) + feeds(16 子测试) + text-sources(28) + paper(33) + url(17) + awl(14) + pdf-layout(42) + pdf-e2e(25) + unicode-words(12) + model-store(53) + model-catalog(32) + serve-file(25) + lrecog(12) + spelling(9) + shadow-note(25) + regression(13) + shadow-align(29) + shadow-send(20) + mt-cache(49) + tts-chunks(61)（本机 pnpm 被 SAC 拦截，统一用 npm；pdf-e2e 缺冻结夹具时 skip 不失败）" + NL +
"node spike-v5/baseline.cjs before|after  # PDF 双指标基线对照（冻结三份 test-fixtures/pdf 夹具，before 结果已冻结勿覆盖）",
"§8 测试链");

rep(
"V5 剩余可选：三栏/混排版式实测、浮动图表 caption 绕排、外部英英源（WordNet/Wiktextract）重审",
"**V5 PDF 抽取硬化已完成（v2.15.0，2026-09-21）**：上下标重建/词典裁决连字符/跨页断词/粘连 DP/伪影归一/Latin 扩展字母，冻结集 miss 632→303、正文零丢失，pdf-layout 42 + pdf-e2e 25 + unicode-words 12 断言守护；旧文章需重新导入。V5 剩余可选：三栏/混排版式实测、浮动图表 caption 绕排。**下一步主线＝《后续规划-一体化与仪表盘 v2》：S9-0 数据契约（#102）→ S9 会话记录/断点续学/今日页 → S10 仪表盘 → S11 → V8 对话**",
"§9 V5 条目");

rep(
"| 词卡分层 | 来源挂在 note 层",
"| PDF 抽取硬化（V5 hardening） | 先冻结夹具+before 基线再动抽取器，双指标验收（坏词下降 + 正文保留率≥99%，禁止删词刷指标）；上下标用字号 0.83×/dy 阈值角色状态机；连字符/粘连一律**词典裁决**（ECDICT bnc≤12000 或 frq≥100，含 lemma 词头信号），切不动诚实 miss 不猜字；SUFFIX_DENY 禁语素片段；Ł 等在 core 标注侧用 \\p{Lu} 与 Latin 扩展字母类修复；公式穿插断词与真未收录词为已知边界；只影响新导入 | v2.15.0（2026-09-21） |" + NL +
"| 词卡分层 | 来源挂在 note 层",
"§11 V5 决策行");

if (s === orig) throw new Error("没有任何修改");
fs.writeFileSync(doc, s, "utf8");
console.log(`完成，共 ${n} 处替换`);
