// 一键送跟读接线纯逻辑单测（Node --experimental-strip-types）：
// 重复发送 nonce 唯一、译文句对可靠匹配（the/a 不误配/跨句不匹配/找不到返回 -1）、同段判定、听力按钮阻止冒泡。
import { createNonce, sameParagraph, pickPairIndex, cueSend, isChineseSelection, type Pair } from "../src/shadow/send.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name, extra ?? ""); }
}

// 1) nonce：同一句重复送也严格递增、不重复
{
  const next = createNonce();
  const a = next(), b = next(), c = next();
  check("nonce 严格递增", b === a + 1 && c === b + 1, `${a},${b},${c}`);
  const s = new Set([next(), next(), next(), next(), next()]);
  check("nonce 连续 5 次无重复", s.size === 5);
  const f1 = createNonce(), f2 = createNonce();
  check("不同 nonce 工厂互不干扰（都从 1 起）", f1() === 1 && f2() === 1);
}

// 2) 句对可靠匹配
const pairs: Pair[] = [
  ["The committee reached a decision after long debate.", "委员会经过长时间辩论后作出决定。"],
  ["A new study shows that sleep improves memory.", "一项新研究表明睡眠能改善记忆。"],
];
check("正常短语命中所在句", pickPairIndex(pairs, "reached a decision") === 0);
check("大小写/多空格归一仍命中", pickPairIndex(pairs, "  sleep   improves MEMORY ") === 1);
// 旧实现的坑：首词包含——只要选区以 the/a 开头就误中本段第一句，哪怕实际短语在第二句
check("弃首词包含：'the' 作为子串正确落在含它的第 0 句", pickPairIndex(pairs, "the committee") === 0);
check("弃首词包含：以 a 开头但短语在第 1 句，不会误绑第 0 句", pickPairIndex(pairs, "a decision") === 0 && pickPairIndex(pairs, "a new study shows") === 1);
check("任意句都不含的片段→-1（旧实现会按首词乱配）", pickPairIndex(pairs, "the elephant danced") === -1);
check("跨两句拼接（非任一句子串）→-1", pickPairIndex(pairs, "debate. A new study") === -1);
check("空选区→-1", pickPairIndex(pairs, "  ") === -1 && pickPairIndex([], "x") === -1);
// 多句命中取最短（最具体）
const overlap: Pair[] = [["I like apples.", "短"], ["I like apples and oranges too.", "长"]];
check("多命中取最短包含句", pickPairIndex(overlap, "apples") === 0);

// 3) 同段判定
check("anchor/focus 同段返回该段", sameParagraph("2", "2") === "2");
check("跨段（anchor!=focus）返回 null", sameParagraph("1", "2") === null);
check("任一为空返回 null", sameParagraph(null, "2") === null && sameParagraph("0", null) === null);

// 4) 听力 cueSend：必须 stopPropagation 且把文本送出
{
  let stopped = 0, sent = "";
  const fakeE = { stopPropagation: () => { stopped++; } };
  cueSend(fakeE, "hello world", (t) => { sent = t; });
  check("cueSend 调一次 stopPropagation", stopped === 1, stopped);
  check("cueSend 把原文送出", sent === "hello world", sent);
}

// 5) 中文/中英混合选区拒绝（任一端点落在 .zh-para 即拒）
{
  check("两端都在英文段→放行", isChineseSelection(false, false) === false);
  check("起点落在中文段→拒绝", isChineseSelection(true, false) === true);
  check("终点落在中文段（中英混合）→拒绝", isChineseSelection(false, true) === true);
  check("两端都在中文段→拒绝", isChineseSelection(true, true) === true);
}

console.log(`\n${pass} 通过 / ${fail} 失败 / shadow-send`);
process.exit(fail ? 1 : 0);
