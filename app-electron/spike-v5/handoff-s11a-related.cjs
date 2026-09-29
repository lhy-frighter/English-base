// v2.22.0 条目补充同根词门控（34 链）
const fs = require("fs");
const fp = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const oldLine = "> - **验证**：新增 `test/s11-context-jump.cjs` **5 断言**（阅读卡带 text_id 与原句、独立卡 text_id=null、字段全覆盖）；**33 链 npm test 全绿**、tsc=0、vite build=0（index js 350.96kB/gzip 111.57kB）、隐藏冒烟通过。";
const newLines = [
"> - **顺手修（用户截图发现）：同根词假词族**。旧 `relatedWords()` 用 `word LIKE 'the%'` 前缀匹配，导致 the→theban/theist/thereon/theta 这类拼写相近但毫无词源关系的噪声。改为三级来源：①AWL 权威词族（头词+成员）；②ECDICT exchange 屈折（p/d/i/3/s/r/t，如 quicker/quickest、investigated）；③派生后缀门控（词干 ≥5 字母、共享词干、命中 tion/ment/ness/ity/ical/ive/ly/er/or/ing/ed/est 等真实后缀、排除连字符复合词）；the/of 等短功能词 family 直接为空。investigate→investigation/investigative/investigator 正常给出。",
"> - **验证**：新增 `test/s11-context-jump.cjs` **5 断言**、`test/s11-related.cjs` **13 断言**（功能词无假同根、屈折/派生正确、不含自身与连字符词）；**34 链 npm test 全绿**、tsc=0、vite build=0（index js 350.96kB/gzip 111.57kB）、隐藏冒烟通过。",
"> - **遗留说明**：功能词（the/a/of…）仍可从考纲页被用户主动收录建卡（用户显式动作，不拦截）；漏网词回收与推荐排序中的功能词过滤在 #111 S11-b 处理。"
].join("\r\n");
if (s.includes("s11-related.cjs")) { console.log("skip"); }
else {
  if (!s.includes(oldLine)) throw new Error("锚点缺失");
  s = s.replace(oldLine, newLines);
  fs.writeFileSync(fp, s, "utf8");
  console.log("patched");
}
