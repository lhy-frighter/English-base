// spike-v5/diagnose2.cjs — 表格粘连行原始 item 坐标 + 下标基线偏移
"use strict";
const fs = require("node:fs");
const path = require("node:path");

async function rawItems(file) {
  if (typeof globalThis.DOMMatrix === "undefined") globalThis.DOMMatrix = class {};
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    out.push({ n: p, items: tc.items });
  }
  return out;
}

(async () => {
  const file = path.join(__dirname, "..", "test-fixtures", "pdf", "attention.pdf");
  const pages = await rawItems(file);
  // 找含 "Law" 或 "never" 的页与行，打印同行所有 item 的 str/x/y/h/w
  for (const pg of pages) {
    const hits = pg.items.filter((it) => it.str && /Law|never|perfect|application|what/i.test(it.str));
    if (!hits.length) continue;
    for (const h of hits.slice(0, 4)) {
      const y = h.transform[5];
      const same = pg.items
        .filter((it) => it.str && it.str.trim() && Math.abs(it.transform[5] - y) <= 2.5)
        .sort((a, b) => a.transform[4] - b.transform[4]);
      console.log(`\n--- p${pg.n} y=${y.toFixed(1)} ---`);
      let prevEnd = null;
      for (const it of same) {
        const x = it.transform[4], w = it.width || 0, hh = Math.abs(it.transform[3]) || 0;
        const gap = prevEnd == null ? "" : ` gap=${(x - prevEnd).toFixed(1)}`;
        console.log(`x=${x.toFixed(1)} h=${hh.toFixed(2)} w=${w.toFixed(1)}${gap} ${JSON.stringify(it.str)}`);
        prevEnd = x + w;
      }
    }
  }
  // 下标基线：d 与 model 的 y 差
  console.log("\n=== d/model 配对（p4 dmodel-dimensional 行）===");
  for (const pg of pages.slice(2, 5)) {
    for (let i = 0; i < pg.items.length; i++) {
      const it = pg.items[i];
      if (it.str === "d" || it.str === "d " || (it.str && /^d$/.test(it.str.trim()))) {
        const nx = pg.items[i + 1];
        if (nx && nx.str === "model") {
          console.log(`p${pg.n} d: x=${it.transform[4].toFixed(1)} y=${it.transform[5].toFixed(1)} h=${Math.abs(it.transform[3]).toFixed(2)} | model: x=${nx.transform[4].toFixed(1)} y=${nx.transform[5].toFixed(1)} h=${Math.abs(nx.transform[3]).toFixed(2)} dx=${(nx.transform[4] - (it.transform[4] + (it.width||0))).toFixed(1)} dy=${(it.transform[5] - nx.transform[5]).toFixed(1)}`);
        }
      }
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
