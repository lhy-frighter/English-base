const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");
function rep(oldStr, newStr, label) {
  if (!s.includes(oldStr)) throw new Error("NOT FOUND: " + label);
  s = s.replace(oldStr, newStr);
}

// 1) 资产卡正反面分支：在 concept 分支前插入五类分支
const oldBranches = `      if (row.card_type === "concept") {
        // 错题概念卡：正面=错因+考点（sense），背面=题干/解析（context_sentence）
        shown = n.sense;
      } else if (row.card_type === "cloze") {`;
const newBranches = `      if (row.card_type === "chunk_recall") {
        // 词块回忆：正面英文词块，背面中文意图+例句
        shown = a.canonical; answer = a.gloss || payload.zh_intent || "";
      } else if (row.card_type === "chunk_cloze") {
        // 词块填空：例句中挖掉该词块
        const ex0 = payload.example_en || "";
        if (ex0) {
          const esc0 = a.canonical.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
          shown = ex0.replace(new RegExp(esc0, "i"), "_____");
        } else shown = a.canonical;
        answer = a.canonical;
      } else if (row.card_type === "grammar_pattern") {
        // 语法练习：正面题目，背面答案+解释
        shown = payload.prompt || a.canonical; answer = payload.answer || a.gloss || "";
      } else if (row.card_type === "pron_perception") {
        // 发音听辨：正面只播音（前端 TTS），背面文本+IPA
        shown = "听音辨发音"; answer = a.canonical;
      } else if (row.card_type === "concept_recall") {
        // 考点回忆：正面考点，背面策略/说明
        shown = payload.test_point || a.gloss || a.canonical;
        answer = a.gloss || payload.strategy || "";
      } else if (row.card_type === "concept") {
        // 错题概念卡：正面=错因+考点（sense），背面=题干/解析（context_sentence）
        shown = n.sense;
      } else if (row.card_type === "cloze") {`;
rep(oldBranches, newBranches, "branches");

// 2) DTO 加 asset_kind 与 payload
const oldDto = `      out.push({
        card_id: row.id, note_id: row.note_id, asset_id: row.asset_id ?? null, card_type: row.card_type,
        sentence: shown, full: n.sentence, text_id: n.text_id ?? null, word: n.lemma,
        phonetic: d.phonetic || "", exchange: d.exchange || "", definition: d.definition || "",
        sense: n.sense, answer, clozeMiss: miss, state: row.state,
        choices, correctChoice,
      });`;
const newDto = `      out.push({
        card_id: row.id, note_id: row.note_id, asset_id: row.asset_id ?? null, card_type: row.card_type,
        asset_kind: row.asset_id != null ? a.asset_kind : null,
        payload: row.asset_id != null ? payload : null,
        sentence: shown, full: n.sentence, text_id: n.text_id ?? null, word: n.lemma,
        phonetic: d.phonetic || "", exchange: d.exchange || "", definition: d.definition || "",
        sense: n.sense, answer, clozeMiss: miss, state: row.state,
        choices, correctChoice,
      });`;
rep(oldDto, newDto, "dto");

fs.writeFileSync(p, s);
console.log("getDue asset branches + dto applied");
