// spike-v5/baseline.cjs — V5 冻结集基线/复验（修改前 before，修改后 after）
// 用法：node spike-v5/baseline.cjs before|after
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { extractText } = require("../import-tools.cjs");
const { Core } = require("../core.cjs");

const ROOT = path.join(__dirname, "..");
const FIX = path.join(ROOT, "test-fixtures", "pdf");
const FILES = [
  ["attention.pdf", "双栏+下标+换行连字符+专名（Attention Is All You Need）"],
  ["instructgpt.pdf", "普通单栏长论文（Training LMs to Follow Instructions）"],
  ["vae.pdf", "数学密集双栏（Auto-Encoding Variational Bayes）"],
];

const ENTITY_RE = /^(agrave|aacute|acirc|atilde|auml|aring|aelig|ccedil|egrave|eacute|ecirc|euml|igrave|iacute|icirc|iuml|ntilde|ograve|oacute|ocirc|otilde|ouml|ugrave|uacute|ucirc|uuml|yacute|thorn|szlig|amp|quot|apos|nbsp|mdash|ndash|laquo|raquo)$/i;
const SUB_RE = /^(dmodel|dff|dk|dv|logk|dmodel-dimensional|qiki|headi|lrate|rgen|sourcetarget)$/;

const dict = new DatabaseSync(path.join(ROOT, "data", "dict.sqlite"), { readOnly: true });
const frqStmt = dict.prepare("SELECT frq FROM words WHERE word = ? LIMIT 1");
function frq(w) { const r = frqStmt.get(w.toLowerCase()); return r ? Number(r.frq || 0) : 0; }
// 粘连切分 DP：全部片段均为常用词（frq>=阈值，长度>=2），整词消耗完
function segment(word, minFrq) {
  const w = word.toLowerCase();
  const n = w.length;
  const dp = new Array(n + 1).fill(null);
  dp[0] = [];
  for (let i = 2; i <= n; i++) {
    for (let j = 0; j <= i - 2; j++) {
      if (dp[j] == null) continue;
      const piece = w.slice(j, i);
      if (frq(piece) >= minFrq) {
        const cand = dp[j].concat(piece);
        // 偏好片段更少、首片段更长的切分
        if (dp[i] == null || cand.length < dp[i].length) dp[i] = cand;
      }
    }
  }
  return dp[n];
}

const SNAPSHOTS = [
  ["Łukasz Kaiser 姓名保留", /Łukasz Kaiser/],
  ["下标句 d_model-dimensional", /d_model-dimensional[^\n]{0,80}/],
  ["position-wise 句", /position-?wise[^\n]{0,60}/],
  ["表头 d_model d_ff", /d_model\s+d_ff/],
  ["d_ff 行含 2048", /d_ff[\s\S]{0,60}2048/],
  ["示例表粘连行", /Law[^\n]{0,120}perfect/],
  ["断词 transfor-mations", /transfor-?mations/],
  ["attention-based 参考文献", /attention-?based neural machine/],
  ["naive 分音符归一", /naive/],
  ["log_k(n) 下标", /log_k\(n\)/],
];

(async () => {
  const phase = process.argv[2] || "before";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v5-base-"));
  const core = new Core(dir);
  const report = { phase, generatedAt: new Date().toISOString(), files: {} };
  let grand = { chars: 0, words: 0, miss: 0, glued: 0, entity: 0, sub: 0, genuine: 0 };

  for (const [file, desc] of FILES) {
    const fp = path.join(FIX, file);
    const { text } = await extractText(fp);
    const chars = text.length;
    const alphaWords = (text.match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
    const miss = new Map();
    for (const t of core.annotate(text)) {
      if (t.label === "miss") miss.set(t.text.toLowerCase(), (miss.get(t.text.toLowerCase()) || 0) + 1);
    }
    const classes = { glued: {}, entity: {}, sub: {}, genuine: {} };
    for (const [w, c] of miss) {
      let cls = "genuine";
      if (ENTITY_RE.test(w)) cls = "entity";
      else if (SUB_RE.test(w)) cls = "sub";
      else if (w.length >= 6 && /^[a-z]+$/.test(w) && frq(w) === 0) {
        const seg = segment(w, 2000);
        if (seg && seg.length >= 2 && seg.join("").length === w.length) cls = "glued";
      }
      classes[cls][w] = c;
    }
    const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w, c]) => `${c}x${w}`);
    const cnt = (m) => Object.values(m).reduce((a, b) => a + b, 0);
    const snaps = {};
    for (const [name, re] of SNAPSHOTS) {
      const m = text.match(re);
      snaps[name] = m ? m[0] : null;
    }
    const f = {
      desc, chars, alphaWords,
      missForms: miss.size, missHits: cnt({ ...classes.glued, ...classes.entity, ...classes.sub, ...classes.genuine }),
      glued: cnt(classes.glued), entity: cnt(classes.entity), sub: cnt(classes.sub), genuine: cnt(classes.genuine),
      topGlued: top(classes.glued), topEntity: top(classes.entity), topSub: top(classes.sub), topGenuine: top(classes.genuine),
      snapshots: snaps,
    };
    report.files[file] = f;
    grand.chars += chars; grand.words += alphaWords;
    grand.miss += f.missHits; grand.glued += f.glued; grand.entity += f.entity; grand.sub += f.sub; grand.genuine += f.genuine;
    console.log(`\n### ${file}（${desc}）`);
    console.log(`字符 ${chars} / 词 ${alphaWords} / miss ${f.missHits}（粘连 ${f.glued}｜实体 ${f.entity}｜下标 ${f.sub}｜真未收录 ${f.genuine}）`);
    console.log("粘连 top:", f.topGlued.join(", ") || "-");
    console.log("下标 top:", f.topSub.join(", ") || "-");
    console.log("实体 top:", f.topEntity.join(", ") || "-");
    console.log("真未收录 top:", f.topGenuine.join(", ") || "-");
    for (const [k, v] of Object.entries(snaps)) console.log(`快照[${k}]：`, v || "（未命中）");
  }
  report.grand = grand;
  fs.writeFileSync(path.join(__dirname, `baseline-${phase}.json`), JSON.stringify(report, null, 2), "utf8");
  console.log(`\n=== 合计：字符 ${grand.chars} / 词 ${grand.words} / miss ${grand.miss}（粘连 ${grand.glued}｜实体 ${grand.entity}｜下标 ${grand.sub}｜真未收录 ${grand.genuine}）`);
  console.log(`已写入 spike-v5/baseline-${phase}.json`);
  core.user.close();
  fs.rmSync(dir, { recursive: true, force: true });
  dict.close();
})().catch((e) => { console.error(e); process.exit(1); });
