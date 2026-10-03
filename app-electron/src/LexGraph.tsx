// LexGraph — 词库星云图谱（用户提案：Obsidian 式中心词 + 同根/近义星点延展）
// canvas 2D 力导向简化布局：中心词固定，L1=同根族（AWL/exchange），L2=近义；
// 节点大小=卡片数，色相=考纲等级，红环=有遗忘；点击节点切换中心；整体轻微漂浮。
// 数据：api.relatedWords(lemma)（词典查询，含 gloss）+ api.listLexemes 已学集合由外部传入。
//
// 节流对齐 HeroCanvas（#193）：页面不可见时停帧；prefers-reduced-motion 时只按需重绘，
// 不跑常驻 rAF——漂浮是纯装饰，没动的时候没有任何东西需要逐帧更新。
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { api, type Related } from "./api";

type GNode = { _sx?: number; _sy?: number;
  word: string; gloss: string; x: number; y: number; r: number;
  layer: 0 | 1 | 2; learned: boolean; lapses: number; hue: number;
  phase: number;
};

const LEVEL_HUE: Record<string, number> = {
  zk: 210, gk: 205, cet4: 200, cet6: 222, ky: 235, ielts: 250, toefl: 262, gre: 275,
};
function hueOf(tag: string): number {
  for (const k of ["gre", "toefl", "ielts", "ky", "cet6", "cet4", "gk", "zk"]) {
    if ((" " + (tag || "") + " ").includes(" " + k + " ")) return LEVEL_HUE[k];
  }
  return 222;
}

export function LexGraph({ center, learned, onPick, height = 460 }: {
  center: { word: string; lapses: number; cards: number; tag: string } | null;
  learned: Set<string>;
  onPick: (word: string) => void;
  height?: number;
}) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const [hover, setHover] = useState<{ word: string; gloss: string; x: number; y: number } | null>(null);
  const [rel, setRel] = useState<Related | null>(null);
  // hover 与 onPick 只影响「怎么画」和「点了之后干什么」，不该触发整图重建。
  // 旧实现把它们放进了 effect 依赖：鼠标每扫过一个新词就重算布局+重建节点+重启 rAF，
  // 顺带把 t0 刷新导致漂浮动画肉眼可见地跳一下。改为 ref + 按需重绘。
  const hoverRef = useRef(hover);
  const onPickRef = useRef(onPick);
  const repaintRef = useRef<(() => void) | null>(null);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!center?.word) { setRel(null); return; }
    let alive = true;
    api.relatedWords(center.word).then((r) => { if (alive) setRel(r); }).catch(() => { if (alive) setRel(null); });
    return () => { alive = false; };
  }, [center?.word]);

  // hover 变化 → 让 canvas 补画一帧（动画模式下 rAF 本来就在跑，这里只在静止模式有意义）
  useEffect(() => {
    hoverRef.current = hover;
    repaintRef.current?.();
  }, [hover]);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // —— 布局：中心 + L1 族环 + L2 近义环 ——
    const W = cv.clientWidth || 800, H = height;
    cv.width = W * dpr; cv.height = H * dpr;
    const cx = W / 2, cy = H / 2;
    const nodes: GNode[] = [];
    if (center?.word) {
      nodes.push({ word: center.word, gloss: "", x: cx, y: cy, r: 26,
        layer: 0, learned: true, lapses: center.lapses, hue: hueOf(center.tag), phase: 0 });
      const fam = (rel?.family ?? []).slice(0, 8);
      const syn = (rel?.synonyms ?? []).slice(0, 5);
      const R1 = Math.min(W, 720) * 0.26;
      fam.forEach((f, i) => {
        const ang = (i / Math.max(1, fam.length)) * Math.PI * 2 - Math.PI / 2 + (rand(center.word) - 0.5) * 0.3;
        const x = cx + Math.cos(ang) * R1, y = cy + Math.sin(ang) * R1 * 0.82;
        nodes.push({ word: f.word, gloss: f.gloss, x, y, r: 13, layer: 1,
          learned: learned.has(f.word), lapses: 0, hue: hueOf(center.tag), phase: rand(f.word) * 6.28 });
        // L2：每个族员挂 1 个近义（有则挂）
        const s = syn[i % Math.max(1, syn.length)];
        if (s && i % 2 === 0) {
          const ang2 = ang + 0.35;
          nodes.push({ word: s.word, gloss: s.gloss, x: cx + Math.cos(ang2) * R1 * 1.55,
            y: cy + Math.sin(ang2) * R1 * 1.28, r: 9, layer: 2,
            learned: learned.has(s.word), lapses: 0, hue: hueOf(center.tag) + 18, phase: rand(s.word) * 6.28 });
        }
      });
    }
    nodesRef.current = nodes;

    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    let raf = 0, t0 = performance.now(), running = false;
    const animate = !reduced;

    const paint = (t: number) => {
      const time = (t - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      // 连线（中心→L1 实线，L1→L2 细线）
      for (const n of nodes) {
        if (n.layer === 0) continue;
        const p = nodes.find((m) => m.layer === (n.layer === 1 ? 0 : 1) &&
          Math.hypot(n.x - m.x, n.y - m.y) < Math.min(W, 720) * 0.95);
        const anchor = n.layer === 1 ? nodes[0] : (p ?? nodes[0]);
        if (!anchor || anchor === n) continue;
        const dx = n.x - anchor.x, dy = n.y - anchor.y;
        const dist = Math.hypot(dx, dy) || 1;
        const drift = reduced ? 0 : Math.sin(time * 0.8 + n.phase) * 3;
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y);
        ctx.quadraticCurveTo((anchor.x + n.x) / 2 + (dy / dist) * 14, (anchor.y + n.y) / 2 - (dx / dist) * 14,
          n.x + drift * 0.4, n.y + drift);
        ctx.strokeStyle = n.layer === 1 ? "rgba(36,86,245,0.22)" : "rgba(36,86,245,0.12)";
        ctx.lineWidth = n.layer === 1 ? 1.6 : 1;
        ctx.stroke();
      }
      // 节点
      for (const n of nodes) {
        const drift = reduced ? 0 : Math.sin(time * 0.9 + n.phase) * 2.5;
        const x = n.x, y = n.y + drift;
        n._sx = x; n._sy = y;
        if (n.layer === 0) {
          // 中心：光晕 + 双环
          const g = ctx.createRadialGradient(x, y, 0, x, y, n.r * 2.4);
          g.addColorStop(0, "rgba(36,86,245,0.32)"); g.addColorStop(1, "rgba(36,86,245,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, n.r * 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, n.r, 0, Math.PI * 2);
          ctx.fillStyle = "#2456f5"; ctx.fill();
          ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.stroke();
          if (n.lapses > 0) {
            ctx.beginPath(); ctx.arc(x, y, n.r + 4.5, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(225,29,72,0.75)"; ctx.lineWidth = 2; ctx.stroke();
          }
          ctx.fillStyle = "#fff";
          ctx.font = `700 ${Math.round(n.r * 0.42)}px Manrope, "Segoe UI", sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(n.word.length > 10 ? n.word.slice(0, 9) + "…" : n.word, x, y);
        } else {
          ctx.beginPath(); ctx.arc(x, y, n.r, 0, Math.PI * 2);
          ctx.fillStyle = n.learned ? `hsla(${n.hue}, 82%, 56%, 0.92)` : `hsla(${n.hue}, 40%, 74%, 0.55)`;
          ctx.fill();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = n.learned ? "rgba(255,255,255,0.9)" : "rgba(16,24,40,0.18)";
          ctx.stroke();
          if (hoverRef.current?.word === n.word) {
            ctx.beginPath(); ctx.arc(x, y, n.r + 3.5, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(36,86,245,0.8)"; ctx.lineWidth = 2; ctx.stroke();
          }
          ctx.fillStyle = n.learned ? "#fff" : "rgba(16,24,40,0.72)";
          ctx.font = `700 ${Math.round(n.r * 0.72)}px Manrope, "Segoe UI", sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(n.word.length > 9 ? n.word.slice(0, 8) + "…" : n.word, x, y);
        }
      }
      // 只有动画模式才续帧；reduced-motion 下由 hover 变化按需补一帧即可。
      if (running && animate) raf = requestAnimationFrame(paint);
    };

    const start = () => {
      if (running || document.hidden) return;
      running = true;
      t0 = performance.now();
      if (animate) raf = requestAnimationFrame(paint);
      else paint(t0);
    };
    const stop = () => { running = false; cancelAnimationFrame(raf); raf = 0; };
    const onVis = () => (document.hidden ? stop() : start());
    repaintRef.current = animate ? null : () => { if (running) paint(performance.now()); };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      repaintRef.current = null;
      document.removeEventListener("visibilitychange", onVis);
    };
    // learned/onPick 由调用点 useMemo/useCallback 稳定化，这里可以安全进依赖
  }, [center?.word, center?.lapses, center?.tag, rel, learned, height]);

  // hover 命中。用 offsetX/offsetY 直接拿画布内坐标，省掉每次 mousemove 的
  // getBoundingClientRect()（强制同步布局）。命中检测倒序扫，中心词垫底不参与。
  const onMove = useCallback((e: ReactMouseEvent<HTMLCanvasElement>) => {
    const cv = cvRef.current;
    const nodes = nodesRef.current;
    if (!cv || !nodes.length) return;
    const mx = e.nativeEvent.offsetX, my = e.nativeEvent.offsetY;
    let hit: GNode | undefined;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.layer === 0 || n._sx == null) continue;
      if (Math.hypot(mx - n._sx, my - (n._sy ?? 0)) <= n.r + 4) { hit = n; break; }
    }
    if (hit) {
      setHover((h) => (h?.word === hit!.word ? h : { word: hit!.word, gloss: hit!.gloss, x: hit!._sx!, y: (hit!._sy ?? 0) - hit!.r - 8 }));
      cv.style.cursor = "pointer";
    } else {
      setHover((h) => (h ? null : h));
      cv.style.cursor = "default";
    }
  }, []);
  const onClick = useCallback(() => {
    const w = hoverRef.current?.word;
    if (w) onPickRef.current(w);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <canvas
        ref={cvRef}
        style={{ width: "100%", height, display: "block" }}
        onMouseMove={onMove}
        onClick={onClick}
        onMouseLeave={() => setHover((h) => (h ? null : h))}
      />
      {hover && (
        <div className="glass-strong" style={{
          position: "absolute", left: hover.x, top: Math.max(4, hover.y - 46),
          transform: "translateX(-50%)", padding: "6px 12px", pointerEvents: "none",
          fontSize: 12, color: "var(--ink)", whiteSpace: "nowrap",
        }}>
          <b>{hover.word}</b>{hover.gloss ? ` — ${hover.gloss}` : ""}
        </div>
      )}
      {!center?.word && (
        <div className="muted" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          暂无中心词
        </div>
      )}
    </div>
  );
}
function rand(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
