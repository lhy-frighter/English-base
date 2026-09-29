const fs = require("fs");
const s = fs.readFileSync("main.cjs", "utf8");
const i = s.indexOf('setApplicationMenu');
console.log(JSON.stringify(s.slice(i, i + 180)));
