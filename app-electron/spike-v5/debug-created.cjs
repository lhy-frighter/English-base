const path = require("path");
const { Core } = require(path.join(__dirname, "..", "core.cjs"));
const dataDir = path.join(__dirname, "..", "data");
const core = new Core(dataDir);
const rows = core.user.prepare("SELECT id, created_at, asset_id FROM cards WHERE state=0 ORDER BY created_at").all();
for (const r of rows) console.log(r.id, r.created_at, r.asset_id ?? "");
console.log("now:", Date.now());
