// UI 文案人话化：FeedPage / ExamPage / VoicePage 去内部术语
const fs = require("fs");
function patch(fp, pairs) {
  let s = fs.readFileSync(fp, "utf8");
  for (const [oldStr, newStr, label] of pairs) {
    if (s.includes(newStr)) { console.log("skip:", label); continue; }
    if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label + " @ " + fp);
    s = s.replace(oldStr, newStr); console.log("patched:", label);
  }
  fs.writeFileSync(fp, s, "utf8");
}

patch("src/FeedPage.tsx", [
  ['i1: "i+1 推荐", easy:', 'i1: "刚好适合", easy:', "FIT 标签"],
  ['按你的已学词覆盖率排序 · 覆盖率 93–98% 为 i+1 推荐区间（可习得输入）',
   '按你的已学词覆盖率排序 · 覆盖率 93–98% 为最佳学习区间（稍有挑战、基本能读懂）',
   "好文排序说明"],
  ['篇落在你的 i+1 区间，优先读这些。', '篇落在你的最佳学习区间，优先读这些。', "i1 提示行"],
]);

patch("src/ExamPage.tsx", [
  ['进入复习队列（FSRS 调度）', '进入复习队列，到期自动提醒', "概念卡提示"],
]);

patch("src/VoicePage.tsx", [
  ['setErr("引擎初始化失败："', 'setErr("初始化失败："', "初始化错误文案"],
  ['{info && <span className="okmsg">引擎已加载：', '{info && <span className="okmsg">识别已就绪：', "就绪文案"],
  ['"初始化引擎"', '"初始化识别"', "初始化按钮"],
]);
console.log("done");
