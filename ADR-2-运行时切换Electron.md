# ADR-2 · 运行时切换：Tauri/Rust → Electron/JS（2026-09-12）

## 背景

方案 v1.3 ADR-1 选定 Tauri 2 + Rust fat core（rusqlite + fsrs-rs + aho-corasick + 内嵌 axum）。
M0 spike 据此完成：Tauri 应用已构建出 NSIS 安装包（EnglishBase_0.1.0_x64-setup.exe），
Rust 核心标注管线通过全部测试。

## 触发

0 号用户机器 Windows 11 家庭版开启**智能应用控制（Smart App Control，强制模式）**，
系统级拦截一切无数字签名的 exe（CodeIntegrity 事件 3077，策略 {0283ac0f-...}）。
自建 Tauri exe 无签名 → 无法运行。绕过途径均不可行：
- "仍要运行"按钮：SAC 模式下不存在（那是 SmartScreen 的机制）
- 代码签名：EV 证书年费数千元，个人自用阶段不划算
- 关闭 SAC：单向门（关闭后无法重开，除非重置系统），用户未接受该代价

而同机的"成长合伙人"（Electron 应用）可正常运行：**智能应用控制按云端信誉放行
官方 electron.exe（海量流通），且只对二进制做签名把关，不约束 JS 脚本**。

## 决策

新增 **app-electron/** 运行时（与 app/ 的 Tauri 版并存，后者保留不删）：
- Electron 38（官方二进制，SAC 放行）+ React 19 + Vite（同一套 UI 设计，DESIGN.md 管辖）
- 核心逻辑由 Rust 移植为 **JS**：node:sqlite（内置，无原生模块）、ts-fsrs（FSRS 官方 TS 实现）
  替代 fsrs-rs、aho-corasick 换为等价的 n-gram 窗口匹配
- 导入器用纯 JS/WASM：pdfjs-dist、mammoth、tesseract.js（本地 eng 语言包）
- 启动方式仿成长合伙人：VBS → electron.exe .（签名二进制零改动，信誉放行不受损）

## 后果

** 得到 **：在这台机器上直接可跑（SAC 免签放行）；开发迭代快（无 Rust 编译）；
体积 27MB 安装包不变（词典压缩后仍是大头）。

** 放弃 **：Rust 性能（当前数据量下无感知差异）；Rust 侧已写代码休眠保留；
ADR-1 的"局域网复习端内嵌 axum"改为未来的 Electron 内 http 服务（同样可行）。

** 新约束 **：
1. **禁止引入原生 Node 模块**（better-sqlite3 等编译产物是无签名 DLL，会被 SAC 拦截）。
   需要原生能力时必须走 WASM 或官方签名解释器方案。
2. 不要重打包/改名 electron.exe（会破坏签名与信誉放行）。
3. fsrs 优化器：ts-fsrs 的参数拟合能力与 fsrs-rs 不同，拟合节奏需重新评估（默认参数先行，影响可控）。

## 状态

接受。Tauri/Rust 版（app/）作为"签名路径"长期保留；若未来购买签名证书或 SAC 策略变化，
可回归 ADR-1 架构，两版共享 DESIGN.md 与数据表结构。
