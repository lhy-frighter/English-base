const fs = require("fs");
function patch(file, old, neu, label) {
  let s = fs.readFileSync(file, "utf8");
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.replace(old, neu);
  fs.writeFileSync(file, s); console.log("patched", label);
}

// 1 App map 类型
patch(
  "D:/vibe coding/英语学习/app-electron/src/App.tsx",
  "      const map = {};",
  "      const map: Record<string, boolean> = {};",
  "app map");

// 2 ShadowPage send 类型
patch(
  "D:/vibe coding/英语学习/app-electron/src/shadow/ShadowPage.tsx",
  "  send?: { text: string; nonce: number; textId?: number; title?: string } | null;",
  "  send?: {\n" +
  "    text: string; nonce: number; textId?: number; title?: string;\n" +
  "    originKind?: string; originRef?: string;\n" +
  "  } | null;",
  "send type");

// 3 api shadowPractice 输入
patch(
  "D:/vibe coding/英语学习/app-electron/src/api.ts",
  "  shadowPractice: (p: { sentence: string; textId?: number | null; title?: string; similarity?: number }) => Promise<ShadowPracticeResult>;",
  "  shadowPractice: (p: {\n" +
  "    sentence: string; textId?: number | null; title?: string; similarity?: number;\n" +
  "    originKind?: string; originRef?: string;\n" +
  "  }) => Promise<ShadowPracticeResult>;",
  "practice input");

// 4 ConversationPage onSendShadow 类型
patch(
  "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx",
  "  onSendShadow?: (text: string) => void;",
  "  onSendShadow?: (text: string, opts?: {\n" +
  "    originKind?: string; originRef?: string;\n" +
  "    textId?: number; title?: string;\n" +
  "  }) => void;",
  "onsend type");
