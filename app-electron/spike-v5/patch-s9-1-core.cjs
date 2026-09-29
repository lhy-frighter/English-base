// S9-1 core 补丁（方法体从 s9-1-methods.txt 读取，避免模板字符串嵌套）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
const methods = fs.readFileSync(path.join(__dirname, "s9-1-methods.txt"), "utf8").replace(/\s+$/, "");
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("未找到锚点: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}

// 1) 构造函数回收
rep(
"    // S6：为缺少全文 CEFR 的旧 stats 补算一次（annotateAndSave 现在会写 cefr）\n    this.backfillTextCefr();\n  }",
"    // S6：为缺少全文 CEFR 的旧 stats 补算一次（annotateAndSave 现在会写 cefr）\n    this.backfillTextCefr();\n    // S9-1：启动回收——上次未正常关闭的 open 会话按遗弃处理\n    this.reapAbandonedSessions();\n  }",
"构造函数回收");

// 2) dayKey 后插方法（锚点用单引号串，反斜杠/反引号均为字面量）
const dayKeyAnchor = [
"  dayKey(ts = Date.now()) {",
"    const d = new Date(ts);",
'    const m = String(d.getMonth() + 1).padStart(2, "0");',
'    const dd = String(d.getDate()).padStart(2, "0");',
"    return `${d.getFullYear()}-${m}-${dd}`;",
"  }",
].join("\n");
if (!s.includes(dayKeyAnchor)) throw new Error("未找到锚点: dayKey");
if (!s.includes("beginSession(o = {})")) {
  s = s.replace(dayKeyAnchor, dayKeyAnchor + "\n" + methods);
  n++; console.log("patched: 会话方法");
} else console.log("skip: 会话方法");

// 3) annotateAndSave 收尾
rep(
"    for (const lem of uniq) {\n      const row = lexId.get(lem);\n      if (row) insEv.run(row.id, String(text_id), nowMs(), row.id, String(text_id));\n    }\n    return { text_id, tokens, stats };\n  }",
"    for (const lem of uniq) {\n      const row = lexId.get(lem);\n      if (row) insEv.run(row.id, String(text_id), nowMs(), row.id, String(text_id));\n    }\n    // S9-1：漏网词相遇事实 + 不可变首标覆盖率快照\n    this.recordUnknownEncounters(text_id, tokens);\n    this.recordFirstCoverage(text_id, stats);\n    return { text_id, tokens, stats };\n  }",
"标注收尾两表");

fs.writeFileSync(fp, s, "utf8");
console.log("完成", n);
