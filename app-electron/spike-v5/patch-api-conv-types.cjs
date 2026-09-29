const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/api.ts";
let s = fs.readFileSync(p, "utf8");

const types = `
// —— V8-2b 对话会话与轮次 ——
export interface ConvSession {
  id: number; sessionKey: string; title: string;
  topic: { goal: string; cefr: string; suggestedTurns: number };
  startedAt: number; endedAt: number | null; lastActiveAt: number;
  status: "open" | "closed" | "abandoned"; activeMs: number;
  brainEngine: string; brainModelRevision: string;
  augmented: 0 | 1; cefrAtStart: string; turnsCount: number;
}
export interface ConvTurn {
  id: number; turnKey: string; sessionId: number; seq: number;
  role: "user" | "assistant"; status: string; text: string; committedText: string;
  playedCharEnd: number | null; provider: string; modelRevision: string;
  asrEngine: string; asrModel: string; edited: 0 | 1; audioRef: string | null;
  localFeedback: unknown[]; cloudFeedback: unknown[];
  augmentStatus: string; interruptedAt: number | null; errorCode: string | null; createdAt: number;
}
`;
const anchor = "export const api = (window as any).electronAPI as {";
if (!s.includes(anchor)) { console.error("types anchor missing"); process.exit(1); }
s = s.replace(anchor, types + anchor);

const methods = `  convCreate: (o: {
    goal: string; cefr: string; suggestedTurns: number; sessionKey?: string;
    brainEngine?: string; brainModelRevision?: string;
  }) => Promise<ConvSession>;
  convList: (limit?: number) => Promise<ConvSession[]>;
  convGet: (sessionKey: string) => Promise<{ session: ConvSession; turns: ConvTurn[] } | null>;
  convAddTurn: (o: {
    sessionKey: string; turnKey: string; role: "user" | "assistant";
    text?: string; status?: string; seq?: number;
    provider?: string; modelRevision?: string;
    asrEngine?: string; asrModel?: string;
  }) => Promise<ConvTurn>;
  convUpdateTurn: (o: {
    turnKey: string; status?: string; text?: string; committedText?: string;
    playedCharEnd?: number; errorCode?: string; interruptedAt?: number;
    provider?: string; modelRevision?: string; audioRef?: string;
    localFeedback?: unknown[]; cloudFeedback?: unknown[];
    augmentStatus?: string; edited?: boolean;
  }) => Promise<ConvTurn>;
  convClose: (o: { sessionKey: string; activeMs: number; status?: "closed" | "abandoned" }) => Promise<ConvSession | null>;
`;
const a2 = `  annotate: (text: string, title?: string, source?: { kind: TextSourceKind; label?: string; uri?: string; externalRef?: string }) => Promise<Annotated>;`;
if (!s.includes(a2)) { console.error("methods anchor missing"); process.exit(1); }
s = s.replace(a2, methods + a2);

fs.writeFileSync(p, s);
console.log("conversation api types added");
