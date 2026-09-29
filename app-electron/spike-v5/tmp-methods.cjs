const fs=require("fs");
const s=fs.readFileSync("core.cjs","utf8");
const methods=[...s.matchAll(/^  ([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm)].map(m=>m[1]);
console.log(methods.join("\n"));
console.log("count:",methods.length);
