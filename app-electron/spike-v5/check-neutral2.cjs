"use strict";
const os = require("node:os"), path = require("node:path"), fs = require("node:fs");
const { extractText } = require("../import-tools.cjs");
const { Core } = require("../core.cjs");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v5-neu2-"));
  const core = new Core(dir);
  const { text } = await extractText(path.join(__dirname, "..", "test-fixtures", "pdf", "attention.pdf"));
  const i = text.indexOf("llion@");
  console.log("RAW SEG:", JSON.stringify(text.slice(i - 60, i + 120)));
  // 找 miss token 中含 llion/lukasz 的
  for (const t of core.annotate(text)) {
    if (t.label === "miss" && /llion|lukasz|xception|łukasz/i.test(t.text)) {
      console.log("MISS:", JSON.stringify(t.text), "ctx:", JSON.stringify(text.slice(Math.max(0, t.start - 40), t.start + t.text.length + 40).replace(/\n/g, "⏎")));
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
})();
