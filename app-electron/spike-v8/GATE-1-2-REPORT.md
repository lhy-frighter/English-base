# S7b 闸门 1+2 报告：Bergamot 进 Electron 渲染 Worker（2026-09-17）

脚本：`spike-v8/gate-renderer.cjs`（隐藏 Electron，与生产同协议 app:// + COOP/COEP）；
结果：`gate-renderer-iso.json` / `gate-renderer-noiso.json`。

## 闸门 1：渲染进程 classic Web Worker 加载与内存 —— 通过

- Worker 形态：classic worker（`new Worker('./bergamot/translator-worker.js')`），`importScripts` 上游胶水；
  0.4.9 npm 胶水**已内置** `createWasmGemm()` fallback（Chromium 无 mozIntGemm 自动回退 asm），
  **spike 的 patch-gemm 路线废弃**，vendor 内为未修改的上游原始产物。
- 线程模型：wasm/胶水均无 pthread、SharedArrayBuffer 引用。两轮实测：
  - 隔离（crossOriginIsolated=true，SAB 可用）：init 220ms，首译 330ms；
  - 非隔离（SMOKE_NOISO=1，SAB 不可用）：init 217ms，首译 336ms；
  - 结论：**翻译不依赖 COOP/COEP/SAB，单线程**，比 Whisper 简单；隔离头只为 ASR 存在。
- 吞吐：12 段 793 词 2273ms ≈ **349 词/秒**（渲染真机，与 Node spike 365–530 同量级）；0 空译。
- 内存（app.getAppMetrics，Tab 进程 workingSet，两轮一致）：
  - 基线 ~90MB → 引擎+模型加载后 201MB → **首译后跳到 ~618MB → 12 段后 638–643MB 封顶**（固定高水位，非逐段泄漏）；
  - dispose + terminate 后等 5s：**回落到 103–106MB**（接近基线），证明租约释放可回收 ~530MB。
- 注：performance.memory 在该配置下恒为 1MB（无 precise-memory-info），RSS 以主进程 metrics 为准。

## 闸门 2：句对提取 —— 通过（含一条已知边界）

- 0.4.9 embind **无 getAlignments**；`getSourceSentence(i)/getTranslatedSentence(i)` 返回 `{begin,end}` **字符区间**
  （分别索引输入段与译文段），越界抛错。Worker 据此切片得到引擎自己分句的句对。
- 校验：译句区间拼回 100% 等于整段译文（tgtCover 全 true）；源句区间基本等于原文
  （仅句间空格归一差 1 字符）。
- 已知边界：引擎会合并短句——样本中 "Did it succeed?" 的译文并入上一句（该源句 tgt 为空串，
  其含义出现在上一译句末尾"成功了吗?"）。生产读法：空 tgt 的句对，选区命中时回落到上一句译文或整段译文，
  不做"自己分句再逐句翻译"的兜底（引擎分句保留上下文，更优）。

## 对生产代码的约束（已据此实现）

1. 引擎随构建拷贝：`vendor/bergamot/`（原始产物+LICENSE+NOTICE+自有 worker）→ vite 插件拷到 `dist/bergamot/`。
2. Worker 协议：唯一 id 匹配、串行 busy、fatal 重置、dispose 释放 model/service。
3. 翻译 Worker 必须与 ASR Worker 经 InferenceCoordinator 互斥（首译即 +420MB，并存会顶高内存）；
   terminate 后 RSS 可回落，闸门 3 做 ASR→翻译→ASR 真机验收。
4. pairs 存引擎句对（含空 tgt 合并标记），UI 侧做空值回落。
