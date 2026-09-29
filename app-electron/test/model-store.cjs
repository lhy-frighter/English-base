// V6 模型下载器回归（hardening-0）：可信清单校验/固定 commit/staging 原子安装/回滚/续传/重定向/防同尺寸替换，
// 全部用 mock fetch 在临时目录离线进行。运行：node test/model-store.cjs
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { ModelStore, planResume, rewriteLocation, GCS_TRANSLATIONS_PREFIX } = require("../model-store.cjs");

let pass = 0, fail = 0;
function check(name, cond, extra) { console.log((cond ? "PASS" : "FAIL"), name, extra ?? ""); cond ? pass++ : fail++; }
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "model-store-test-")); }
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const FILES = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"];
function blobsFor(tag = "x") { const b = {}; for (const f of FILES) b[f] = Buffer.from("DATA-" + f + "-" + tag + "-" + "z".repeat(16)); return b; }
// 用已知 blob 构造“随应用发布的可信清单”（生产里这份清单内置在 model-store.cjs）
function buildCatalog(blobs, rev) {
  const files = FILES.map((p) => ({ path: p, bytes: blobs[p].length, sha256: sha(blobs[p]) }));
  return [{ id: "whisper-tiny.en", repo: "Xenova/whisper-tiny.en", revision: rev, dtype: "q8", name: "t", sizeNote: "",
    license: { model: "Apache-2.0", url: "" }, files, totalBytes: files.reduce((s, f) => s + f.bytes, 0) }];
}
function storeWith(blobs, rev = "revA") { const dir = tmp(); return { dir, store: new ModelStore(dir, { catalog: buildCatalog(blobs, rev) }) }; }

function makeServer(blobs, opt = {}) {
  const reqs = [];
  let flakyLeft = opt.flaky || 0, redirected = false;
  globalThis.fetch = async (url, init) => {
    reqs.push({ url: String(url), range: init?.headers?.Range || null });
    if (opt.redirectOnce && !redirected && /config\.json$/.test(String(url))) {
      redirected = true;
      return new Response(null, { status: 302, headers: { location: "https://huggingface.co/Xenova/whisper-tiny.en/resolve/revA/config.json" } });
    }
    if (opt.alwaysFailFile && String(url).includes(opt.alwaysFailFile)) return new Response("nf", { status: 404 });
    let key = Object.keys(blobs).filter((k) => String(url).endsWith(k)).sort((a, b) => b.length - a.length)[0];
    if (key == null) return new Response("nf", { status: 404 });
    if (flakyLeft > 0) { flakyLeft--; throw new Error("transient network"); }
    let buf = blobs[key];
    if (opt.sameSizeWrong) { // 同长度但内容被换（审查 P0-1 复现）
      buf = Buffer.from(buf); buf[0] = buf[0] === 65 ? 66 : 65;
    }
    const m = /bytes=(\d+)-/.exec(init?.headers?.Range || "");
    if (m) { const from = Number(m[1]); return new Response(buf.subarray(from), { status: 206, headers: { "content-length": String(buf.length - from), "accept-ranges": "bytes" } }); }
    return new Response(buf, { status: 200, headers: { "content-length": String(buf.length), "accept-ranges": "bytes" } });
  };
  return { reqs };
}

(async () => {
  // —— 纯函数 ——
  check("planResume 无 .part 从头下", planResume(0, 100, true).action === "restart");
  check("planResume 有残留且支持 Range 续传", planResume(40, 100, true).action === "resume");
  check("planResume 不支持 Range 重下", planResume(40, 100, false).action === "restart");
  check("planResume 已下满转校验", planResume(100, 100, true).action === "verify");
  check("rewriteLocation 把 hf.co 拉回镜像",
    rewriteLocation("https://huggingface.co/Xenova/x/resolve/revA/a.onnx", "https://hf-mirror.com") === "https://hf-mirror.com/Xenova/x/resolve/revA/a.onnx");
  check("rewriteLocation xethub 签名 URL 保持原样", /xethub/.test(rewriteLocation("https://cas-bridge.xethub.hf.co/abc?sig=1", "https://hf-mirror.com")));

  // 1) 全量安装：active 按 resolve/<固定commit> 布局 + 清单固定 revision + status installed
  {
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs); const srv = makeServer(blobs);
    const ev = []; const r = await store.ensure("whisper-tiny.en", (e) => ev.push(e.phase));
    const m = store.spec("whisper-tiny.en");
    const allThere = m.files.every((f) => fs.existsSync(store.activeFile(m, f.path)));
    check("全量安装 installed/7 文件", r.state === "installed" && r.files === 7 && r.revision === "revA", JSON.stringify(r).slice(0, 90));
    check("active 按 resolve/<commit> 布局", allThere);
    check("status=installed", store.status("whisper-tiny.en") === "installed");
    const man = store.manifest("whisper-tiny.en");
    check("清单固定 revision 且哈希=可信清单", man.revision === "revA" && man.files.every((x) => x.sha256 === sha(blobs[x.path])));
    check("进度事件含 installed", ev.includes("installed"));
    const v = await store.verifyActive("whisper-tiny.en");
    check("verifyActive 全过", v.ok === true && v.files.length === 7);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 2) 二次运行零网络（深校验哈希通过即 skip）
  {
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs); const srv = makeServer(blobs);
    await store.ensure("whisper-tiny.en", () => {});
    const before = srv.reqs.length;
    const r = await store.ensure("whisper-tiny.en", () => {});
    check("已装二次零网络", srv.reqs.length === before, "reqs=" + srv.reqs.length);
    check("二次返回 cached", r.cached === true);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 3) P0-1 核心：同尺寸替换必须判失效并自愈
  {
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs); makeServer(blobs);
    const m = store.spec("whisper-tiny.en");
    await store.ensure("whisper-tiny.en", () => {});
    const cfg = store.activeFile(m, "config.json");
    const evil = Buffer.from(fs.readFileSync(cfg)); evil[evil.length - 1] = evil[evil.length - 1] === 65 ? 66 : 65; // 等长改一个字节
    fs.writeFileSync(cfg, evil);
    const v = await store.verifyActive("whisper-tiny.en");
    check("同尺寸被替换 verifyActive=false", v.ok === false && v.files.find((x) => x.path === "config.json").ok === false);
    check("同尺寸被替换 status≠installed", store.status("whisper-tiny.en") !== "installed");
    const r = await store.ensure("whisper-tiny.en", () => {}); // 重新下载自愈
    check("被替换后 ensure 自愈回 installed", r.state === "installed" && (await store.verifyActive("whisper-tiny.en")).ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 4) 服务端内容与可信哈希不符（等长）→ 重试耗尽抛错、绝不 commit、active 无文件
  {
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs); makeServer(blobs, { sameSizeWrong: true });
    let threw = false;
    try { await store.ensure("whisper-tiny.en", () => {}); } catch (e) { threw = /SHA256|下载失败/.test(String(e.message)); }
    check("哈希不符重试耗尽抛错", threw);
    check("哈希不符不写清单", store.manifest("whisper-tiny.en") === null);
    const m = store.spec("whisper-tiny.en");
    check("哈希不符 active 未被污染", !fs.existsSync(store.activeDir(m)) || m.files.every((f) => !fs.existsSync(store.activeFile(m, f.path))));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 5) P0-2：中途某文件始终失败 → 不产生新旧混合 active；修好后从 staging 续装并 commit
  {
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs); makeServer(blobs, { alwaysFailFile: "encoder" });
    let threw = false;
    try { await store.ensure("whisper-tiny.en", () => {}); } catch { threw = true; }
    check("部分失败抛错", threw);
    const m = store.spec("whisper-tiny.en");
    check("失败时 active 目录无任何文件（无新旧混合）", !fs.existsSync(store.activeDir(m)));
    check("失败时 staging 保留已下文件", fs.existsSync(store.stageFile("whisper-tiny.en", "config.json")));
    check("失败时 status=partial", store.status("whisper-tiny.en") === "partial");
    makeServer(blobs); // 换健康服务
    const r = await store.ensure("whisper-tiny.en", () => {});
    check("恢复后从 staging 续装成功", r.state === "installed");
    check("commit 后 staging 已清空", !fs.existsSync(store.stageDir("whisper-tiny.en")));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 6) 断点续传：半份 .part + 206 拼全
  {
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs); const srv = makeServer(blobs);
    const part = store.partFile("whisper-tiny.en", "onnx/encoder_model_quantized.onnx");
    fs.mkdirSync(path.dirname(part), { recursive: true });
    fs.writeFileSync(part, blobs["onnx/encoder_model_quantized.onnx"].subarray(0, 10));
    const r = await store.ensure("whisper-tiny.en", () => {});
    check("续传发过 Range", !!srv.reqs.find((x) => /encoder/.test(x.url) && x.range));
    const m = store.spec("whisper-tiny.en");
    check("续传拼全且哈希正确", fs.readFileSync(store.activeFile(m, "onnx/encoder_model_quantized.onnx")).equals(blobs["onnx/encoder_model_quantized.onnx"]));
    check("续传场景 installed", r.state === "installed");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 7) 重定向拉回镜像
  {
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs); const srv = makeServer(blobs, { redirectOnce: true });
    const r = await store.ensure("whisper-tiny.en", () => {});
    check("302 拉回后 installed", r.state === "installed");
    check("config 请求≥2 次", srv.reqs.filter((x) => /config\.json/.test(x.url)).length >= 2);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 8) 相对 Location
  {
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs); let n = 0;
    globalThis.fetch = async (url) => {
      const key = FILES.filter((k) => String(url).endsWith(k)).sort((a, b) => b.length - a.length)[0];
      if (/config\.json$/.test(String(url)) && n++ === 0) return new Response(null, { status: 302, headers: { location: "/api/resolve-cache/config" } });
      return new Response(blobs[key], { status: 200, headers: { "content-length": String(blobs[key].length) } });
    };
    const r = await store.ensure("whisper-tiny.en", () => {});
    check("相对 Location 解析后 installed", r.state === "installed");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 9) 瞬时错误重试成功
  {
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs); makeServer(blobs, { flaky: 2 });
    check("瞬时错误重试成功", (await store.ensure("whisper-tiny.en", () => {})).state === "installed");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 10) 取消
  {
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs); makeServer(blobs);
    const p = store.ensure("whisper-tiny.en", () => {});
    store.cancel("whisper-tiny.en");
    const r = await p;
    check("取消返回 cancelled", r.state === "cancelled");
    check("取消不写清单", store.manifest("whisper-tiny.en") === null);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 11) 镜像校验
  {
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs);
    check("默认镜像 hf-mirror", /hf-mirror/.test(store.getMirror()));
    store.setMirror("https://my-oss.example.com/");
    check("自定义镜像去尾斜杠", store.getMirror() === "https://my-oss.example.com");
    let bad = false; try { store.setMirror("not-a-url"); } catch { bad = true; }
    check("非法镜像拒绝", bad);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 12) P0-2 版本回滚：装 revA 再装 revB，旧版本保留，可回滚到 revA
  {
    const dir = tmp();
    const blobsA = blobsFor("A"), blobsB = blobsFor("B");
    const storeA = new ModelStore(dir, { catalog: buildCatalog(blobsA, "revA") });
    makeServer(blobsA); await storeA.ensure("whisper-tiny.en", () => {});
    const storeB = new ModelStore(dir, { catalog: buildCatalog(blobsB, "revB") });
    makeServer(blobsB); await storeB.ensure("whisper-tiny.en", () => {});
    const mB = storeB.spec("whisper-tiny.en"), mA = storeA.spec("whisper-tiny.en");
    check("升级后旧 revision 目录保留", fs.existsSync(storeA.activeDir(mA)) && fs.existsSync(storeB.activeDir(mB)));
    check("当前清单=revB", storeB.manifest("whisper-tiny.en").revision === "revB");
    const rb = await storeB.rollback("whisper-tiny.en");
    check("rollback 指向 revA", rb.revision === "revA" && storeB.manifest("whisper-tiny.en").revision === "revA");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 13) 完整断点处理（真机闸门发现：完整 .part 续传会发 bytes=全长- 导致 416 死路）
  {
    // 13a 完整且哈希正确的 .part：零请求直接提升
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs);
    const part = store.partFile("whisper-tiny.en", "config.json");
    fs.mkdirSync(path.dirname(part), { recursive: true });
    fs.writeFileSync(part, blobs["config.json"]);
    const reqs = [];
    globalThis.fetch = async (url, init) => {
      reqs.push(String(url));
      const key = FILES.filter((k) => String(url).endsWith(k)).sort((a, b) => b.length - a.length)[0];
      return new Response(blobs[key], { status: 200, headers: { "content-length": String(blobs[key].length) } });
    };
    const r1 = await store.ensure("whisper-tiny.en", () => {});
    check("完整合法断点零请求提升", r1.state === "installed" && !reqs.some((u) => /\/config\.json$/.test(u) && !/generation_config\.json$/.test(u)));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    // 13b 半截断点但服务端对 Range 回 416：丢弃断点从头重下，安装成功
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs);
    const part = store.partFile("whisper-tiny.en", "config.json");
    fs.mkdirSync(path.dirname(part), { recursive: true });
    fs.writeFileSync(part, blobs["config.json"].subarray(0, 10));
    globalThis.fetch = async (url, init) => {
      const key = FILES.filter((k) => String(url).endsWith(k)).sort((a, b) => b.length - a.length)[0];
      if (init?.headers?.Range) return new Response(null, { status: 416, headers: { "content-range": "*/" + blobs[key].length } });
      return new Response(blobs[key], { status: 200, headers: { "content-length": String(blobs[key].length) } });
    };
    const r2 = await store.ensure("whisper-tiny.en", () => {});
    check("416 后丢弃断点重下成功", r2.state === "installed" && (await store.verifyActive("whisper-tiny.en")).ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    // 13c 完整但哈希损坏的 .part：删除重下，不把坏文件提升进 staging
    const blobs = blobsFor(); const { dir, store } = storeWith(blobs);
    const part = store.partFile("whisper-tiny.en", "config.json");
    fs.mkdirSync(path.dirname(part), { recursive: true });
    const evil = Buffer.from(blobs["config.json"]); evil[0] = evil[0] === 65 ? 66 : 65;
    fs.writeFileSync(part, evil);
    makeServer(blobs);
    const r3 = await store.ensure("whisper-tiny.en", () => {});
    const m = store.spec("whisper-tiny.en");
    check("完整坏断点被替换", r3.state === "installed" && fs.readFileSync(store.activeFile(m, "config.json")).equals(blobs["config.json"]));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ============ S7b：GCS gzip 翻译模型分支 ============
  const GZ_FILES = ["model.enzh.bin", "lex.s2t.bin", "srcvocab.spm", "trgvocab.spm"];
  const gzBlobsFor = (tag = "g") => {
    const raw = {}, gz = {};
    for (const f of GZ_FILES) { raw[f] = Buffer.from("MODEL-" + f + "-" + tag + "-" + "q".repeat(40)); gz[f] = zlib.gzipSync(raw[f]); }
    return { raw, gz };
  };
  const buildGzCatalog = (raw, gz) => {
    const files = GZ_FILES.map((p) => ({ path: p, bytes: raw[p].length, sha256: sha(raw[p]),
      gzBytes: gz[p].length, gzUrl: GCS_TRANSLATIONS_PREFIX + "models/en-zh/x/exported/" + p + ".gz" }));
    return [{ id: "bergamot-enzh", repo: "bergamot/enzh", revision: "revZ", transport: "gcs-gz",
      dtype: "intgemm8", name: "t", sizeNote: "", license: { model: "MPL-2.0", url: "https://x" },
      files, totalBytes: files.reduce((s, f) => s + f.bytes, 0) }];
  };
  const gzStore = (blobs) => { const dir = tmp(); return { dir, store: new ModelStore(dir, { catalog: buildGzCatalog(blobs.raw, blobs.gz) }) }; };
  const makeGzServer = (blobs, opt = {}) => {
    const reqs = [];
    globalThis.fetch = async (url, init) => {
      reqs.push(String(url));
      const key = GZ_FILES.filter((k) => String(url).endsWith(k + ".gz")).sort((a, b) => b.length - a.length)[0];
      if (key == null) return new Response("nf", { status: 404 });
      if (opt.hang) return new Promise(() => {}); // 永不返回，用于取消测试
      let body = blobs.gz[key];
      if (opt.wrongContent) {
        // 同解压长度但内容不同 → 绕过压缩包长度检查，专门命中解压后 SHA256 校验
        body = zlib.gzipSync(Buffer.from("x".repeat(blobs.raw[key].length)));
        return new Response(body, { status: 200 }); // 故意不给 content-length
      }
      if (opt.truncate) body = body.subarray(0, Math.max(8, body.length - 30));
      const len = opt.wrongLen ? body.length + 7 : body.length;
      return new Response(body, { status: 200, headers: { "content-length": String(len) } });
    };
    return { reqs };
  };

  // G1) gz 正常安装：边下边解压，active 为解压内容且深校验通过
  {
    const blobs = gzBlobsFor(); const { dir, store } = gzStore(blobs); const srv = makeGzServer(blobs);
    const r = await store.ensure("bergamot-enzh", () => {});
    const m = store.spec("bergamot-enzh");
    check("gz 全量安装 installed/4 文件", r.state === "installed" && r.files === 4, JSON.stringify(r).slice(0, 80));
    check("gz active 为解压后内容", m.files.every((f) => fs.readFileSync(store.activeFile(m, f.path)).equals(blobs.raw[f.path])));
    check("gz verifyActive 全过", (await store.verifyActive("bergamot-enzh")).ok === true);
    check("gz 请求命中 GCS 且为 .gz", srv.reqs.length === 4 && srv.reqs.every((u) => /storage\.googleapis\.com/.test(u) && /\.gz$/.test(u)));
    const before = srv.reqs.length;
    const r2 = await store.ensure("bergamot-enzh", () => {});
    check("gz 已装二次零网络", srv.reqs.length === before && r2.cached === true);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // G2) 压缩包 content-length 与清单不符 → 重试耗尽、绝不 commit
  {
    const blobs = gzBlobsFor(); const { dir, store } = gzStore(blobs); makeGzServer(blobs, { wrongLen: true });
    let threw = false;
    try { await store.ensure("bergamot-enzh", () => {}); } catch (e) { threw = /压缩包大小/.test(String(e.message)); }
    check("gz content-length 不符抛错", threw);
    check("gz content-length 不符不 commit", store.manifest("bergamot-enzh") === null);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // G3) 解压后 SHA256 不符 → 重试耗尽、active 无污染
  {
    const blobs = gzBlobsFor(); const { dir, store } = gzStore(blobs); makeGzServer(blobs, { wrongContent: true });
    let threw = false;
    try { await store.ensure("bergamot-enzh", () => {}); } catch (e) { threw = /SHA256|大小不符/.test(String(e.message)); }
    check("gz 解压内容不符抛错", threw);
    const m = store.spec("bergamot-enzh");
    check("gz 解压内容不符 active 无污染", !fs.existsSync(store.activeDir(m)));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // G4) 取消：进行中 cancel 返回 cancelled，不 commit
  {
    const blobs = gzBlobsFor(); const { dir, store } = gzStore(blobs); makeGzServer(blobs, { hang: true });
    const p = store.ensure("bergamot-enzh", () => {});
    await new Promise((r) => setTimeout(r, 30));
    const cancelled = store.cancel("bergamot-enzh");
    const r = await p;
    check("gz 取消返回 cancelled", cancelled && r.state === "cancelled", JSON.stringify(r));
    check("gz 取消不 commit", store.manifest("bergamot-enzh") === null);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // G5) 翻译镜像：前缀替换 + HTTP 默认拒绝/显式测试模式放行
  {
    const blobs = gzBlobsFor(); const { dir, store } = gzStore(blobs);
    const m = store.spec("bergamot-enzh");
    store.setMtMirror("https://mt-mirror.example.com/");
    const u = store.fileUrl(m, GZ_FILES[0], store.getMtMirror());
    check("mtMirror 前缀替换且保留目录结构",
      u === "https://mt-mirror.example.com/models/en-zh/x/exported/" + GZ_FILES[0] + ".gz", u);
    let httpRejected = false;
    try { store.setMtMirror("http://mt-mirror.example.com"); } catch { httpRejected = true; }
    check("HTTP 翻译镜像默认拒绝", httpRejected);
    const dir2 = tmp();
    const loose = new ModelStore(dir2, { catalog: buildGzCatalog(blobs.raw, blobs.gz), allowInsecureMirror: true });
    check("allowInsecureMirror 下放行 HTTP", loose.setMtMirror("http://mt-mirror.example.com") === "http://mt-mirror.example.com");
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(dir2, { recursive: true, force: true });
  }

  // J1) jsdelivr 通道（WebLLM wasm lib）：fileUrl 取 cdnUrl 且必须 HTTPS；ensure 全量安装+深校验
  {
    const libFiles = ["a.wasm", "b.wasm"];
    const blobs = {}; for (const f of libFiles) blobs[f] = Buffer.from("WASM-" + f + "-" + "w".repeat(32));
    const files = libFiles.map((p) => ({ path: p, bytes: blobs[p].length, sha256: sha(blobs[p]), cdnUrl: "https://cdn.jsdelivr.net/x/" + p }));
    const cat = [{ id: "webllm-lib", repo: "mlc-ai/binary-mlc-llm-libs", revision: "v0_2_84-base", transport: "jsdelivr",
      dtype: "wasm", name: "t", sizeNote: "", license: { model: "Apache-2.0", url: "https://example.com" },
      files, totalBytes: files.reduce((s, f) => s + f.bytes, 0) }];
    const dir = tmp(); const store = new ModelStore(dir, { catalog: cat });
    const reqs = [];
    globalThis.fetch = async (url, init) => {
      reqs.push(String(url));
      const key = libFiles.find((f) => String(url).endsWith(f));
      const buf = blobs[key];
      const m = /bytes=(\d+)-/.exec(init?.headers?.Range || "");
      if (m) { const from = Number(m[1]); return new Response(buf.subarray(from), { status: 206, headers: { "content-length": String(buf.length - from), "accept-ranges": "bytes" } }); }
      return new Response(buf, { status: 200, headers: { "content-length": String(buf.length), "accept-ranges": "bytes" } });
    };
    const m = store.spec("webllm-lib");
    check("jsdelivr fileUrl 为 cdnUrl 且 HTTPS", store.fileUrl(m, "a.wasm", "") === "https://cdn.jsdelivr.net/x/a.wasm");
    await store.ensure("webllm-lib", () => {});
    const v = await store.verifyActive("webllm-lib");
    check("jsdelivr 安装后深校验通过", v.ok);
    check("jsdelivr 请求走 cdn 域", reqs.every((u) => u.startsWith("https://cdn.jsdelivr.net/")));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${pass} 通过 / ${fail} 失败 / model-store`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

