// test/pdf-layout.cjs — PDF 版式抽取纯函数单测（合成坐标，不依赖真实 PDF）
"use strict";
const assert = require("node:assert/strict");
const {
  groupPdfLines, orderPageLines, linesToParagraphs, stripMarginNoise, layoutPdfText,
  dehyphenatePageBreaks, repairGluedWords, normalizePdfArtifacts, partRole, decodeEntities,
} = require("../import-tools.cjs");
let pass = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS", name); }
  else { console.error("FAIL", name, extra !== undefined ? "→" + JSON.stringify(extra) : ""); process.exitCode = 1; }
}
const FS = 10;
// 造一个 pdfjs 风格 item（左下原点，y 向上）
function item(str, x, y, fontSize = FS) {
  return { str, transform: [0, 0, 0, fontSize, x, y], width: str.length * fontSize * 0.5, height: fontSize };
}
const W = 612, H = 792;

// 1. 同行多 item 按 x 排序拼接，行间补空格
{
  const lines = groupPdfLines([item("world", 120, 700), item("hello", 72, 700), item("next", 72, 680)]);
  check("同行按 x 聚合", lines.length === 2 && lines[0].text === "hello world", lines);
}

// 2. 双栏：左栏两行+右栏两行 → 先左后右（而不是按 y 左右交替）
{
  const items = [];
  const rows = [["Left first sentence.", 700], ["Left second sentence.", 680]];
  const rrows = [["Right first sentence.", 700], ["Right second sentence.", 680]];
  for (const [t, y] of rows) items.push(item(t, 72, y));
  for (const [t, y] of rrows) items.push(item(t, 324, y));
  const lines = groupPdfLines(items);
  const ordered = orderPageLines(lines, W).map((l) => l.text);
  check("双栏先左栏后右栏", ordered[0].startsWith("Left first") && ordered[1].startsWith("Left second")
    && ordered[2].startsWith("Right first") && ordered[3].startsWith("Right second"), ordered);
}

// 3. 通栏标题在双栏前保持最前
{
  const items = [item("A Spanning Paper Title That Crosses The Middle Line Here", 72, 740),
    item("left body line one", 72, 700), item("right body line one", 324, 700),
    item("left body line two", 72, 680), item("right body line two", 324, 680)];
  const ordered = orderPageLines(groupPdfLines(items), W).map((l) => l.text);
  check("通栏标题置顶", ordered[0].startsWith("A Spanning"), ordered);
}

// 4. 单栏保持 y 顺序
{
  const items = [item("third", 72, 640), item("first", 72, 700), item("second", 72, 670)];
  const ordered = orderPageLines(groupPdfLines(items), W).map((l) => l.text);
  check("单栏纵向顺序", ordered.join("|").startsWith("first|second|third"), ordered);
}

// 5. 行末断词合并
{
  const lines = groupPdfLines([item("Some infor-", 72, 700), item("mation here.", 72, 688)]);
  const paras = linesToParagraphs(lines);
  check("断词连字符合并", /information/.test(paras[0]), paras);
  // 真复合词在换行处保留连字符
  const lines2 = groupPdfLines([item("WMT English-", 72, 700), item("to-German task.", 72, 688)]);
  const p2 = linesToParagraphs(lines2);
  check("复合词连字符保留", /English-to-German/.test(p2[0]), p2);
}

// 6. 大行距产生新段落
{
  const lines = groupPdfLines([item("First paragraph line one.", 72, 700), item("Second paragraph starts here.", 72, 650)]);
  check("大行距分段", linesToParagraphs(lines).length === 2, linesToParagraphs(lines));
}

// 7. 跨页页眉（≥3 页重复）与页码剔除
{
  const mk = (pageNo) => ({ W, H, lines: groupPdfLines([
    item("JOURNAL OF STUDIES", 200, 770),
    item(String(pageNo), 300, 30),
    item("body content line", 72, 700),
  ]) });
  const pages = [mk(1), mk(2), mk(3), mk(4)];
  const cleaned = stripMarginNoise(pages);
  const allText = cleaned.map((p) => p.lines.map((l) => l.text).join(" ")).join(" ");
  check("重复页眉剔除", !/JOURNAL OF STUDIES/.test(allText), allText);
  check("页码剔除", !/\b[1-4]\b/.test(allText), allText);
  check("正文保留", /body content line/.test(allText));
}

// 8. 端到端：双栏论文阅读顺序正确
{
  const page = { W, H, lines: groupPdfLines([
    item("Title Across Both Columns Of The Page Here", 90, 745),
    item("L1 alpha", 72, 700), item("R1 alpha", 324, 700),
    item("L2 beta", 72, 688), item("R2 beta", 324, 688),
  ]) };
  const text = layoutPdfText([page]);
  const iTitle = text.indexOf("Title"), iL1 = text.indexOf("L1"), iL2 = text.indexOf("L2"),
    iR1 = text.indexOf("R1"), iR2 = text.indexOf("R2");
  check("端到端顺序 标题<L1<L2<R1<R2", iTitle < iL1 && iL1 < iL2 && iL2 < iR1 && iR1 < iR2, text);
}

// 9. partRole 下标/上标/正文判定
check("partRole 下标", partRole({ h: 7, y: 98.5 }, 10, 100) === "sub");
check("partRole 上标", partRole({ h: 7, y: 102 }, 10, 100) === "sup");
check("partRole 正文", partRole({ h: 10, y: 100 }, 10, 100) === "base");

// 10. 下标重建：d_model、d_ff（同一下标串直连）、log_k(n)、d_model-dimensional
{
  const sub = (str, x, y) => item(str, x, y, 7);
  const lines = groupPdfLines([
    item("d", 72, 700), sub("model", 80, 698.5),
    item("d", 72, 685), sub("f", 80, 683.5), sub("f", 86, 683.5),
    item("log", 72, 670), sub("k", 90, 668.5), item("(n)", 98, 670),
    item("d", 72, 655), sub("model", 80, 653.5), item("-dimensional", 110, 655),
  ]);
  const txt = lines.map((l) => l.text).join(" / ");
  check("下标 d_model", /d_model\b/.test(txt), txt);
  check("下标串 d_ff", /d_ff\b/.test(txt), txt);
  check("下标回正文 log_k(n)", /log_k\(n\)/.test(txt), txt);
  check("下标连字符 d_model-dimensional", /d_model-dimensional/.test(txt), txt);
}

// 11. 上标重建 x^2
{
  const lines = groupPdfLines([item("x", 72, 700), item("2", 82, 702, 7)]);
  check("上标 x^2", lines[0].text === "x^2", lines);
}

// 12. 词典裁决行末连字符（注入假词典）
{
  const words = new Set(["information", "position", "wise", "attention", "based",
    "english", "to", "german", "transformations", "subsequently"]);
  const isWord = (w) => words.has(w.toLowerCase());
  const mk = (a, b) => groupPdfLines([item(a, 72, 700), item(b, 72, 688)]);
  check("词典裁决 断词直拼", /information now/.test(
    linesToParagraphs(mk("infor-", "mation now."), isWord)[0]));
  check("词典裁决 复合词保留连字符", /position-wise/.test(
    linesToParagraphs(mk("position-", "wise layer."), isWord)[0]));
  check("词典裁决 attention-based 保留", /attention-based/.test(
    linesToParagraphs(mk("attention-", "based model."), isWord)[0]));
  check("词典裁决 transformations 直拼", /transformations/.test(
    linesToParagraphs(mk("transfor-", "mations are linear."), isWord)[0]));
  check("词典裁决 English-to-German 保留", /English-to-German/.test(
    linesToParagraphs(mk("English-", "to-German task."), isWord)[0]));
  // 跨页/跨栏断词
  check("跨页 Subse-quently 合并", /Subsequently/.test(
    dehyphenatePageBreaks("Subse-\n\nquently arrived", isWord)));
  check("跨页两半都是词保留连字符", /position-wise/.test(
    dehyphenatePageBreaks("position-\n\nwise", isWord)));
}

// 13. 粘连切分（注入假词典；SUFFIX_DENY 阻止 ic/tion 类语素成段）
{
  const common = new Set(["but", "its", "what", "we", "law", "will", "never", "be",
    "data", "points", "ic", "tion", "new", "laws"]);
  const lex = { isWord: () => false, isCommonPiece: (w) => common.has(w.toLowerCase()) };
  check("粘连 but its", repairGluedWords("butits", lex) === "but its");
  check("粘连 Law will never be", repairGluedWords("Lawwillneverbe", lex) === "Law will never be");
  check("粘连 data points", repairGluedWords("datapoints", lex) === "data points");
  check("粘连 new laws", repairGluedWords("newlaws", lex) === "new laws");
  check("语素黑名单不切 datiction", repairGluedWords("datiction", lex) === "datiction");
  check("切不动原样保留", repairGluedWords("lukaszkaiser", lex) === "lukaszkaiser");
  check("短于 6 不动", repairGluedWords("newit", lex) === "newit");
  const lex2 = { isWord: (w) => w === "datapoints", isCommonPiece: (w) => common.has(w.toLowerCase()) };
  check("整词在词典不动", repairGluedWords("datapoints", lex2) === "datapoints");
}

// 14. PDF 伪影归一：na¨ıve → naive，无点 ı → i
check("分音符+无点i归一", normalizePdfArtifacts("the na¨ıve approach") === "the naive approach");
check("无点 i 归一", normalizePdfArtifacts("ıve") === "ive");

// 15. 实体解码（import-tools 边界规则）
check("无分号命名实体", decodeEntities("caf&agrave; open") === "cafà open");
check("数字实体带分号", decodeEntities("r&#233;sum&#233;") === "résumé");
check("十六进制实体", decodeEntities("&#xe9;") === "é");
check("query 中 copy 不被解码", decodeEntities("?x=1&copy=2") === "?x=1&copy=2");
check("copy 分号正常解码", decodeEntities("&copy;2026") === "©2026");
check("实体只解一层", decodeEntities("&amp;amp;") === "&amp;");

console.log(`\n${pass} 通过 / pdf-layout`);
