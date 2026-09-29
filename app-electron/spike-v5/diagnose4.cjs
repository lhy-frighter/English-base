// spike-v5/diagnose4.cjs — bnc 校准 + VAE 断词碎片 + attention 表格碎片原始 item
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
  const dict = new DatabaseSync(path.join(root, "data", "dict.sqlite"), { readOnly: true });
  console.log("=== bnc/frq 校准 ===");
  for (const w of ["is","based","points","laws","batches","wise","be","but","its","data","point","attention","position","sampling","log","likelihood","auto","encoding","mini","sequence","aligned","application","should","new","source","target","forum","alignment","model","head","learning","rate"]) {
    const r = dict.prepare("SELECT bnc,frq,exchange FROM words WHERE word=?").get(w);
    console.log(w, r ? `bnc=${r.bnc} frq=${r.frq}` : "MISS");
  }
  // lemma 表
  for (const w of ["transformations","information","points","based"]) {
    const r = dict.prepare("SELECT lemma FROM lemma WHERE flexion=?").get(w);
    console.log("lemma", w, "->", r ? r.lemma : "MISS");
  }
  dict.close();

  for (const [pdf, needles] of [
    ["vae.pdf", ["tional", "subse", "quently", "eters", "dzi", "contemple", "approriate", "reconstrution", "samplingbased"]],
    ["attention.pdf", ["rgen", "headi", "lrate", "qiki"]],
  ]) {
    console.log(`\n=== ${pdf} 碎片追踪 ===`);
    const pages = await rawItems(path.join(root, "test-fixtures", "pdf", pdf));
    for (const nd of needles) {
      let found = false;
      for (const pg of pages) {
        for (const it of pg.items) {
          if (it.str && it.str.toLowerCase().includes(nd)) {
            console.log(nd, `p${pg.n}`, JSON.stringify(it.str), "x=", it.transform[4].toFixed(1), "y=", it.transform[5].toFixed(1), "h=", Math.abs(it.transform[3]||0).toFixed(2));
            found = true;
          }
        }
      }
      if (!found) console.log(nd, "— 原始 item 中不存在（可能是布局拼接产物）");
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
