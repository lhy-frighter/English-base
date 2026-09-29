const { Core } = require("D:/vibe coding/英语学习/app-electron/core.cjs");
const fs = require("fs"), os = require("os"), path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "x-"));
const core = new Core(dir);
console.log("lemmaOf benefit:", core.lemmaOf.get("benefit"));
console.log("ruleLemma benefit:", (() => { try { return core.ruleLemma("benefit"); } catch (e) { return "ERR " + e.message; } })());
console.log("dict benefit:", !!core.user.prepare("SELECT 1 FROM dict.words WHERE word='benefit'").get());
