// V8-0 数据契约：对话 Provider / 话题 / 轮次状态 / 云端同意（接口定义，不含实现；WebLLM 在 V8-1 引入）

export interface Msg {
  role: "system" | "user" | "assistant";
  content: string;
}

// 轮次状态机（与 migration v13 CHECK 对齐）
export type TurnStatus =
  | "user_draft"
  | "user_confirmed"
  | "generating"
  | "speaking"
  | "completed"
  | "interrupted"
  | "failed";

// 会话话题卡（自由对话首发五要素中的结构化部分）
export interface ConversationTopic {
  goal: string;            // 话题目标
  cefr: string;            // 难度锚点
  suggestedTurns: number;  // 建议轮数
}

// 云端增强/云端 Provider 的同意状态（默认全部关闭；显式同意、可随时撤回）
export interface CloudConsent {
  enabled: boolean;
  scope: "session" | "always";
  allowProfile: boolean;   // 学习画像
  allowHistory: boolean;   // 历史对话文本
  allowAudio: boolean;     // 录音原文
  endpoint: string;        // OpenAI 兼容端点
  model: string;
}

export const DEFAULT_CLOUD_CONSENT: CloudConsent = {
  enabled: false,
  scope: "session",
  allowProfile: false,
  allowHistory: false,
  allowAudio: false,
  endpoint: "",
  model: "",
};

// 大脑 Provider：本地（WebLLM）与云端（OpenAI 兼容）同构
export interface ChatProvider {
  kind: "local" | "cloud";
  modelId: string;
  start(systemPrompt: string): Promise<void> | void;
  stream(messages: Msg[], signal: AbortSignal): AsyncIterable<string>;
  dispose(): Promise<void> | void;
}

// 打断协议：控制信号（直达各 Worker，不排队）
export const INTERRUPT = "conversation:interrupt";

export interface InterruptEvent {
  at: number;             // 时间戳
  playedCharEnd: number;  // 原子冻结的播放游标
}
