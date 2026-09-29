const fs = require("fs");
const fp = require("path").resolve(__dirname, "..", "test", "s9-contract.cjs");
let s = fs.readFileSync(fp, "utf8");
const oldStr = "  VALUES ('read','k-open-1','text','7','Attention','{\"pi\":3,\"ch\":12}','abc',320,'words',?,?,NULL,?,'open',12000)`)\n  .run(now - 12000, now, now);";
const newStr = "  VALUES ('read','k-open-1','text','7','Attention','{\"pi\":3,\"ch\":12}','abc',320,'words',?,NULL,?,'open',12000)`)\n  .run(now - 12000, now);";
if (!s.includes(oldStr)) throw new Error("anchor missing");
fs.writeFileSync(fp, s.replace(oldStr, newStr));
console.log("fixed");
