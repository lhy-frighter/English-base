// S11-b IPC 接线：main.cjs / preload.cjs / api.ts
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

// main.cjs
{
  const fp = path.join(root, "main.cjs");
  let s = fs.readFileSync(fp, "utf8");
  const anchor = "      todayBrief: () => core.todayBrief(),\n";
  if (!s.includes(anchor)) throw new Error("main anchor");
  if (!s.includes("recycleCandidates")) {
    s = s.replace(anchor, anchor +
      "      recycleCandidates: (p) => core.recycleCandidates(p),\n" +
      "      recycleAdd: (p) => core.recycleAdd(p),\n");
    fs.writeFileSync(fp, s, "utf8");
  }
  console.log("main ok");
}

// preload.cjs
{
  const fp = path.join(root, "preload.cjs");
  let s = fs.readFileSync(fp, "utf8");
  const anchor = '  todayBrief: () => call("todayBrief"),\n';
  if (!s.includes(anchor)) throw new Error("preload anchor");
  if (!s.includes("recycleCandidates")) {
    s = s.replace(anchor, anchor +
      '  recycleCandidates: (p) => call("recycleCandidates", p),\n' +
      '  recycleAdd: (words) => call("recycleAdd", words),\n');
    fs.writeFileSync(fp, s, "utf8");
  }
  console.log("preload ok");
}

// api.ts
{
  const fp = path.join(root, "src", "api.ts");
  let s = fs.readFileSync(fp, "utf8");
  const anchor = "  todayBrief: () => Promise<TodayBrief>;\n";
  if (!s.includes(anchor)) throw new Error("api anchor");
  if (!s.includes("recycleCandidates")) {
    const types = `export interface RecycleItem {
  lemma: string; phonetic: string; gloss: string; tag: string; frq: number;
  level: string; levelRank: number; awl: 0 | 1;
  texts: number; total: number; firstSeen: number; lastSeen: number;
  sources: { text_id: number; title: string; count: number }[];
}
export interface RecyclePage { total: number; items: RecycleItem[]; }
export interface RecycleAddResult {
  added: { lemma: string; cards: number }[];
  already: string[];
  skipped: { lemma: string; reason: string }[];
}
`;
    s = s.replace(anchor, types + anchor +
`  recycleCandidates: (p?: { minTexts?: number; limit?: number; offset?: number }) => Promise<RecyclePage>;
  recycleAdd: (words: string[]) => Promise<RecycleAddResult>;
`);
    // TodayBrief 接口补字段
    const tb = s.match(/export interface TodayBrief \{[\s\S]*?\n\}/);
    if (!tb) throw new Error("TodayBrief interface not found");
    if (!tb[0].includes("recycle_multi")) {
      const updated = tb[0].replace(/\n\}/, "  recycle_multi: number;\n  recycle_total: number;\n}");
      s = s.replace(tb[0], updated);
    }
    fs.writeFileSync(fp, s, "utf8");
  }
  console.log("api ok");
}
