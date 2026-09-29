const fs = require("fs");
const fp = "main.cjs";
let s = fs.readFileSync(fp, "utf8");
if (s.includes("__webllm__")) { console.log("already"); process.exit(0); }

const anchor = `  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    let file;
    const modelPrefix = "/__model__/";`;
if (!s.includes(anchor)) throw new Error("protocol anchor missing");

const repl = `  // V8 spike：/__webllm__/ 主进程代理上游（绕开 hf-mirror CORS；服务端可换镜像/接模型商店）
  const webllmProxy = async (req) => {
    const u = new URL(req.url);
    let upstream;
    if (u.pathname.startsWith("/__webllm__/hf/")) {
      upstream = "https://hf-mirror.com/" + u.pathname.slice("/__webllm__/hf/".length) + u.search;
    } else if (u.pathname.startsWith("/__webllm__/lib/")) {
      upstream = "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/"
        + u.pathname.slice("/__webllm__/lib/".length) + u.search;
    } else {
      return new Response("not found", { status: 404 });
    }
    let r;
    try {
      r = await fetch(upstream, { headers: { "User-Agent": "english-base-electron" } });
    } catch (e) {
      return new Response("upstream fetch failed: " + e.message, { status: 502 });
    }
    const headers = {
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Content-Type": r.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "no-store",
    };
    return new Response(r.body, { status: r.status, headers });
  };
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    if (u.pathname.startsWith("/__webllm__/")) return webllmProxy(req);
    let file;
    const modelPrefix = "/__model__/";`;
s = s.replace(anchor, repl);
fs.writeFileSync(fp, s, "utf8");
console.log("webllm proxy added");
