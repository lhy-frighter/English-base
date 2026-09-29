// Smart Turn v3.2 随包资产可信清单：字节数 + SHA256 预置，运行时加载前逐文件校验。
// 资产由 vite copy-smartturn 插件从 vendor/smart-turn 拷到 dist/smartturn（模型），
// ort 运行时拷到 dist/smartturn/ort。模型不经过模型商店下载（随应用分发，BSD-2-Clause）。

export interface SmartTurnAssetSpec {
  path: string; // 相对 dist/smartturn 的路径
  bytes: number;
  sha256: string;
}

export const SMARTTURN_ASSET_MANIFEST: SmartTurnAssetSpec[] = [
  {
    path: "smart-turn-v3.2-cpu.onnx",
    bytes: 8679182,
    sha256: "2bb026316b14a660486a75b1733cd3fbab8c2fd0314dc9af7be49f8cca967e4f",
  },
];

// sigmoid 阈值（spike 冻结 50 集验证：0.5 时总 acc 94%，与官方基准一致）
export const SMARTTURN_THRESHOLD = 0.5;
// Smart Turn 判定为"未说完"时的最大等待（ms），防止一直悬而不决
export const SMARTTURN_MAX_WAIT_MS = 2500;
