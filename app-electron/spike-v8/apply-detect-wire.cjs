const fs = require("fs");

// api.ts
{
  const p = "D:/vibe coding/英语学习/app-electron/spike-v8/patch-api-detect.cjs";
  require(p);
}

// ConversationPage：userTurn 落库后调用检测
{
  const cp = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
  let s = fs.readFileSync(cp, "utf8");
  const anchor =
    "    const userTurn = await api.convAddTurn({\n" +
    '      sessionKey: session.sessionKey, turnKey: userKey, role: "user", text, status: "user_confirmed",\n' +
    "    });\n";
  if (s.indexOf(anchor) === -1) throw new Error("conv anchor missing");
  if (s.indexOf("detectUsedAssets") === -1) {
    const add = anchor +
      "    // S13-b-1 用出证据：自然用出/纠正后用出（中文轮内部跳过，失败不阻塞）\n" +
      "    api.detectUsedAssets({ sessionKey: session.sessionKey, turnKey: userKey, text }).catch(() => {});\n";
    s = s.replace(anchor, add);
    fs.writeFileSync(cp, s);
    console.log("conversation patched");
  } else console.log("conversation already");
}
