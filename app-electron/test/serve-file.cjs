// serve-file 安全与 Range 回归（P0-6 防目录穿越、P0-3 Range 解析）。运行：node test/serve-file.cjs
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { safeJoin, parseRange, serveFile } = require("../serve-file.cjs");

let pass = 0, fail = 0;
function check(name, cond, extra) { console.log((cond ? "PASS" : "FAIL"), name, extra ?? ""); cond ? pass++ : fail++; }
const ROOT = path.join("D:", "sentinel-root");

// —— P0-6 safeJoin 边界 ——
check("正常子路径放行", safeJoin(ROOT, "a/b.json") === path.join(ROOT, "a/b.json"));
check("../ 越界拒绝", safeJoin(ROOT, "../secret.txt") === null);
check("多层 ../ 越界拒绝", safeJoin(ROOT, "a/b/../../../etc") === null);
check("%2e%2e%2f 编码穿越拒绝", safeJoin(ROOT, "%2e%2e%2f%2e%2e%2fsecret") === null);
check("双重编码 %252e 不展开即安全", safeJoin(ROOT, "%252e%252e/x") !== null); // 不解二次编码，落在字面目录（不存在但不越界）
check("兄弟前缀目录不可借 startsWith 逃逸", safeJoin(ROOT, "../sentinel-root-sibling/x") === null);
check("绝对 *nix 路径拒绝", safeJoin(ROOT, "/etc/passwd") === null);
check("Windows 盘符绝对路径拒绝", safeJoin(ROOT, "C:/Windows/system32") === null);
// 反斜杠在 Windows 上是分隔符（可穿越），在 *nix 上是合法文件名字符（不穿越）——
// 预期随平台变化，CI 在 ubuntu 上跑，不能断言同一结果。
if (process.platform === "win32") {
  check("反斜杠穿越拒绝（win32）", safeJoin(ROOT, "a\\..\\..\\b") === null);
} else {
  check("反斜杠在 *nix 是普通文件名（不越界）", safeJoin(ROOT, "a\\..\\..\\b") !== null);
}
check("空段回到 root", safeJoin(ROOT, "") === ROOT);
check("非法百分号编码拒绝", safeJoin(ROOT, "%zz") === null);
check("空字节拒绝", safeJoin(ROOT, "a\0b") === null);
check("query 被剥离", safeJoin(ROOT, "a.json?x=1") === path.join(ROOT, "a.json"));

// —— P0-3 parseRange ——
check("普通区间", (() => { const r = parseRange("bytes=0-99", 1000); return r.start === 0 && r.end === 99; })());
check("开区间 bytes=100-", (() => { const r = parseRange("bytes=100-", 1000); return r.start === 100 && r.end === 999; })());
check("后缀 bytes=-200", (() => { const r = parseRange("bytes=-200", 1000); return r.start === 800 && r.end === 999; })());
check("end 超界裁到末尾", (() => { const r = parseRange("bytes=0-99999", 1000); return r.end === 999; })());
check("start 越界 invalid", parseRange("bytes=1000-", 1000)?.invalid === true);
check("反序 invalid", parseRange("bytes=500-100", 1000)?.invalid === true);
check("无 Range 返回 null", parseRange(null, 1000) === null);

// —— P0-3 serveFile 真 206/200 + 流式内容正确 ——
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serve-test-"));
  const f = path.join(dir, "a.bin");
  const buf = Buffer.from("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"); // 36
  fs.writeFileSync(f, buf);
  const full = await serveFile(f, {});
  check("无 Range 返回 200 且全量", full.status === 200 && (await full.arrayBuffer()).byteLength === 36);
  check("200 带 content-length 与 accept-ranges", full.headers.get("content-length") === "36" && full.headers.get("accept-ranges") === "bytes");
  const partial = await serveFile(f, {}, { headers: { get: (k) => k.toLowerCase() === "range" ? "bytes=10-19" : null } });
  check("Range 返回 206", partial.status === 206);
  check("206 Content-Range 正确", partial.headers.get("content-range") === "bytes 10-19/36" && partial.headers.get("content-length") === "10");
  check("206 内容切片正确", Buffer.from(await partial.arrayBuffer()).toString() === "ABCDEFGHIJ");
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(`\n${pass} 通过 / ${fail} 失败 / serve-file`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
