// S15-1 语法分析纯逻辑测试：extractJson / locateQuote / normalize / fnv + 60 句冻结集结构。
import { readFileSync } from "node:fs";
import {
  fnv, extractJson, locateQuote, normalize, normalizeType,
} from "../src/conversation/grammar-normalize.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.log("FAIL", name); }
}
function eq(name: string, a: unknown, b: unknown) {
  check(name + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));
}

// —— extractJson ——
{
  const o = extractJson('{"a":1,"b":[2,3]}');
  eq("extract plain", (o as { a: number }).a, 1);

  const f = extractJson('```json\n{"a":2}\n```');
  eq("extract fenced", (f as { a: number }).a, 2);

  const p = extractJson('Here is the result you asked for:\n{"ok":true,"n":7}\nThanks.');
  eq("extract embedded", (p as { n: number }).n, 7);

  let threw = false;
  try { extractJson("no json here at all"); } catch { threw = true; }
  check("extract malformed throws", threw);

  let threw2 = false;
  try { extractJson('{"a":1, bad}'); } catch { threw2 = true; }
  check("extract invalid json throws", threw2);
}

// —— locateQuote ——
{
  const orig = "the cat sat on the mat with the dog";
  check("locate 1st", locateQuote(orig, "the", 1));
  check("locate 3rd", locateQuote(orig, "the", 3));
  check("locate 4th missing", !locateQuote(orig, "the", 4));
  check("locate absent quote", !locateQuote(orig, "elephant", 1));
  check("locate empty quote", !locateQuote(orig, "", 1));
}

// —— normalizeType ——
{
  eq("type agreement", normalizeType("subject-verb agreement"), "agreement");
  eq("type tense", normalizeType("Verb Tense"), "tense");
  eq("type unknown", normalizeType("weird-thing"), "other");
}

// —— fnv ——
{
  eq("fnv deterministic", fnv("hello world"), fnv("hello world"));
  check("fnv differs", fnv("hello") !== fnv("world"));
}

// —— normalize: 正常保留 ——
{
  const original = "Yesterday I go to the library.";
  const raw = {
    score_est: 60,
    rewritten: "Yesterday I went to the library.",
    native_tip: "",
    errors: [{
      quote: "I go", occurrence: 1, type: "tense",
      correct: "I went", rule_zh: "描述过去发生的事要用一般过去时。", severity: "error",
    }],
  };
  const r = normalize(raw, original);
  eq("normal kept problem", r.problem, null);
  eq("normal kept count", r.analysis?.errors.length, 1);
  eq("normal field quote", r.analysis?.errors[0].quote, "I go");
  eq("normal field correct", r.analysis?.errors[0].correct, "I went");
  eq("normal field type", r.analysis?.errors[0].type, "tense");
  eq("normal score", r.analysis?.score_est, 60);
}

// —— normalize: 不可定位 quote 丢弃 ——
{
  const original = "I like coffee.";
  const raw = {
    score_est: 50, rewritten: "", native_tip: "",
    errors: [{
      quote: "I likes tea", occurrence: 1, type: "agreement",
      correct: "I like tea", rule_zh: "主谓一致。", severity: "error",
    }],
  };
  const r = normalize(raw, original);
  eq("unlocatable dropped count", r.analysis?.dropped, 1);
  eq("unlocatable errors empty", r.analysis?.errors.length, 0);
  eq("unlocatable problem", r.problem, "all_errors_dropped");
}

// —— normalize: occurrence 回退到 1 ——
{
  const original = "I go home.";
  const raw = {
    score_est: 55, rewritten: "I went home.", native_tip: "",
    errors: [{
      quote: "I go", occurrence: 5, type: "tense",
      correct: "I went", rule_zh: "过去时。", severity: "error",
    }],
  };
  const r = normalize(raw, original);
  eq("occurrence fallback kept", r.analysis?.errors.length, 1);
  eq("occurrence fallback value", r.analysis?.errors[0].occurrence, 1);
}

// —— normalize: 重复去重 ——
{
  const original = "I go and I go again.";
  const raw = {
    score_est: 50, rewritten: "", native_tip: "",
    errors: [
      { quote: "I go", occurrence: 1, type: "tense", correct: "I went", rule_zh: "过去时。", severity: "error" },
      { quote: "I go", occurrence: 1, type: "tense", correct: "I went", rule_zh: "重复条目。", severity: "error" },
    ],
  };
  const r = normalize(raw, original);
  eq("dedup count", r.analysis?.errors.length, 1);
}

// —— normalize: 缺字段丢弃 ——
{
  const original = "I go home.";
  const raw = {
    score_est: 50, rewritten: "", native_tip: "",
    errors: [
      { quote: "I go", occurrence: 1, type: "tense", correct: "", rule_zh: "缺 correct。", severity: "error" },
      { quote: "I go", occurrence: 1, type: "tense", correct: "I went", rule_zh: "保留。", severity: "error" },
    ],
  };
  const r = normalize(raw, original);
  eq("missing field dropped", r.analysis?.dropped, 1);
  eq("missing field kept", r.analysis?.errors.length, 1);
}

// —— normalize: score 钳制 ——
{
  const original = "Correct sentence here.";
  const rHi = normalize({ score_est: 150, rewritten: "", native_tip: "", errors: [] }, original);
  eq("score clamp hi", rHi.analysis?.score_est, 100);
  const rLo = normalize({ score_est: -8, rewritten: "", native_tip: "", errors: [] }, original);
  eq("score clamp lo", rLo.analysis?.score_est, 0);
}

// —— normalize: 正确句零错误 ——
{
  const original = "The committee has reached a decision.";
  const r = normalize({ score_est: 100, rewritten: "", native_tip: "", errors: [] }, original);
  eq("correct sentence problem", r.problem, null);
  eq("correct sentence errors", r.analysis?.errors.length, 0);
}

// —— normalize: errors 非数组 / 非对象 ——
{
  eq("errors not array", normalize({ errors: "nope" }, "x").problem, "errors_not_array");
  eq("root not object", normalize(null, "x").problem, "not_object");
}

// —— 60 句冻结集结构 ——
{
  const fx = JSON.parse(readFileSync(
    new URL("./fixtures/grammar-frozen-60.json", import.meta.url), "utf8",
  )) as {
    categories: Record<string, number>;
    items: { id: number; cat: string; expect: number | null; text: string }[];
  };
  eq("frozen size", fx.items.length, 60);
  const ids = new Set(fx.items.map((i) => i.id));
  eq("frozen unique ids", ids.size, 60);
  check("frozen non-empty text", fx.items.every((i) => i.text.trim().length > 0));
  check("frozen correct expect 0",
    fx.items.filter((i) => i.cat === "correct").every((i) => i.expect === 0));
  for (const [cat, n] of Object.entries(fx.categories)) {
    eq("frozen category " + cat, fx.items.filter((i) => i.cat === cat).length, n);
  }
}

console.log(`grammar-normalize: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
