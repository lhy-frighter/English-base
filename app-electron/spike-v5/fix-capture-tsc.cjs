const fs = require("fs");

// App.tsx: title 不在 Annotated 上，改用常量（origin_ref 已带 text_id）
const ap = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let a = fs.readFileSync(ap, "utf8");
const oldA = `            title: ann?.title ?? "阅读文章",`;
if (!a.includes(oldA)) throw new Error("App title anchor missing");
a = a.replace(oldA, `            title: "阅读文章",`);
fs.writeFileSync(ap, a);

// AssetCaptureSheet: useMemo 闭包内 source 可空
const sp = "D:/vibe coding/英语学习/app-electron/src/components/AssetCaptureSheet.tsx";
let s = fs.readFileSync(sp, "utf8");
const oldS = "    return `ui-${source.originKind}-${source.originRef}-${kind}-${shortHash(canonical)}`;";
if (!s.includes(oldS)) throw new Error("sheet anchor missing");
s = s.replace(oldS,
  "    return `ui-${source?.originKind ?? \"\"}-${source?.originRef ?? \"\"}-${kind}-${shortHash(canonical)}`;");
fs.writeFileSync(sp, s);
console.log("tsc fixes applied");
