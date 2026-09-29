# S14-1A GLM Realtime 协议探针报告

- 任务编号：#165
- 日期：2026-09-26
- 状态：**协议探针完成，关键闸门结论已落定**
- 依据：《V11-云端深度分析与语音通话方案 v1.1》B1 节
- 原始数据：`realtime-probe.json`、`realtime-probe-2.json`、`realtime-probe-3.json`
- 协议原文：`sdk-ref/GLM-Realtime-doc-for-llm.md`；官方前端参考：`sdk-ref/realtimeChat.ts`、`userStream.ts`、`vad.ts`
---

## 修订说明（2026-09-26 深夜，S14-1B 结论）

- **§4.3 的「conversation.item.create 重放裁剪历史」对策已被推翻**：S14-1B 实测确认，该端点对 message 类 item（`input_text`/`text`/`input_audio`，含完整 `id`/`object`/`status` 形态）一律静默忽略——不报错，但 `response.create` 后返回空回复（transcript 为空、无音频）。官方前端 `realtimeChat.ts` 从不调用 `conversation.item.create`。
- **正式对账方案改为 instructions-as-context**：客户端权威历史裁剪后写入新连接 `session.instructions`（被打断助手消息仅含已播前缀），再 append 用户新轮音频并 `response.create`。`spike-v8/replay-probe.cjs` 两测全过（codeword→"Blueberry."、meeting password→"Raspberry."），重连 157–338ms。
- 本报告其余协议事实（鉴权、PCM/MP3 下行、Server VAD 姿势、cancel 不删除已生成内容、收敛时序）均经 S14-1B 复验仍然成立。

---

## 1. 探针目标

1. 探明鉴权方式与连接建立；
2. 探明音频上行/下行的真实格式（WAV/PCM/MP3）与延迟；
3. **P0 闸门**：`response.cancel` 后，用户未听到的助手内容是否仍保留在服务端会话历史中；
4. 探明 Server VAD 的正确客户端姿势；
5. 探明打断（barge-in）的事件时序与收敛时间。

## 2. 鉴权与连接（已确认）

- 端点：`wss://open.bigmodel.cn/api/paas/v4/realtime`
- 鉴权：`Authorization: Bearer {api_key}` 请求头（官方 Python 样例确认）。Node/Electron 主进程全局 `WebSocket` 支持自定义头：`new WebSocket(url, { headers: { Authorization: "Bearer ..." } })`。
  - JWT（query token）是浏览器无法加自定义头时的备选，**正式架构不采用**。
- 建连耗时：**162–295ms**；连接后依次收到 `heartbeat`、`session.created`。
- `session.update` 后收到 `session.updated`；`beta_fields` 必须**嵌套**在 session 内（见 §7）。
- Realtime 为独立付费产品：欠费时 `session.update` 返回 error 1113「账户已欠费」（充值前实测）；文字 API 免费额度与 Realtime 无关。

会话配置（探针使用，全部验证通过）：

```json
{
  "type": "session.update",
  "session": {
    "input_audio_format": "wav",
    "output_audio_format": "mp3",
    "instructions": "...",
    "turn_detection": { "type": "client_vad" },
    "beta_fields": { "chat_mode": "audio", "tts_source": "e2e", "auto_search": false },
    "tools": []
  }
}
```

## 3. 音频协议实测

### 3.1 上行

- Client VAD 路径：**一个完整 WAV（44 字节 RIFF 头 + PCM）base64 一次 append → commit → response.create**，完全正常。
- 输入 WAV：16kHz / mono / 16-bit。
- Server VAD 路径：见 §5。

### 3.2 下行

| 输出格式 | 实测 | 音频块 | 拼接方式 |
|---|---|---|---|
| `pcm` | 2 个 `response.audio.delta`，共 73,930 字节 raw PCM | 直接顺序拼接（无帧头） |
| `mp3` | 2 个 delta，共 43,750 字节 | MP3 块顺序拼接为完整文件 |

- **首音延迟**（`response.create` 发出 → 首个 `response.audio.delta`）：PCM **1701ms** / MP3 **1569ms**。
- 文本/transcript 流先于音频到达；音频为可流式播放的分块，**不需要**对每个 delta 单独 `decodeAudioData()`（MP3 走连续解码/拼接，PCM 直接入 PCM 播放队列）。
- 公开示例默认 MP3；PCM 同样真实可用。产品化时两种都保留，按播放管线选择。

## 4. P0 闸门：取消内容的历史一致性（最重要）

### 4.1 实验设计

- **E（内燃机，话题污染版）**：用户提问要求 ≥300 词讲内燃机原理 → 助手长答生成到 1633 字符（5 个音频块）时 `response.cancel` → 用户再问 "Please repeat your previous answer word for word"。
  - 结果：复述轮输出 670 字符，**不是**被取消答案的逐字复制（开头不同、7 点压缩为 5 点、压缩冲程方向写反、省略 combustion/cooling 章节）；24 个候选独特词仅 10 个重叠，且全部是"内燃机"话题必备词，用户问题本身就在历史中，模型可凭问题重新作答。
- **E2（独特内容故事版，无污染）**：用户要求讲一个"企鹅 Balthazar 在京都开爵士书店"的原创故事 → 助手故事生成完毕（文本流结束，音频仍在播放，914 字符，7 个音频块）时 `response.cancel` → 同样要求逐字复述。
  - 结果：复述输出 913 字符，**与被取消文本逐字一致**——40/40 独特词全中，共享 4-gram 157/157、5-gram 156/156，包括所有原创情节细节（Emporium、vinyl records、twinkle in his eye、tune on his beak 等）。

### 4.2 结论

1. **`response.cancel` 不保证删除已生成的助手内容：被取消的消息可以逐字保留在服务端会话历史中（E2 已确证）。** P0 风险真实存在。
2. 两次实验差异的机理假设（与事件日志一致，S14-1C 可再复核）：
   - **取消发生在文本生成已结束、仅音频播放中** → 助手 item 已写入历史 → 逐字可复述（E2）；
   - **取消发生在文本仍在生成中** → 未完成的部分 item 似乎不写入历史 → 模型凭用户问题重新作答（E）。
3. 协议中**没有**任何 `conversation.item.delete` / `truncate` 事件；仅有 `input_audio_buffer.clear`（清未提交输入）、`response.cancel`（取消生成）、`conversation.item.create`（新增 item）。会话历史只存在于本次 WebSocket 生命周期内。

### 4.3 产品化强制对策（写入 S14-2 设计）

barge-in 后必须做**历史对账（history reconciliation）**，且不依赖猜测服务端状态：

1. 检测到用户重新开口：立即停止本地播放，记录播放游标 `played_char_end`，发送 `response.cancel`，忽略旧 `response_id` 的所有后续 delta；
2. 用户新轮次收音期间，**关闭旧 WebSocket、新建连接**；
3. 通过 `conversation.item.create` 重放客户端裁剪后的历史：系统指令 + 既往 item + 被打断助手消息**仅保留已播前缀** + 用户新轮次（音频 item 重放能力待 1B 验证）；
4. 新连接上 `response.create`。重连 ~200–300ms，与用户自然说话时间重叠，不增加可感知延迟。
- 备选（若 1B 证明音频 item 无法重放）：通话全程改为「每轮一条连接」，或仅重放文本上下文 + 用户新音频。

## 5. Server VAD 实测

| 变体 | 打包方式 | 结果 |
|---|---|---|
| F1 | 200ms 块、每块独立 RIFF 头，发完即止 | speech_started 有；无 speech_stopped/committed；11s 后中文追问"喂，您还在吗？" |
| F2 | 首块 RIFF + 其后裸 PCM | 同上（裸 PCM 路径证伪） |
| F3 | 100ms 完整 WAV、100ms 实时节拍，发完即止 | 同上 |
| **F4** | **2048 样本（128ms）完整 WAV 帧持续发送，内容后再发 ~3s 静音帧** | **speech_started → speech_stopped → committed → 自动 response，全程正常** |

- 正确姿势（与官方前端 `realtimeChat.ts` 的 ScriptProcessor 实现一致）：
  1. 麦克风音频按 **2048 样本（16kHz 下 128ms）** 切帧，**每一帧（含静音）都包装成完整 WAV** 持续 append；
  2. 用户停说后，服务端需继续收到**尾部连续静音（官方 VAD 参数 RedemptionFrames=8 ≈ 768ms）**才判定 `speech_stopped` 并自动 commit、自动创建 response；
  3. 只发"有效语音、发完即停"必然失败——服务端永远等不到句尾。
- Server VAD 模式下**不需要**客户端发 commit/response.create。
- 官方 VAD 默认参数：positive 0.85 / negative 0.35 / RedemptionFrames 8 / MinSpeechFrames 3 / FrameSamples 1536（96ms）。

## 6. 打断/取消时序

- `response.cancel` → `response.cancelled` / `response.audio.done` / `response.output_item.done` / `response.done`：**99–123ms** 收敛。
- 打断闭环（协议无 `interrupt_response`，由客户端组合实现）：
  `input_audio_buffer.speech_started` → 清空本地未播放队列 → `response.cancel` → 按 response_id 过滤旧 delta → 等旧 response 收敛 → 接受新轮。
- 打断→静音、打断→重新可录的真机 p50/p95 留 S14-1C 测量（<500ms 仅适用于这两个口径）。

## 7. 已证伪路径

1. **`beta_fields` 拍平到 session 顶层**：两次实测均在 ~130ms 后返回 error `downstream_reconnect_exceeded`「下游重连次数超限（3/3），连接关闭」；官方前端报文确认为嵌套结构。
2. **裸 PCM 追加**（无 RIFF 头）：Server VAD 不识别。
3. **只发语音内容、不持续发静音帧**：Server VAD 无法判定句尾。
4. **JWT query token 鉴权**：非正式支持路径，弃用。

## 8. 移交 S14-1B / S14-1C 的必验清单

**S14-1B（主进程中继）**
- [ ] 主进程持有 Key（safeStorage），绝不下发 renderer；
- [ ] renderer ↔ main 走 MessagePort + 可转移 ArrayBuffer，禁止音频块走 JSON IPC；
- [ ] host allowlist、消息大小限制、发送队列上限、`bufferedAmount` 背压；
- [ ] 日志禁记 Authorization、完整 URL、音频 base64；
- [ ] **验证 `conversation.item.create` 能否重放 input_audio 消息项（§4.3 对账方案的前提）**；
- [ ] 断线重连与重连后历史重放。

**S14-1C（真机裁决）**
- [ ] 真机全链路：Client VAD 与 Server VAD 各跑通多轮教学对话；
- [ ] barge-in 后按 §4.3 对账，逐轮核对"服务端历史 == 用户实际听到的内容"；
- [ ] 打断→静音/可录 p50/p95；弱网（丢包/抖动）表现；
- [ ] 30 分钟连续通话稳定性、内存增长、无音频泄漏；
- [ ] 用户转写稳定性：若服务端输入转写不稳定，本地留存音频切片，结束用 Whisper 批量转写后再做复盘。

## 9. 成本快照

- glm-realtime-flash：音频 0.18 元/分钟。本探针全部轮次（含十余次连接、约数分钟音频）消耗约 1 元量级；充值 10 元足够完成 1B/1C。

---

## 裁决建议

- **S14-1A 封板通过**：协议形态、音频格式、Server VAD 姿势、打断时序全部探明；P0 风险确证并给出确定性对账方案。
- 下一步进入 **S14-1B 主进程中继**；1B/1C 全部过闸后方可批准 S14-2 产品化与 migration v16。
