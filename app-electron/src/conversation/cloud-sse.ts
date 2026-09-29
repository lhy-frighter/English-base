// V8-4 云端 SSE 解析（独立模块、无 api 依赖，便于单测）：
// OpenAI 风格 "data: {...}\n\n"，"data: [DONE]" 结束；心跳/坏 JSON 行忽略。
export interface StreamChunk {
  delta: string;
  text: string;
}

export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // 流结束时冲刷尾部缓冲（最后一个事件可能不带结尾空行）
        if (buf.trim()) {
          for (const line of buf.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") break;
            try {
              const json = JSON.parse(data);
              const delta: string = json.choices?.[0]?.delta?.content || "";
              if (delta) {
                text += delta;
                yield { delta, text };
              }
            } catch {
              // 心跳/注释行忽略
            }
          }
        }
        break;
      }
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const rawEvent = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of rawEvent.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") return;
          try {
            const json = JSON.parse(data);
            const delta: string = json.choices?.[0]?.delta?.content || "";
            if (delta) {
              text += delta;
              yield { delta, text };
            }
          } catch {
            // 心跳/注释行忽略
          }
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}
