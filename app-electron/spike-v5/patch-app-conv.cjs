const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(p, "utf8");

function mustReplace(x, y) {
  if (!s.includes(x)) { console.error("anchor missing:\n" + x); process.exit(1); }
  s = s.replace(x, y);
}

// 1) import
mustReplace(
  `import { DashPage } from "./DashPage";
import AssessPage from "./AssessPage";`,
  `import { DashPage } from "./DashPage";
import AssessPage from "./AssessPage";
import ConversationPage from "./conversation/ConversationPage";`);

// 2) tab union
mustReplace(
  `const [tab, setTab] = useState<"today" | "read" | "feed" | "review" | "shadow" | "lex" | "syl" | "exam" | "dash" | "voice" | "recycle">("today");`,
  `const [tab, setTab] = useState<"today" | "read" | "feed" | "review" | "shadow" | "lex" | "syl" | "exam" | "dash" | "voice" | "recycle" | "chat">("today");`);

// 3) nav item（跟读之后）
mustReplace(
  `          <button className={tab === "shadow" ? "nav-item active" : "nav-item"} onClick={() => setTab("shadow")}>
            <span>跟读</span>
          </button>`,
  `          <button className={tab === "shadow" ? "nav-item active" : "nav-item"} onClick={() => setTab("shadow")}>
            <span>跟读</span>
          </button>
          <button className={tab === "chat" ? "nav-item active" : "nav-item"} onClick={() => setTab("chat")}>
            <span>对话</span>
          </button>`);

// 4) page mount
mustReplace(
  `        {tab === "voice" && <VoicePage />}`,
  `        {tab === "voice" && <VoicePage />}
        {tab === "chat" && <ConversationPage />}`);

fs.writeFileSync(p, s);
console.log("App.tsx conversation wired");
