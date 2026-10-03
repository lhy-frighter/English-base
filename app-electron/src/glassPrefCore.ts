/**
 * 液态玻璃开关的纯逻辑核（#191）
 *
 * 与 DOM / React 解耦，便于单测直接驱动。绑定层见 glassPref.ts。
 * 规则侧的对偶是 theme.css 的 `body[data-glass="off"] .glass, .glass-strong`。
 */

export const GLASS_KEY = "ui.glass";

/** 只认显式的 "off"；缺省或异常一律视为开启，避免老用户升级后被动关掉玻璃。 */
export function readGlassOn(get: (k: string) => string | null): boolean {
  try {
    return get(GLASS_KEY) !== "off";
  } catch {
    return true;
  }
}

/** 存不进去也不该阻断切换——内存态仍然生效，只是下次启动不记得。 */
export function writeGlassOn(set: (k: string, v: string) => void, on: boolean): boolean {
  try {
    set(GLASS_KEY, on ? "on" : "off");
    return true;
  } catch {
    return false;
  }
}

/** 开启时删掉属性而不是写 "on"：CSS 选择器是 [data-glass="off"]，留着 "on" 会误导下一个人。 */
export function applyGlass(doc: { body: { dataset: { [k: string]: string | undefined }; removeAttribute(name: string): void } }, on: boolean): void {
  if (on) doc.body.removeAttribute("data-glass");
  else doc.body.dataset.glass = "off";
}