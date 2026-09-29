const fs = require("node:fs");
const p = require("node:path").join(__dirname, "..", "core.cjs");
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
for (let i = 1775; i < 1795; i++) console.log(i + 1, JSON.stringify(lines[i]));
