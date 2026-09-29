// Smart Turn mel 移植正确性：50 条冻结样本 TS 输出 vs Python .feat 逐元素对比
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { smartTurnMel } from "../src/conversation/smartturn-mel.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "spike-v8");
const meta = JSON.parse(readFileSync(join(root, "smartturn-meta.json"), "utf8"));

let pass = 0, fail = 0;
let globalMax = 0;
for (const m of meta) {
  const clipPath = join(root, "smartturn-clips", m.file);
  const pcm = new Float32Array(readFileSync(clipPath).buffer, readFileSync(clipPath).byteOffset, m.samples);
  const got = smartTurnMel(pcm);
  const featFile = m.file.replace(".f32", ".feat");
  const exp = new Float32Array(readFileSync(join(root, "smartturn-feats", featFile)).buffer);
  let maxErr = 0;
  for (let i = 0; i < got.length; i++) maxErr = Math.max(maxErr, Math.abs(got[i] - exp[i]));
  globalMax = Math.max(globalMax, maxErr);
  if (maxErr < 1e-3) pass++; else { fail++; console.log("FAIL", m.file, maxErr.toExponential(3)); }
}
console.log(`mel port: ${pass}/50 clips within 1e-3, global max err=${globalMax.toExponential(3)}`);
if (fail) process.exit(1);
