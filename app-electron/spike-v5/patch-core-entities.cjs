// spike-v5/patch-core-entities.cjs — V5：core.cjs 实体表/解码函数补丁（幂等，带断言）
const fs = require("node:fs");
const p = require("node:path").join(__dirname, "..", "core.cjs");
let s = fs.readFileSync(p, "utf8");

const degLine = '  ldquo: "\\u201c", rdquo: "\\u201d", deg: "\\u00b0",';
if (!s.includes(degLine)) throw new Error("deg 锚点未找到");
if (!s.includes("ccedil")) {
  const entries = [
    "  // Latin-1 变音实体（网页导入常见的 &agrave; 等）",
    '  agrave: "\\u00e0", aacute: "\\u00e1", acirc: "\\u00e2", atilde: "\\u00e3", auml: "\\u00e4", aring: "\\u00e5", aelig: "\\u00e6",',
    '  ccedil: "\\u00e7", egrave: "\\u00e8", eacute: "\\u00e9", ecirc: "\\u00ea", euml: "\\u00eb",',
    '  igrave: "\\u00ec", iacute: "\\u00ed", icirc: "\\u00ee", iuml: "\\u00ef", ntilde: "\\u00f1",',
    '  ograve: "\\u00f2", oacute: "\\u00f3", ocirc: "\\u00f4", otilde: "\\u00f5", ouml: "\\u00f6", oslash: "\\u00f8",',
    '  ugrave: "\\u00f9", uacute: "\\u00fa", ucirc: "\\u00fb", uuml: "\\u00fc", yacute: "\\u00fd", thorn: "\\u00fe", szlig: "\\u00df", yuml: "\\u00ff",',
    '  Agrave: "\\u00c0", Aacute: "\\u00c1", Acirc: "\\u00c2", Atilde: "\\u00c3", Auml: "\\u00c4", Aring: "\\u00c5", Aelig: "\\u00c6",',
    '  Ccedil: "\\u00c7", Egrave: "\\u00c8", Eacute: "\\u00c9", Ecirc: "\\u00ca", Euml: "\\u00cb",',
    '  Igrave: "\\u00cc", Iacute: "\\u00cd", Icirc: "\\u00ce", Iuml: "\\u00cf", Ntilde: "\\u00d1",',
    '  Ograve: "\\u00d2", Oacute: "\\u00d3", Ocirc: "\\u00d4", Otilde: "\\u00d5", Ouml: "\\u00d6", Oslash: "\\u00d8",',
    '  Ugrave: "\\u00d9", Uacute: "\\u00da", Ucirc: "\\u00db", Uuml: "\\u00dc", Yacute: "\\u00dd", Thorn: "\\u00de",',
  ].join("\n");
  s = s.replace(degLine, degLine + "\n" + entries);
}

const oldFn = [
  "function decodeHtmlEntities(s) {",
  "  if (s == null) return s;",
  "  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {",
  "    if (body[0] === \"#\") {",
  "      const cp = body[1] === \"x\" || body[1] === \"X\" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);",
  "      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return m;",
  "      try { return String.fromCodePoint(cp); } catch { return m; }",
  "    }",
  "    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : m;",
  "  });",
  "}",
].join("\n");
const newFn = [
  "function decodeHtmlEntities(s) {",
  "  if (s == null) return s;",
  "  // 数字实体必须带分号；命名实体允许省略分号（HTML 遗留行为），但其后须是非字母数字/等号边界",
  "  return String(s).replace(/&(#x?[0-9a-fA-F]+;|[a-zA-Z]{2,10};?)/g, (m, body, off, whole) => {",
  "    if (body[0] === \"#\") {",
  "      const hex = body[1] === \"x\" || body[1] === \"X\";",
  "      const cp = hex ? parseInt(body.slice(2, -1), 16) : parseInt(body.slice(1, -1), 10);",
  "      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return m;",
  "      try { return String.fromCodePoint(cp); } catch { return m; }",
  "    }",
  "    const name = body.replace(/;$/, \"\");",
  "    if (!Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)) return m;",
  "    if (!m.endsWith(\";\")) {",
  "      const after = whole[off + m.length] || \"\";",
  "      if (/[A-Za-z0-9=]/.test(after)) return m;",
  "    }",
  "    return NAMED_ENTITIES[name];",
  "  });",
  "}",
].join("\n");
if (s.includes(newFn)) {
  console.log("already patched");
} else if (s.includes(oldFn)) {
  s = s.replace(oldFn, newFn);
  console.log("function patched");
} else {
  throw new Error("decodeHtmlEntities 旧函数体锚点未找到");
}
fs.writeFileSync(p, s);
console.log("OK", p);
