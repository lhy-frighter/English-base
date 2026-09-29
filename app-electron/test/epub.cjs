// epub 导入回归：内存构造最小合法 epub → extractText 提取 → 断言
// 运行：node test/epub.cjs（pnpm test 会连带执行）
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");
const { extractText } = require("../import-tools.cjs");

async function main() {
  const zip = new JSZip();
  zip.file("META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file("OEBPS/content.opf",
    `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
<manifest>
<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
<item id="nav" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
</manifest>
<spine><itemref idref="ch1"/><itemref idref="ch2"/><itemref idref="nav"/></spine></package>`);
  zip.file("OEBPS/ch1.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><style>.x{color:red}</style></head>
<body><h1>Chapter One</h1><p>Hello&nbsp;world&mdash;test of&#160;entities.</p><p>Second paragraph.</p></body></html>`);
  zip.file("OEBPS/ch2.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Diving into a fresh chapter.</p></body></html>`);
  zip.file("OEBPS/toc.ncx", "<ncx/>");
  const file = path.join(os.tmpdir(), "eb-epub-regression.epub");
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

  const { text } = await extractText(file);
  const occ = (text.match(/Chapter One/g) || []).length;
  const checks = [
    ["章节标题保留且不重复（恰好 1 次）", occ === 1],
    ["标题在正文之前", text.indexOf("Chapter One") >= 0 && text.indexOf("Chapter One") < text.indexOf("Hello world")],
    ["两章按 spine 顺序", text.indexOf("Diving into") > text.indexOf("Hello world")],
    ["剔除 style", !text.includes("color:red")],
    ["命名实体解码", text.includes("Hello world—test")],
    ["数字实体与 NBSP 归一", text.includes("of entities") && !text.includes("&#160;")],
    ["段落边界保留", text.includes("Second paragraph")],
    ["非 xhtml 的 ncx 跳过", !text.includes("<ncx")],
  ];
  let ok = true;
  for (const [name, pass] of checks) {
    console.log((pass ? "PASS" : "FAIL"), name);
    if (!pass) ok = false;
  }
  fs.rmSync(file, { force: true });
  if (!ok) process.exit(1);
  console.log("epub 回归全部通过");
}

main().catch((e) => { console.error(e); process.exit(1); });
