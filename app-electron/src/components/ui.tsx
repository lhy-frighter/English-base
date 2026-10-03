// 蓝图 §2.2 共享件：Toast / 确认模态 / Modal / EmptyState / ErrorState / useAsync / Skeleton / Seg
// 约定：反馈与确认走这一套（替代 window.confirm 的 OS 对话框），样式全部在 theme.css v2.2。
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DependencyList, type ReactNode } from "react";
import { Icon } from "../icons";
import { ProcCover } from "../ProcCover";

// ————————————————————————————— store —————————————————————————————
type ToastItem = { id: number; text: string; kind: "ok" | "err" };
type ConfirmReq = {
  id: number; title: string; body?: string; danger?: boolean;
  okLabel: string; cancelLabel: string; resolve: (v: boolean) => void;
};

let toastSeq = 0;
let confirmSeq = 0;
const listeners = new Set<() => void>();
let toasts: ToastItem[] = [];
let pending: ConfirmReq | null = null;

function emit() { for (const l of listeners) l(); }

/** 右下角玻璃反馈条；同屏最多 3 条，3s 自动消退 */
export function toast(text: string, kind: "ok" | "err" = "ok") {
  const item = { id: ++toastSeq, text, kind };
  toasts = [...toasts.slice(-2), item];
  emit();
  window.setTimeout(() => dismissToast(item.id, true), 3000);
}
function dismissToast(id: number, animate: boolean) {
  if (animate) {
    leaving.add(id);
    emit();
    window.setTimeout(() => {
      leaving.delete(id);
      toasts = toasts.filter((t) => t.id !== id);
      emit();
    }, 200);
  } else {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }
}
const leaving = new Set<number>();

/** 玻璃确认框，替代 window.confirm；删除类操作必须走它（蓝图 §4） */
export function confirmDialog(opts: {
  title: string; body?: string; danger?: boolean; okLabel?: string; cancelLabel?: string;
}): Promise<boolean> {
  if (pending) pending.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending = {
      id: ++confirmSeq, title: opts.title, body: opts.body, danger: !!opts.danger,
      okLabel: opts.okLabel || "确定", cancelLabel: opts.cancelLabel || "取消", resolve,
    };
    emit();
  });
}
function settleConfirm(v: boolean) {
  const c = pending;
  pending = null;
  emit();
  c?.resolve(v);
}

function useStore() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((x) => x + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return { toasts, pending };
}

// ————————————————————————————— host —————————————————————————————
/** 挂在 App 顶层一次即可 */
export function UIHost() {
  const { toasts: list, pending: req } = useStore();

  useEffect(() => {
    if (!req) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") settleConfirm(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [req]);

  return (
    <>
      {req && (
        <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) settleConfirm(false); }}>
          <div className="modal glass-strong" role="dialog" aria-modal="true" aria-label={req.title}>
            <div className="modal-head">
              <h3>{req.title}</h3>
              <button className="gbtn" aria-label="关闭" onClick={() => settleConfirm(false)}><Icon name="X" size={16} /></button>
            </div>
            {req.body && <p className="modal-body muted">{req.body}</p>}
            <div className="modal-foot">
              <button className="ghost2" onClick={() => settleConfirm(false)}>{req.cancelLabel}</button>
              <button
                className={req.danger ? "btn-primary danger" : "btn-primary"}
                onClick={() => settleConfirm(true)}
              >{req.okLabel}</button>
            </div>
          </div>
        </div>
      )}
      <div className="toast-host">
        {list.map((t) => (
          <div key={t.id} className={"toast" + (t.kind === "err" ? " err" : "") + (leaving.has(t.id) ? " leaving" : "")}
            role="status" onClick={() => dismissToast(t.id, true)}>
            <span className="t-dot" />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ————————————————————————————— Modal —————————————————————————————
export function Modal({ title, onClose, children, footer, width }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal glass-strong" role="dialog" aria-modal="true" aria-label={title}
        style={width ? { width: `min(${width}px, 94vw)` } : undefined}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="gbtn" aria-label="关闭" onClick={onClose}><Icon name="X" size={16} /></button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ————————————————————————————— EmptyState —————————————————————————————
export function EmptyState({ seed, text, action }: {
  seed: string; text: string; action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <ProcCover seed={seed} square className="es-cover" />
      <p>{text}</p>
      {action && <div className="es-action">{action}</div>}
    </div>
  );
}

// ————————————————————————————— ErrorState —————————————————————————————
// 与 EmptyState 同构但语义相反：EmptyState 说「确实没有」，ErrorState 说「本来该有但没拿到」。
// 这两者混为一谈正是过去 .catch(() => {}) 的代价——加载失败时页面长得和「暂无数据」一模一样。
// 蓝图 §5 验收要求「空态/加载/错误三态齐备」，这个组件补的就是第三态。
export function ErrorState({ text, onRetry, retrying }: {
  text?: string; onRetry?: () => void; retrying?: boolean;
}) {
  return (
    <div className="empty-state" role="alert">
      <div className="es-err"><Icon name="Alert" size={30} /></div>
      <p>{text || "加载失败。数据都在本机，重试一下通常就好。"}</p>
      {onRetry && (
        <div className="es-action">
          <button className="btn-mini" onClick={onRetry} disabled={retrying}>
            <Icon name="Retry" size={13} />{retrying ? "重试中…" : "重试"}
          </button>
        </div>
      )}
    </div>
  );
}

// ————————————————————————————— useAsync —————————————————————————————
/** 加载三态（loading / error / data）统一收口，替掉散落的 .then().catch(() => {})。
 *  err 保留原始 error：日志与提示文案要用，吞掉就永远查不出「为什么空」。 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    fn().then(
      (d) => { if (alive) { setData(d); setLoading(false); } },
      (e) => {
        console.error("[useAsync]", e);
        if (alive) { setErr(e ?? new Error("unknown")); setLoading(false); }
      },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { data, loading, error: err != null, err, reload };
}

// ————————————————————————————— Skeleton —————————————————————————————
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton sk-card" />)}
    </div>
  );
}
export function SkeletonLines({ lines = 2 }: { lines?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton sk-line" />)}
    </div>
  );
}

// ————————————————————————————— RingGauge —————————————————————————————
/** 分数/掌握度半环（蓝图 §3.8/§3.10/§3.12 共用）：270° 弧，SVG 无 WebGL */
export function RingGauge({ pct, label, size = 132 }: { pct: number; label: string; size?: number }) {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const r = 46, C = 2 * Math.PI * r, arc = 0.75; // 270°
  return (
    <div className="gauge-wrap ring-gauge" style={{ width: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true"
        style={{ transform: "rotate(135deg)" }}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e9edf3" strokeWidth="10"
          strokeLinecap="round" strokeDasharray={`${C * arc} ${C}`} />
        {/* 0% 时不渲染填充弧：round 线帽在零长度 dash 上仍会画出一个圆点 */}
        {p > 0 && (
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--brand)" strokeWidth="10"
            strokeLinecap="round" strokeDasharray={`${C * arc * (p / 100)} ${C}`} />
        )}
      </svg>
      <div className="ring-num tabular">{Math.round(p)}<span>%</span></div>
      <div className="gauge-cap">{label}</div>
    </div>
  );
}

// ————————————————————————————— Seg —————————————————————————————
/** iOS 分段控制器：白色滑块跟随选中项（与 .nav-pill 同一测量范式） */
export function Seg<T extends string>({ options, value, onChange, ariaLabel }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; ariaLabel?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 0, width: 0 });
  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const btn = host.querySelector<HTMLButtonElement>(`button[data-v="${CSS.escape(value)}"]`);
    if (!btn) return;
    setThumb({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [value]);
  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className="seg" role="tablist" aria-label={ariaLabel} ref={hostRef}>
      <span className="seg-thumb" style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }} />
      {options.map((o) => (
        <button key={o.value} data-v={o.value} role="tab" aria-selected={o.value === value}
          className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
