import { useCallback, useState } from "react";
import { GLASS_KEY, applyGlass, readGlassOn, writeGlassOn } from "./glassPrefCore";

/**
 * 液态玻璃开关的绑定层（#191）
 *
 * 背景：theme.css 里一直备着逃生门 `body[data-glass="off"] .glass, .glass-strong`
 * （关掉 backdrop-filter 并换成实底），但整个 src 从来没有写过这个属性——
 * 规则是死的。低配机器上 backdrop-filter: blur(14px) 开销大，用户却没有关闭的入口。
 *
 * 为什么用 localStorage 而不是走 IPC / user.sqlite：这是纯视觉偏好，不含学习数据，
 * 不该混进 user.sqlite（那条铁律是给学习数据定的）。grammar-engine 的语法分析缓存
 * 已经用 localStorage，模式是现成的。
 *
 * 为什么在模块顶层同步应用、不放进 useEffect：React 首次渲染发生在模块求值之后。
 * 若等到 effect 再置属性，首帧会先画出玻璃再跳成实底——低配机器上那一帧正是最卡的，
 * 等于在最该救的地方闪一下。顶层同步写，属性在首帧之前就已决定。
 */

const store = {
  get: (k: string) => localStorage.getItem(k),
  set: (k: string, v: string) => localStorage.setItem(k, v),
};

let current = readGlassOn(store.get);
if (typeof document !== "undefined") applyGlass(document, current);

export function getGlassOn(): boolean {
  return current;
}

export function setGlassOn(on: boolean): void {
  current = on;
  writeGlassOn(store.set, on);
  if (typeof document !== "undefined") applyGlass(document, on);
}

export function useGlassPref(): [boolean, () => void] {
  const [on, setOn] = useState(current);
  const toggle = useCallback(() => {
    setGlassOn(!current);
    setOn(current);
  }, []);
  return [on, toggle];
}

export { GLASS_KEY };