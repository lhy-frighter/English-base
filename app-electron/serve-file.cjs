// 统一的本地文件 → Web Response（异步流式，不阻塞 Electron 主进程；真正支持 Range/206）。
// hardening-0（P0-3/P0-6）：
//  - Electron 38 的 net 无 responseFromFileURL；这里用 fs.createReadStream → web ReadableStream，按需切片。
//  - safeJoin 用 path.relative 做目录边界判定，拒绝绝对路径/盘符/UNC/任何 .. 段/非法编码（防 %2e%2e 穿越）。
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const { Readable } = require("node:stream");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".json": "application/json",
  ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".map": "application/json",
};

// 安全地把 URL 路径段拼到 root 内；越界返回 null（P0-6）
function safeJoin(root, urlPath) {
  let seg;
  try { seg = decodeURIComponent(String(urlPath == null ? "" : urlPath).split("?")[0]); }
  catch { return null; } // 非法百分号编码
  if (seg.includes("\0")) return null;
  // 拒绝绝对路径：*nix 以 / 开头、Windows 盘符 X:、UNC // 或 \\
  if (/^[\\/]/.test(seg) || /^[a-zA-Z]:[\\/]/.test(seg)) return null;
  const target = path.normalize(path.join(root, seg));
  const rel = path.relative(root, target);
  if (rel === "") return target; // root 自身
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) return null;
  return target;
}

function parseRange(header, total) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m) return null;
  let start, end;
  if (m[1] === "" && m[2] !== "") { // bytes=-N：最后 N 字节
    const n = Number(m[2]);
    if (!Number.isFinite(n) || n <= 0) return { invalid: true };
    start = Math.max(0, total - n); end = total - 1;
  } else {
    start = Number(m[1]); end = m[2] === "" ? total - 1 : Number(m[2]);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) return { invalid: true };
  end = Math.min(end, total - 1);
  return { start, end };
}

// 异步流式响应；req 非空时解析其 Range 头，命中返回 206
async function serveFile(file, extraHeaders = {}, req = null) {
  const st = await fsp.stat(file);
  if (st.isDirectory()) return new Response("is directory", { status: 404 });
  const total = st.size;
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  const base = { ...extraHeaders, "content-type": type, "accept-ranges": "bytes" };

  const range = parseRange(req?.headers?.get?.("range"), total);
  if (range?.invalid) {
    return new Response("range not satisfiable", { status: 416, headers: { ...base, "content-range": `bytes */${total}` } });
  }
  if (range) {
    const { start, end } = range;
    const nodeStream = fs.createReadStream(file, { start, end });
    const body = Readable.toWeb(nodeStream);
    return new Response(body, {
      status: 206,
      headers: { ...base, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(end - start + 1) },
    });
  }
  const nodeStream = fs.createReadStream(file);
  return new Response(Readable.toWeb(nodeStream), { status: 200, headers: { ...base, "content-length": String(total) } });
}

module.exports = { serveFile, safeJoin, parseRange, MIME };
