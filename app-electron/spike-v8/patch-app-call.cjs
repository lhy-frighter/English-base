const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(p, "utf8");
const changes = [];

// 1. import
{
  const old = `import VoicePage from "./VoicePage";`;
  const neu = `import VoicePage from "./VoicePage";
import VoiceCallPage from "./VoiceCallPage";`;
  if (s.indexOf(old) === -1) throw new Error("import anchor missing");
  s = s.split(old).join(neu); changes.push("import");
}

// 2. tab union
{
  const old = `useState<"today" | "read" | "feed" | "review" | "shadow" | "lex" | "syl" | "exam" | "dash" | "voice" | "recycle" | "chat">("today")`;
  const neu = `useState<"today" | "read" | "feed" | "review" | "shadow" | "lex" | "syl" | "exam" | "dash" | "voice" | "recycle" | "chat" | "call">("today")`;
  if (s.indexOf(old) === -1) throw new Error("tab union anchor missing");
  s = s.split(old).join(neu); changes.push("tab union");
}

// 3. nav item after 对话
{
  const old = `          <button className={tab === "chat" ? "nav-item active" : "nav-item"} onClick={() => setTab("chat")}>
            <span>对话</span>
          </button>`;
  const neu = `          <button className={tab === "chat" ? "nav-item active" : "nav-item"} onClick={() => setTab("chat")}>
            <span>对话</span>
          </button>
          <button className={tab === "call" ? "nav-item active" : "nav-item"} onClick={() => setTab("call")}>
            <span>通话</span>
          </button>`;
  if (s.indexOf(old) === -1) throw new Error("nav anchor missing");
  s = s.split(old).join(neu); changes.push("nav");
}

// 4. page render
{
  const old = `        {tab === "voice" && <VoicePage />}`;
  const neu = `        {tab === "voice" && <VoicePage />}
        {tab === "call" && <VoiceCallPage />}`;
  if (s.indexOf(old) === -1) throw new Error("render anchor missing");
  s = s.split(old).join(neu); changes.push("render");
}

// 5. Today tcard（在跟读台卡片之后）
{
  const old = `                    <button className="tcard" onClick={() => setTab("shadow")}>
                      <b>跟读台</b>
                      <span>练一句影子跟读</span>
                    </button>`;
  const neu = `                    <button className="tcard" onClick={() => setTab("shadow")}>
                      <b>跟读台</b>
                      <span>练一句影子跟读</span>
                    </button>
                    <button className="tcard" onClick={() => setTab("call")}>
                      <b>语音通话</b>
                      <span>全双工语音对话，结束自动复盘（通道建设中）</span>
                    </button>`;
  if (s.indexOf(old) === -1) throw new Error("today card anchor missing");
  s = s.split(old).join(neu); changes.push("today card");
}

fs.writeFileSync(p, s);
console.log("App.tsx patched:", changes.join(", "));
