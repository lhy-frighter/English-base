// spike-v5/diagnose3.cjs — 全文追踪大写/特殊字符丢失片段的原始 item
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

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
  const root = path.join(__dirname, "..");
  // frq 校准
  const dict = new DatabaseSync(path.join(root, "data", "dict.sqlite"), { readOnly: true });
  for (const w of ["but","its","what","we","application","should","be","law","will","never","just","this","is","new","laws","sequence","aligned","position","wise","attention","based","data","points","point","sampling","log","likelihood","auto","encoding","mini","batches","wise","forum","alignment"]) {
    const r = dict.prepare("SELECT frq FROM words WHERE word=?").get(w);
    console.log("frq", w, r ? r.frq : "MISS");
  }
  dict.close();

  const file = path.join(root, "test-fixtures", "pdf", "attention.pdf");
  const pages = await rawItems(file);
  const needles = ["ukasz", "llion", "avaswani", "nikip", "usz", "xception", "aglar", "ehre", "zlag", "ckstr", "reverens", "zoolinnean", "atrav"];
  console.log("\n=== 原始 item 命中（全文）===");
  for (const nd of needles) {
    let hits = 0;
    for (const pg of pages) {
      for (const it of pg.items) {
        if (it.str && it.str.toLowerCase().includes(nd)) {
          console.log(nd, `p${pg.n}`, JSON.stringify(it.str), "x=", it.transform[4].toFixed(1), "y=", it.transform[5].toFixed(1), "h=", Math.abs(it.transform[3]||0).toFixed(2));
          hits++;
        }
      }
    }
    if (!hits) console.log(nd, "— 原始 item 中不存在");
  }
  // Ł 字符在全文哪些 item
  console.log("\n=== Ł / Llion / Vaswani / Niki 原始 item ===");
  for (const pg of pages) {
    for (const it of pg.items) {
      if (it.str && /[Ł]|^L$|Llion|Vaswani|Niki|Gul|Xception|Ehre/.test(it.str)) {
        console.log(`p${pg.n}`, JSON.stringify(it.str), "x=", it.transform[4].toFixed(1), "y=", it.transform[5].toFixed(1), "h=", Math.abs(it.transform[3]||0).toFixed(2), "w=", (it.width||0).toFixed(1));
      }
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
