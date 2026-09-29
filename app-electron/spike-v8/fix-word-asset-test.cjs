const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/debrief.cjs";
let s = fs.readFileSync(tp, "utf8");
const old =
`db.prepare(\`INSERT INTO learning_assets
  (asset_kind,canonical,gloss,payload_json,identity_key,status,created_at,idempotency_key)
  VALUES('word','art','艺术','{}','lex:art','active',?,?)\`)
  .run(Date.now(), "word-art-1");`;
const neu =
`db.prepare("INSERT INTO lexemes (lemma,pos,sense,created_at) VALUES('art','n','艺术',?)")
  .run(Date.now());
const artLexId = db.prepare("SELECT id FROM lexemes WHERE lemma='art'").get().id;
db.prepare(\`INSERT INTO learning_assets
  (asset_kind,canonical,gloss,payload_json,lexeme_id,identity_key,status,created_at,idempotency_key)
  VALUES('word','art','艺术','{}',?,'lex:art','active',?,?)\`)
  .run(artLexId, Date.now(), "word-art-1");`;
if (s.indexOf(old) === -1) throw new Error("anchor missing");
s = s.replace(old, neu);
fs.writeFileSync(tp, s);
console.log("fixed");
