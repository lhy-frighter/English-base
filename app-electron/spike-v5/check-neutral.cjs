"use strict";
const os = require("node:os"), path = require("node:path"), fs = require("node:fs");
const { Core } = require("../core.cjs");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v5-neu-"));
  const core = new Core(dir);
  const s = "Google Brain llion@google.com aidan@cs.toronto.edu lukaszkaiser@google.com mail at http://example.com/x?a=1 www.foo.bar/baz end.";
  for (const t of core.annotate(s)) {
    if (t.label !== "punct") console.log(JSON.stringify(t.text), t.label);
  }
  // 句首大写 + 后继词也大写（作者名）
  console.log("—".repeat(30));
  const s2 = "Łukasz Kaiser spoke. Xception: Deep Learning works. Kaiser visited Berlin. Subsequently we ran it.";
  for (const t of core.annotate(s2)) {
    if (t.label !== "punct") console.log(JSON.stringify(t.text), t.label, t.sentStart ? "[sentStart]" : "");
  }
  fs.rmSync(dir, { recursive: true, force: true });
})();
