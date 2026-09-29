// Celebrate — 一次性彩带爆发（复习完成/测评出分）；reduced-motion 时不发射。
import { useEffect, useRef } from "react";

const PALETTE = ["#2456f5", "#f5b83d", "#2fa871", "#e56ba0", "#7a6ff0", "#2ba3c4"];

export function Celebrate({ seed = "" }: { seed?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = ref.current;
    if (!cv) return;
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let h = hash32(seed || String(Date.now()));
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const W = cv.width, H = cv.height;
    const parts = Array.from({ length: 140 }, () => ({
      x: W * (0.2 + rnd() * 0.6), y: H * 0.32,
      vx: (rnd() - 0.5) * 9, vy: -(4 + rnd() * 8),
      w: 5 + rnd() * 6, h: 8 + rnd() * 6,
      rot: rnd() * Math.PI, vr: (rnd() - 0.5) * 0.3,
      c: PALETTE[Math.floor(rnd() * PALETTE.length)],
    }));
    const t0 = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const el = t - t0;
      ctx.clearRect(0, 0, W, H);
      if (el > 2600) return;
      for (const p of parts) {
        p.vy += 0.18; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0, 1 - el / 2600);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [seed]);
  return <canvas className="celebrate-host" ref={ref} aria-hidden />;
}
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
