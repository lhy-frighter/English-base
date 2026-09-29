// vendor 模块的最小类型声明（无 @types；实际产物由 vite alias 指向 vendor/phonemizer/phonemizer.js）
declare module "phonemizer" {
  export function phonemize(text: string, lang?: string): Promise<string[]>;
  export function list_voices(lang?: string): Promise<unknown>;
}

// Vite ?raw 导入：任意 .js 文件的源码字符串（pcm-worklet 内联加载用）
declare module "*.js?raw" {
  const src: string;
  export default src;
}
