const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(p, "utf8");

// 1) 循环结束后不再立即清空 streaming（否则播放期间气泡只剩 …）
const old1 = `      }
      setStreaming("");
      let playedCharEnd = 0;
      let interruptedNow = false;`;
const new1 = `      }
      let playedCharEnd = 0;
      let interruptedNow = false;`;
if (!s.includes(old1)) throw new Error("clear streaming anchor missing");
s = s.replace(old1, new1);

// 2) completed/interrupted 轮替换进 UI 后再清空 streaming
const old2 = `      setTurns((prev) => prev.map((t) =>
        t.turnKey === asstKey ? asstTurn : t.turnKey === userKey ? userTurn : t));
    } catch (e) {`;
const new2 = `      setTurns((prev) => prev.map((t) =>
        t.turnKey === asstKey ? asstTurn : t.turnKey === userKey ? userTurn : t));
      setStreaming("");
    } catch (e) {`;
if (!s.includes(old2)) throw new Error("setTurns success anchor missing");
s = s.replace(old2, new2);

fs.writeFileSync(p, s);
console.log("streaming text kept during playback");
