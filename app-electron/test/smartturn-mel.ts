// Smart Turn mel 移植正确性：50 条冻结样本 TS 输出 vs Python .feat 逐元素对比
// .feat 是 Python 参考实现导出的派生数据（13MB），根 .gitignore 明确排除，
// 所以干净检出（CI、本机新克隆）上必然缺失——按 pdf-e2e 的同一约定：缺夹具则跳过，不算失败。
// 想要这道防线在本地生效，跑一次 spike-v8 的导出脚本重建 smartturn-feats/ 即可。
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { smartTurnMel } from "../src/conversation/smartturn-mel.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "spike-v8");
const meta = JSON.parse(readFileSync(join(root, "smartturn-meta.json"), "utf8"));

if (!existsSync(join(root, "smartturn-feats", meta[0].file.replace(".f32", ".feat")))) {
  console.log("SKIP mel port（缺少 spike-v8/smartturn-feats Python 参考夹具）");
  process.exit(0);
}

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
console.log(`mel port: ${pass}/${meta.length} clips within 1e-3, global max err=${globalMax.toExponential(3)}`);
if (fail) process.exit(1);
