"use strict";
const os = require("node:os"), path = require("node:path"), fs = require("node:fs");
const { extractText } = require("../import-tools.cjs");
const { Core } = require("../core.cjs");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v5-ctx3-"));
  const core = new Core(dir);
  for (const [file, words] of [["vae.pdf", ["tional"]], ["attention.pdf", ["sugiyama", "llion", "lukasz"]]]) {
    const { text } = await extractText(path.join(__dirname, "..", "test-fixtures", "pdf", file));
    for (const t of core.annotate(text)) {
      if (t.label === "miss" && words.includes(t.text.toLowerCase().replace(/[’'].*$/, ""))) {
        console.log(`[${file}] MISS ${JSON.stringify(t.text)} :: …${text.slice(Math.max(0, t.start - 70), t.start + t.text.length + 50).replace(/\n/g, "⏎")}…`);
      }
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
})();
