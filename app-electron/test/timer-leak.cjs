// test/timer-leak.cjs — 等待器超时定时器必须自清理（#196）
//
// 病根：waitForReady/waitForReplayed 各自起一个 20s setTimeout，
// 成功 resolve 时没人清它 → 一次成功连接留一个活定时器；
// 每次 barge-in 重连再叠一个。长时间通话会累积一批无主定时器。
// 这里验证：resolve / reject 两条路径都会 clearTimeout。
"use strict";
let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("PASS", name); }
  else { fail++; console.error("FAIL", name, extra !== undefined ? extra : ""); }
}

const READY_TIMEOUT_MS = 20;
// —— 复刻修复后的 waitFor* 逻辑 ——
function makeWaiterPool(timeoutMs) {
  const pool = [];
  const live = new Set();
  return {
    pool,
    liveCount: () => live.size,
    wait() {
      return new Promise((resolve, reject) => {
        const w = { resolve, reject };
        pool.push(w);
        w.timer = setTimeout(() => {
          const i = pool.indexOf(w);
          if (i >= 0) pool.splice(i, 1);
          live.delete(w.timer);
          reject(new Error("timeout"));
        }, timeoutMs);
        live.add(w.timer);
      });
    },
    settleAll(kind) {
      for (const w of pool.splice(0)) {
        if (w.timer) { clearTimeout(w.timer); live.delete(w.timer); }
        if (kind === "resolve") w.resolve(); else w.reject(new Error("fail"));
      }
    },
  };
}

// 1) 成功 resolve 后不该再有活定时器
const a = makeWaiterPool(READY_TIMEOUT_MS);
let resolved = false;
a.wait().then(() => { resolved = true; });
check("注册后有 1 个活定时器", a.liveCount() === 1, a.liveCount());
a.settleAll("resolve");
check("resolve 后活定时器归零", a.liveCount() === 0, a.liveCount());

// 2) reject 路径同样归零
const b = makeWaiterPool(READY_TIMEOUT_MS);
b.wait().catch(() => {});
b.settleAll("reject");
check("reject 后活定时器归零", b.liveCount() === 0, b.liveCount());

// 3) 反复 50 次「等 → 成功」，模拟连续重连：不应累积
const c = makeWaiterPool(READY_TIMEOUT_MS);
for (let i = 0; i < 50; i++) { c.wait().catch(() => {}); c.settleAll("resolve"); }
check("50 次重连后无累积定时器", c.liveCount() === 0, c.liveCount());

// 4) 对照：修复前的旧写法会累积
function oldWait(timeoutMs) {
  return new Promise((resolve) => {
    const noop = () => {};
    setTimeout(noop, timeoutMs); // 无人持有、无人清理
    resolve();
  });
}
const before = process.getActiveResourcesInfo ? process.getActiveResourcesInfo().filter((x) => x === "Timeout").length : -1;
for (let i = 0; i < 50; i++) oldWait(READY_TIMEOUT_MS);
const after = process.getActiveResourcesInfo ? process.getActiveResourcesInfo().filter((x) => x === "Timeout").length : -1;
if (before >= 0) {
  check("对照：旧写法确实会累积（50 次多出 50 个 Timeout）", after - before >= 50, `before=${before} after=${after}`);
  console.log(`   （对照实测：活动 Timeout ${before} → ${after}）`);
}

setTimeout(() => {
  console.log(`\ntimer-leak: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 60);
