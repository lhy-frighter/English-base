const fs = require("fs");

// App.tsx
{
  const p = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
  let s = fs.readFileSync(p, "utf8");
  const oldStr = `{tab === "chat" && <ConversationPage />}`;
  if (s.indexOf(oldStr) < 0) throw new Error("App anchor missing");
  s = s.replace(oldStr, `{tab === "chat" && <ConversationPage onSendShadow={(t) => sendToShadow(t)} />}`);
  fs.writeFileSync(p, s);
  console.log("App prop added");
}

// ConversationPage
{
  const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
  let s = fs.readFileSync(p, "utf8");
  function R(oldStr, newStr, label) {
    const i = s.indexOf(oldStr);
    if (i < 0) throw new Error("NOT FOUND: " + label);
    if (s.indexOf(oldStr, i + 1) >= 0) throw new Error("NOT UNIQUE: " + label);
    s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
  }
  // find component signature
  const sigOld = "export default function ConversationPage() {";
  if (s.indexOf(sigOld) < 0) throw new Error("sig missing");
  R(sigOld,
    "export default function ConversationPage({ onSendShadow }: { onSendShadow?: (text: string) => void }) {",
    "sig");
  R(
    `        analyzing={capAnalyzing}
        autoGloss={cap?.gloss}
        onClose={() => setCap(null)}
        onWord={capWord}
      />`,
    `        analyzing={capAnalyzing}
        autoGloss={cap?.gloss}
        onSendShadow={onSendShadow}
        onClose={() => setCap(null)}
        onWord={capWord}
      />`,
    "sheet prop");
  fs.writeFileSync(p, s);
  console.log("ConversationPage prop wired");
}
