const fs = require("fs");
const fp = "main.cjs";
let s = fs.readFileSync(fp, "utf8");
if (s.includes('app.setPath("userData"')) { console.log("already"); process.exit(0); }
const anchor = 'const http = require("node:http");\n';
if (!s.includes(anchor)) throw new Error("anchor missing");
s = s.replace(anchor, anchor + `
// 本地优先/可携带：Electron userData（含 WebLLM Cache API 模型缓存）落在工程 data 目录，不写入 %APPDATA%
app.setPath("userData", path.join(__dirname, "data", "webllm-profile"));
`);
fs.writeFileSync(fp, s, "utf8");
console.log("userData redirect added");
