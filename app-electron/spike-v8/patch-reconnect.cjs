const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/realtime-relay.cjs";
let s = fs.readFileSync(p, "utf8");

// 1) reconnect 指令改为 contextTranscript（不再依赖 item.create 重放消息）
const oldCase = [
'        case "reconnect":',
'          void this.reconnect(msg.session || {}, msg.items || [], !!msg.createAfter);',
'          break;',
].join("\n");
const newCase = [
'        case "reconnect":',
'          void this.reconnect(msg.session || {}, msg.contextTranscript || "", !!msg.createAfter);',
'          break;',
].join("\n");
if (s.indexOf(oldCase) < 0) throw new Error("case anchor not found");
s = s.replace(oldCase, newCase);

// 2) reconnect 方法签名与实现
const oldMethod = [
'  async reconnect(session, items, createAfter) {',
'    this.log("info", "reconnect: replaying " + items.length + " items");',
'    this.detachWs();',
'    await this.connect(session);',
'    for (const item of items) {',
'      const p = this.wsSendRaw({ type: "conversation.item.create", item, client_timestamp: nowTs() });',
'      await Promise.race([',
'        p.then(() => this.waitFor("conversation.item.created", ITEM_ACK_MS).catch(() => null)),',
'        new Promise((r) => setTimeout(r, ITEM_ACK_MS)),',
'      ]);',
'    }',
'    this.post({ kind: "replayed", count: items.length });',
'    if (createAfter) {',
'      await this.wsSendRaw({ type: "response.create", client_timestamp: nowTs() });',
'    }',
'  }',
].join("\n");
const newMethod = [
'  // barge-in 对账：客户端权威历史 → 裁剪后写入新连接 instructions（GLM 端点不支持消息 item 重放）',
'  buildContextInstructions(session, contextTranscript) {',
'    const base = session.instructions || "";',
'    if (!contextTranscript) return base;',
'    return [',
'      base,',
'      "",',
'      "Conversation so far (authoritative transcript; treat as context):",',
'      contextTranscript,',
'      "Continue the conversation naturally from this transcript.",',
'    ].join("\\n");',
'  }',
'',
'  async reconnect(session, contextTranscript, createAfter) {',
'    this.log("info", "reconnect with contextTranscript chars=" + contextTranscript.length);',
'    const nextSession = { ...session };',
'    nextSession.instructions = this.buildContextInstructions(session, contextTranscript);',
'    this.detachWs();',
'    await this.connect(nextSession);',
'    this.post({ kind: "replayed", contextChars: contextTranscript.length });',
'    if (createAfter) {',
'      await this.wsSendRaw({ type: "response.create", client_timestamp: nowTs() });',
'    }',
'  }',
].join("\n");
if (s.indexOf(oldMethod) < 0) throw new Error("method anchor not found");
s = s.replace(oldMethod, newMethod);

fs.writeFileSync(p, s);
console.log("reconnect patched");
