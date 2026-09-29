// ProcCover — 程序化封面：内容 hash → 确定性 canvas 2D 纹理（渐变场 + 流带 + 圆斑 + 噪点）
// DESIGN.md v2 §4：无插画资产年代的封面解法；静态、零依赖、可离线。
import { useEffect, useRef } from "react";

const PALETTES: [string, string, string][] = [
  ["#dbe7ff", "#2456f5", "#0f2c86"], // 钴蓝
  ["#ffe9d6", "#f5953d", "#b34700"], // 琥珀橙
  ["#ddf3e4", "#2fa871", "#0c5c3a"], // 林绿
  ["#fde3ec", "#e56ba0", "#96305f"], // 樱粉
  ["#e6e2ff", "#7a6ff0", "#3d3494"], // 青紫
  ["#dcf3f7", "#2ba3c4", "#0c5a70"], // 湖青
  ["#fff2cc", "#f5b83d", "#9a6a12"], // 暖金
  ["#e8e6ff", "#5b8cff", "#24356f"], // 暮蓝
];

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ProcCover({ seed, square = false, className = "" }: {
  seed: string; square?: boolean; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const W = 480, H = square ? 480 : 270;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const rand = mulberry32(hash32(seed));
    const pal = PALETTES[hash32(seed) % PALETTES.length];
    const [c0, c1, c2] = pal;

    // 底：对角渐变
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, c0); g.addColorStop(0.55, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // 柔光斑（叠两团半透明亮色）
    for (let i = 0; i < 2; i++) {
      const x = W * (0.2 + rand() * 0.6), y = H * (0.15 + rand() * 0.5), r = H * (0.35 + rand() * 0.4);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, "rgba(255,255,255,0.34)"); rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }

    // 流带：3 条贝塞尔厚线（白/深色交替，圆头）
    for (let i = 0; i < 3; i++) {
      const yBase = H * (0.2 + rand() * 0.6);
      const amp = H * (0.08 + rand() * 0.18);
      ctx.beginPath();
      ctx.moveTo(-20, yBase);
      ctx.bezierCurveTo(W * 0.3, yBase - amp, W * 0.6, yBase + amp, W + 20, yBase + (rand() - 0.5) * amp);
      ctx.lineWidth = H * (0.03 + rand() * 0.05);
      ctx.lineCap = "round";
      ctx.strokeStyle = i === 1 ? "rgba(16,24,40,0.18)" : "rgba(255,255,255,0.5)";
      ctx.stroke();
    }

    // 圆斑：4 个小圆点（白/深）
    for (let i = 0; i < 4; i++) {
      const x = W * rand(), y = H * rand(), r = 3 + rand() * 9;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.75)" : "rgba(16,24,40,0.2)";
      ctx.fill();
    }

    // 噪点：细密低透明度点阵（颗粒质感，呼应参考图的 halftone）
    ctx.fillStyle = "rgba(16,24,40,0.05)";
    const dots = 900;
    for (let i = 0; i < dots; i++) {
      ctx.fillRect(rand() * W, rand() * H, 1.4, 1.4);
    }
  }, [seed, square]);
  return (
    <span className={`proc-cover ${square ? "cover-s" : ""} ${className}`} aria-hidden>
      <canvas ref={ref} />
    </span>
  );
}
