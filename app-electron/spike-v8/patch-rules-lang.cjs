const fs = require("node:fs");
const ep = "D:/vibe coding/英语学习/app-electron/src/call/call-engine.ts";
let e = fs.readFileSync(ep, "utf8");

const oldRules = `    "- If the learner's message contains ANY Chinese (even one Chinese word mixed into English), you MUST first reply in 简体中文: briefly explain the natural English way to say it, then give the full English sentence, then continue in English. Never answer a Chinese question only in English.",
    "- When you notice a grammar, tense, or word-form error (e.g. 'Yesterday I go'), briefly correct it in one line: say 'Say: <corrected sentence>', then continue naturally. You may explain the rule in Chinese. Do not give long lectures.",`;

const newRules = `    "- Language trigger is strictly based on the learner's actual characters: if the message contains NO Chinese characters (汉字), you MUST reply entirely in English. Never reply in Chinese to an all-English message.",
    "- ONLY IF the learner's message contains Chinese characters (including one Chinese word mixed into English): first briefly explain in 简体中文 how to say it naturally in English, then give the full English sentence, then continue in English.",
    "- When you notice a grammar, tense, or word-form error in an English message (e.g. 'Yesterday I go'), correct it in one English line: 'Say: <corrected sentence>', then continue naturally. Use Chinese to explain grammar ONLY when the learner's message contained Chinese. No long lectures.",`;

if (!e.includes(oldRules)) { console.log("RULES NOT FOUND"); process.exit(1); }
e = e.replace(oldRules, newRules);
fs.writeFileSync(ep, e);
console.log("rules patched");
