// S14-1B realtime-relay 纯逻辑回归：
// endpoint allowlist、WAV 头构建/PCM 包装、事件脱敏、上下文 instructions 组装。
// 运行：node test/realtime-relay.cjs
const {
  RealtimeRelay, isAllowedEndpoint, buildWavHeader, wrapWav, redact, DEFAULT_ENDPOINT,
} = require("../realtime-relay.cjs");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

// —— 1. endpoint allowlist ——
check("默认端点在 allowlist", isAllowedEndpoint(DEFAULT_ENDPOINT));
check("wss 官方端点通过", isAllowedEndpoint("wss://open.bigmodel.cn/api/paas/v4/realtime"));
check("https 官方端点通过", isAllowedEndpoint("https://open.bigmodel.cn/"));
check("其他主机拒绝", !isAllowedEndpoint("wss://evil.example.com/"));
check("非安全 ws 拒绝", !isAllowedEndpoint("ws://open.bigmodel.cn/"));
check("非法 URL 拒绝", !isAllowedEndpoint("not a url"));
check("空串拒绝", !isAllowedEndpoint(""));

// —— 2. WAV 头 ——
{
  const h = buildWavHeader(2000, 16000);
  check("WAV 头 44 字节", h.length === 44);
  check("RIFF 标记", h.toString("latin1", 0, 4) === "RIFF");
  check("WAVE 标记", h.toString("latin1", 8, 12) === "WAVE");
  check("fmt 标记", h.toString("latin1", 12, 16) === "fmt ");
  check("data 标记", h.toString("latin1", 36, 40) === "data");
  check("PCM format=1", h.readUInt16LE(20) === 1);
  check("mono=1", h.readUInt16LE(22) === 1);
  check("采样率 16000", h.readUInt32LE(24) === 16000);
  check("bytes/sec=32000", h.readUInt32LE(28) === 32000);
  check("16 bits", h.readUInt16LE(34) === 16);
  check("RIFF 尺寸=36+pcm", h.readUInt32LE(4) === 36 + 2000);
  check("data 尺寸=pcm", h.readUInt32LE(40) === 2000);
}

// —— 3. wrapWav ——
{
  const pcm = Buffer.from([1, 2, 3, 4, 5, 6]);
  const wav = wrapWav(pcm, 16000);
  check("包装长度=44+pcm", wav.length === 44 + 6);
  check("PCM 内容保留", wav.slice(44).equals(pcm));
}

// —— 4. redact ——
{
  const out = redact({
    type: "x",
    audio: "UklGRiQAAABX",
    Authorization: "Bearer secret",
    api_key: "abc",
    token: "t",
    delta: "Blueberry.",          // 文本 delta 必须保留
    nested: { audio: "AAAA", keep: 1 },
    arr: [{ audio: "BB" }, { text: "ok" }],
  });
  check("audio 被剥离", typeof out.audio === "string" && out.audio.startsWith("<redacted"));
  check("Authorization 被剥离", out.Authorization === "<redacted>");
  check("api_key 被剥离", out.api_key === "<redacted>");
  check("token 被剥离", out.token === "<redacted>");
  check("文本 delta 保留", out.delta === "Blueberry.");
  check("嵌套 audio 剥离", out.nested.audio.startsWith("<redacted") && out.nested.keep === 1);
  check("数组项处理", out.arr[0].audio.startsWith("<redacted") && out.arr[1].text === "ok");
  check("原始值透传", redact(42) === 42 && redact("s") === "s");
}

// —— 5. buildContextInstructions ——
{
  const stubPort = { on() { return this; }, start() {}, postMessage() {}, close() {} };
  const relay = new RealtimeRelay({ port: stubPort, apiKey: "k", log() {} });
  const session = { instructions: "BASE PROMPT" };
  check("空 transcript 保持基础 instructions",
    relay.buildContextInstructions(session, "") === "BASE PROMPT");
  const built = relay.buildContextInstructions(session, "User: hi\nAssistant: hello");
  check("含基础 prompt", built.includes("BASE PROMPT"));
  check("含裁剪 transcript", built.includes("User: hi\nAssistant: hello"));
  check("含上下文引导语", built.includes("authoritative transcript"));
}

console.log(`\nrealtime-relay: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
