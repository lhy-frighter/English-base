const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/main.cjs";
let s = fs.readFileSync(p, "utf8");

const anchor = `    try { core.convRecover(); } catch { /* 恢复失败不影响启动 */ }
`;
if (!s.includes(anchor)) throw new Error("convRecover anchor missing");

const smoke = `    try { core.convRecover(); } catch { /* 恢复失败不影响启动 */ }

    // V8-4 云端真机冒烟（APP_V8_CLOUD_SMOKE=1）：主进程直接验证端点/key/模型，打印流式回复后退出
    if (process.env.APP_V8_CLOUD_SMOKE === "1") {
      try {
        const consent = parseConsent(core.getSetting("cloud_consent_json", ""));
        const cipher = core.getSetting("cloud_key_cipher", "");
        if (!cipher) throw new Error("no key saved");
        if (!consent.baseUrl) throw new Error("no endpoint");
        if (!consent.model) throw new Error("no model");
        const key = safeStorage.decryptString(Buffer.from(cipher, "base64"));
        const url = consent.baseUrl.replace(/\\/+$/, "") + "/chat/completions";
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 60000);
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: \`Bearer \${key}\` },
          body: JSON.stringify({
            model: consent.model,
            messages: [
              { role: "system", content: "You are a friendly English tutor. Reply in one short sentence." },
              { role: "user", content: "Say hello and ask how my day is going." },
            ],
            stream: true,
          }),
          signal: ctrl.signal,
        });
        console.log("CLOUD_SMOKE status", resp.status);
        if (!resp.ok || !resp.body) {
          console.log("CLOUD_SMOKE body", await resp.text().catch(() => ""));
          app.exit(2);
        }
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let out = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value, { stream: true }).split("\\n")) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const d = t.slice(5).trim();
            if (d === "[DONE]") continue;
            try { out += JSON.parse(d).choices?.[0]?.delta?.content || ""; } catch { /* noop */ }
          }
        }
        clearTimeout(timer);
        console.log("CLOUD_SMOKE reply:", out);
        console.log("CLOUD_SMOKE DONE");
        app.exit(0);
      } catch (e) {
        console.log("CLOUD_SMOKE ERROR", e?.message || String(e));
        app.exit(3);
      }
    }
`;
s = s.replace(anchor, smoke);
fs.writeFileSync(p, s);
console.log("cloud smoke gate added");
