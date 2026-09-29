// HeroCanvas — 今日页 hero 的 WebGL 流场背景（DESIGN.md v2：唯一 WebGL 焦点）
// 原生 WebGL，无 three.js 依赖；reduced-motion / 页面隐藏 / 语音任务激活 时暂停；失败静默降级（hero 自带 CSS 渐变兜底）。
import { useEffect, useRef } from "react";

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

// 极简 fbm 流场：蓝底 + 亮流带 + 颗粒（呼应 hero 蓝板）
const FRAG = `precision mediump float;
uniform vec2 u_res;
uniform float u_time;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 q = gl_FragCoord.xy / u_res.y;
  float t = u_time * 0.06;
  // 流场扰动的亮带
  float f = fbm(q * 2.2 + vec2(t, -t * 0.6));
  float band = smoothstep(0.42, 0.5, abs(fract(f * 2.0 + uv.x * 0.6 - t + uv.y * 0.7) - 0.5));
  vec3 deep = vec3(0.10, 0.28, 0.92);   // #1a48eb 邻近
  vec3 mid  = vec3(0.30, 0.52, 1.0);
  vec3 lite = vec3(0.55, 0.72, 1.0);
  vec3 col = mix(deep, mid, uv.x * 0.7 + f * 0.5);
  col = mix(col, lite, band * (0.30 + 0.30 * (1.0 - uv.y)));
  // 右上高光弧
  col += vec3(0.25) * pow(max(0.0, 1.0 - distance(uv, vec2(0.92, 1.05))), 2.2) * 0.55;
  // 颗粒
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
}`;

export function HeroCanvas({ paused = false }: { paused?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return; // 降级：hero 的 CSS 渐变直接可见
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src); gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let running = false;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr; cv.height = h * dpr;
        gl.viewport(0, 0, cv.width, cv.height);
        gl.uniform2f(uRes, cv.width, cv.height);
      }
    };
    const frame = (t: number) => {
      if (!running) return;
      resize();
      gl.uniform1f(uTime, t / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!running && !reduced && !paused && !document.hidden) { running = true; raf = requestAnimationFrame(frame); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    const onVis = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", onVis);
    const watch = setInterval(() => { (paused ? stop : start)(); }, 1200); // 语音任务激活时由 paused 驱动暂停
    return () => {
      stop();
      clearInterval(watch);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onVis);
    };
  }, [paused]);
  return <canvas className="hero-canvas" ref={ref} aria-hidden />;
}
