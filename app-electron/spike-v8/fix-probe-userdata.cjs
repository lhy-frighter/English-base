const fs = require("node:fs");
const files = [
  "D:/vibe coding/英语学习/app-electron/spike-v8/probe-response-format.cjs",
];
for (const p of files) {
  let s = fs.readFileSync(p, "utf8");
  const anchor = "const { app, safeStorage } = require(\"electron\");\n";
  const neu = anchor +
    "// 对齐正式应用的 userData（OSCrypt 主密钥存于该目录的 Local State），否则 safeStorage 解密失败\n" +
    "app.setPath(\"userData\", require(\"node:path\").join(process.env.APPDATA, \"english-base-electron\"));\n";
  if (s.indexOf(anchor) === -1) throw new Error("anchor missing");
  s = s.replace(anchor, neu);
  fs.writeFileSync(p, s);
  console.log("patched", p);
}
