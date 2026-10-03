// src/persist.ts — 数据写入留痕（#194/#201）
//
// 项目里大量 `.catch(() => {})`：写失败时既不告诉用户也不留日志，
// 排查时完全无线索。对「读」来说失败通常可忽略，对「写」来说失败意味着数据丢了。
// 这里统一收口：一律 console.error；调用方需要时再传 onFail 给用户可见反馈。
//
// 什么时候该用 toast、什么时候只用日志：
//   - 用户正在等这个结果（如改设置后保存）→ onFail 里 toast，否则他会以为已保存；
//   - 后台节拍/心跳/证据检测 → 只记日志，通话或对话中弹提示是干扰。
export function persist<T>(
  what: string,
  p: Promise<T>,
  onFail?: (e: unknown) => void,
): Promise<T | undefined> {
  return p.catch((e) => {
    console.error("[persist] " + what + " 失败", e);
    onFail?.(e);
    return undefined;
  });
}