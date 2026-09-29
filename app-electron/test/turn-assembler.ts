import { TurnAssembler, energyTrim } from "../src/conversation/turn-assembler.ts";

let passed = 0, failed = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) { passed++; }
  else { failed++; console.log("FAIL:", msg); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 合成段：1s 长度，中间 50ms 0.5 振幅爆发，其余静音
function makeSeg(): Float32Array {
  const a = new Float32Array(16000);
  for (let i = 7800; i < 7880; i++) a[i] = 0.5;
  return a;
}

// 1. 高概率（说完）→ 立即提交，音频为裁剪后
{
  let committed: Float32Array | null = null;
  const asm = new TurnAssembler({
    predict: async () => ({ prob: 0.9 }),
    onCommit: (p) => { committed = p; },
  });
  asm.notifyStart(1000);
  await asm.notifyEnd(3000, makeSeg());
  ok(committed !== null, "高概率应立即提交");
  const raw = makeSeg();
  const trimmed = energyTrim(raw);
  ok(committed!.length === trimmed.length, `提交应为裁剪音频 len=${committed!.length} exp=${trimmed.length}`);
  ok(asm.currentState === "idle", "提交后状态回 idle");
}

// 2. 低概率（没说完）→ awaiting，maxWait 后强制提交
{
  let committed: Float32Array | null = null;
  const states: string[] = [];
  const asm = new TurnAssembler({
    predict: async () => ({ prob: 0.1 }),
    onCommit: (p) => { committed = p; },
    onStateChange: (s) => states.push(s),
    maxWaitMs: 80,
  });
  asm.notifyStart(1000);
  await asm.notifyEnd(3000, makeSeg());
  ok(asm.currentState === "awaiting", "低概率应进 awaiting");
  ok(committed === null, "awaiting 时不应提交");
  await sleep(130);
  ok(committed !== null, "超时后应强制提交");
}

// 3. awaiting 中重新开口 → 取消定时器；第二段说完 → 提交含两段+间隔静音
{
  let committed: Float32Array | null = null;
  let call = 0;
  const asm = new TurnAssembler({
    predict: async () => ({ prob: call++ === 0 ? 0.1 : 0.9 }),
    onCommit: (p) => { committed = p; },
    maxWaitMs: 80,
  });
  asm.notifyStart(1000);
  await asm.notifyEnd(3000, makeSeg());
  ok(asm.currentState === "awaiting", "第一段后进 awaiting");
  // 用户在 30ms 后继续开口
  await sleep(30);
  asm.notifyStart(5000);
  ok(asm.currentState === "listening", "重新开口回 listening");
  await sleep(120);
  ok(committed === null, "重新开口后不应被强制提交");
  await asm.notifyEnd(7000, makeSeg());
  ok(committed !== null, "第二段说完应提交");
  // gap = 5000-(3000-1400) = 3400 → clamp(3400-240,60,3000)=3000ms → 48000 静音
  const trimmedLen = energyTrim(makeSeg()).length;
  ok(committed!.length === trimmedLen * 2 + 48000,
    `组装长度=${committed!.length} exp=${trimmedLen * 2 + 48000}`);
}

// 4. awaiting 中手动「立即发送」→ 立即提交
{
  let committed: Float32Array | null = null;
  const asm = new TurnAssembler({
    predict: async () => ({ prob: 0.1 }),
    onCommit: (p) => { committed = p; },
    maxWaitMs: 2000,
  });
  asm.notifyStart(1000);
  await asm.notifyEnd(3000, makeSeg());
  asm.commitNow();
  ok(committed !== null, "commitNow 应立即提交");
}

// 5. reset 清空状态，定时器不再触发提交
{
  let committed = false;
  const asm = new TurnAssembler({
    predict: async () => ({ prob: 0.1 }),
    onCommit: () => { committed = true; },
    maxWaitMs: 60,
  });
  asm.notifyStart(1000);
  await asm.notifyEnd(3000, makeSeg());
  asm.reset();
  ok(asm.currentState === "idle", "reset 后 idle");
  await sleep(110);
  ok(!committed, "reset 后定时器不应再提交");
}

// 6. 全静音段：energyTrim 回退原段（不返回空）
{
  const silent = new Float32Array(16000);
  const t = energyTrim(silent);
  ok(t.length === 16000, "全静音段应回退原段");
}

console.log(`turn-assembler: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
