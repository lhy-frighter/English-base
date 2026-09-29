// spike-v5/diagnose.cjs — 诊断 Attention PDF 原始 pdfjs item（布局层之前）
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { groupPdfLines, layoutPdfText } = require("../import-tools.cjs");

async function rawItems(file) {
  if (typeof globalThis.DOMMatrix === "undefined") globalThis.DOMMatrix = class {};
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    pages.push({ n: p, W: vp.width, H: vp.height, items: tc.items, styles: tc.styles });
  }
  return pages;
}

(async () => {
  const file = path.join(__dirname, "..", "test-fixtures", "pdf", "attention.pdf");
  const pages = await rawItems(file);

  // 1) Łukasz：原始 item 里有没有 Ł
  console.log("=== 1. Łukasz 原始 item 追踪（前 2 页）===");
  for (const pg of pages.slice(0, 2)) {
    for (const it of pg.items) {
      if (it.str && /ukasz|Ł|&#|agrave|acute/i.test(it.str)) {
        console.log(`p${pg.n}`, JSON.stringify(it.str), "x=", it.transform[4].toFixed(1), "y=", it.transform[5].toFixed(1), "h=", Math.abs(it.transform[3]).toFixed(1));
      }
    }
  }

  // 2) 下标：含 model / d / ff / k 的原始 item（前 4 页，数学公式区）
  console.log("\n=== 2. 下标 item 抽样（str 为 model/ff/k 且字号异常）===");
  let shown = 0;
  for (const pg of pages.slice(0, 5)) {
    for (const it of pg.items) {
      if (!it.str) continue;
      const h = Math.abs(it.transform[3]) || 0;
      if (/^(model|ff|k|model\b)$/.test(it.str.trim()) && h < 8 && shown < 25) {
        console.log(`p${pg.n}`, JSON.stringify(it.str), "x=", it.transform[4].toFixed(1), "y=", it.transform[5].toFixed(1), "h=", h.toFixed(2), "w=", (it.width||0).toFixed(1));
        shown++;
      }
    }
  }

  // 3) agrave / 实体残片在原始 item 中的形态
  console.log("\n=== 3. agrave/实体 原始 item（全文）===");
  let n3 = 0;
  for (const pg of pages) {
    for (const it of pg.items) {
      if (it.str && /agrave|acute|uml|&#|&[a-z]+;/.test(it.str) && n3 < 20) {
        console.log(`p${pg.n}`, JSON.stringify(it.str));
        n3++;
      }
    }
  }
  console.log("agrave 类命中条数：", n3);

  // 4) 当前布局输出中的坏词上下文
  console.log("\n=== 4. 当前抽取输出坏词上下文 ===");
  const laidPages = pages.map((pg) => ({ W: pg.W, H: pg.H, lines: groupPdfLines(pg.items) }));
  const text = layoutPdfText(laidPages);
  const bad = /dmodel|butits|whatwe|applicationshouldbe|positionwise|attentionbased|ukasz|\blogk\b|\bdff\b/;
  for (const line of text.split("\n")) {
    if (bad.test(line)) console.log("…", line.slice(0, 220));
  }

  // 5) position-wise / English-to 换行连字符上下文（原始 item 行尾 -）
  console.log("\n=== 5. 行尾连字符原始 items ===");
  let n5 = 0;
  for (const pg of pages.slice(0, 6)) {
    const lines = groupPdfLines(pg.items);
    for (const l of lines) {
      if (/[A-Za-z]-$/.test(l.text) && n5 < 15) { console.log(`p${pg.n}`, JSON.stringify(l.text)); n5++; }
    }
  }

  // 6) 正文总字符
  console.log("\n=== 6. 抽取总字符 ===", text.length);
})().catch((e) => { console.error(e); process.exit(1); });
