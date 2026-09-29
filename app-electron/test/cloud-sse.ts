// V8-4 云端 SSE 解析回归：
// 多事件增量拼接、[DONE] 截断、坏 JSON/心跳行忽略、跨 chunk 缓冲拼接。
// 运行：node --experimental-strip-types test/cloud-sse.ts
import { parseSSEStream } from "../src/conversation/cloud-sse.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(cond ? "PASS" : "FAIL", name, extra);
  cond ? pass++ : fail++;
}

function sseBody(raw: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      // 按 20 字节切片，模拟网络分段
      const bytes = enc.encode(raw);
      for (let i = 0; i < bytes.length; i += 20) {
        controller.enqueue(bytes.slice(i, i + 20));
      }
      controller.close();
    },
  });
}

async function collect(raw: string) {
  const out: { delta: string; text: string }[] = [];
  for await (const c of parseSSEStream(sseBody(raw))) out.push(c);
  return out;
}

// 1) 正常多事件 + [DONE]
{
  const raw = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}`,
    "",
    `data: ${JSON.stringify({ choices: [{ delta: { content: " there" } }] })}`,
    "",
    `data: ${JSON.stringify({ choices: [{ delta: { content: "!" } }] })}`,
    "",
    "data: [DONE]",
    "",
    `data: ${JSON.stringify({ choices: [{ delta: { content: "AFTER" } }] })}`,
    "",
  ].join("\n");
  const out = await collect(raw);
  check("产出 3 个增量", out.length === 3, `got ${out.length}`);
  check("增量顺序正确", out.map((c) => c.delta).join("") === "Hello there!");
  check("累计文本正确", out[2].text === "Hello there!");
}

// 2) 空 delta 事件不产出
{
  const raw = [
    `data: ${JSON.stringify({ choices: [{ delta: {} }] })}`,
    "",
    `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}`,
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  const out = await collect(raw);
  check("空 delta 跳过", out.length === 1 && out[0].delta === "ok");
}

// 3) 坏 JSON / 注释 / 非 data 行忽略
{
  const raw = [
    ": ping",
    "",
    "data: {broken json",
    "",
    "event: keep-alive",
    "",
    `data: ${JSON.stringify({ choices: [{ delta: { content: "x" } }] })}`,
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  const out = await collect(raw);
  check("噪声行忽略", out.length === 1 && out[0].text === "x");
}

// 4) 无 [DONE]、流自然结束也能收齐
{
  const raw = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: "ab" } }] })}`,
    "",
  ].join("\n");
  const out = await collect(raw);
  check("无 DONE 自然结束", out.length === 1 && out[0].text === "ab");
}

console.log(`\ncloud-sse: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
