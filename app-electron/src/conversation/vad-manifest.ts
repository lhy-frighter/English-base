// Silero VAD 随包资产可信清单：字节数 + SHA256 预置，运行时加载前逐文件校验。
// 资产由 vite copy-vad 插件从 vendor/silero-vad 拷到 dist/vad（模型+worklet），
// ort 运行时拷到 dist/vad/ort。模型/worklet 不经过模型商店下载（随应用分发）。

export interface VadAssetSpec {
  path: string; // 相对 dist/vad 的路径
  bytes: number;
  sha256: string;
}

export const VAD_ASSET_MANIFEST: VadAssetSpec[] = [
  {
    path: "silero_vad_v5.onnx",
    bytes: 2327524,
    sha256: "2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f",
  },
  {
    path: "vad.worklet.bundle.min.js",
    bytes: 2480,
    sha256: "8a48fdc7429948a2fde3d29a84bb1a64c1f67b4ba578ccaa7548b7f989f06a74",
  },
];

export const VAD_MODEL = "v5" as const;
