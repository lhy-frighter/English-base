# Skill: ui-design-flow（桌面/本地应用的 UI 全量设计与优化流程）

---
name: ui-design-flow
description: 为已有桌面/本地应用（Electron 等）做 UI 全量重设计或优化的完整流程。覆盖：访谈决策 → 参考拆解 → 设计系统落盘 → 主题层实现 → 新组件 → 截图验收 → 打包分发。当用户要求"美化 UI/重设计界面/优化视觉/换风格/做主题"或想给应用打安装包分发时使用。
---

为**已运行的本地应用**做 UI 全量优化，遵循本流程。核心纪律：**一次一问访谈 → 先定系统再改页面 → 截图为验收依据 → 文档逐次编号沉淀**。

## 阶段 0 · 前置（半天内可完成）

1. **盘点页面清单**：枚举全部 tab/视图/模态/空态，数出 CSS 类分布（`grep -c "^\.前缀" styles.css`），形成现状矩阵。
2. **写 DESIGN.md**：模式定义（哪些页 Operate、哪些 Read）→ 视觉世界取材 → Tokens 表（色 6-8 个）→ 字/形/影/动规范 → 反默认自审。
3. **留痕**：设计过程沉淀到 `design-skills/` 目录；后续每轮改动在交接文档按 #序号 记录（验证数据必须真实）。

## 阶段 1 · grill-me 访谈（一次一问，选择题形式）

必须解决的 8 个决策分叉（每问 2-4 个具体选项 + 推荐）：

1. **风格关系**：全面换风格 / 保留主色只学布局组件 / 分区混合（业务区新风格 + 沉浸区旧气质）
2. **封面/视觉锚点**：程序化生成（内容 hash→canvas 纹理）/ 免费插画库 / 色块极简 / 混合
3. **WebGL 范围**：仅一处 hero / +语音页背景 / 每页焦点 / 零 WebGL 纯 2D —— 同时确认 GPU 争用方（语音识别/本地模型）
4. **字体**：拉丁字体打包+中文系统栈（推荐，~100-300KB）/ 全打包 / 纯系统栈 / 中文子集
5. **游戏化**：轻（streak+徽章+庆祝）/ 全面 / 无
6. **范围节奏**：设计系统+打样先行 / 一次全量 / 核心页先行
7. **沉浸页质感**：纸感底+玻璃件 / 深色玻璃面板 / 只换皮肤
8. **密度**：hero+区块重组 / 平铺只换肤 / 极简化

把结论写进 DESIGN.md 并标注「访谈定案」。

## 阶段 2 · 参考拆解（拿到参考图后）

按**七维度**拆解：信息架构 / 版式比例 / 字体 / 色彩 / 组件 / 动效 / 文案语气。每维标注与现状的关系（继承/改造/舍弃）。
灵感来源：Mobbin（真实产品截图）、Dribbble、产品官网 hero；组件库按需：liquid-glass-react（玻璃折射技法）、ThreeUI（Three.js 程序化组件）、shadcn/ui（基础件）、emilkowalski（动效）。

**红线**：只取布局节奏与组件语言，不复制品牌素材/文案/可识别整页组合。

## 阶段 3 · 设计系统落盘（先于一切页面改动）

1. **主题覆盖层策略**：新建 `theme.css` 加载于 `styles.css` 之后，重定义 tokens + 组件视觉 + 新类——**不重写基座**（400+ 类换肤零回归）。分区用 body data-attr 或页面类切换 tokens。
2. **Tokens**：主色/hover/浅 wash/底色/表面/墨三级/线条/语义色 + 圆角（卡/面板/胶囊/hero）+ 阴影两档。
3. **组件族**：胶囊按钮（primary/secondary/ghost/Done）、区块头（粗标题+灰副标题+查看全部）、筛选 chip（选中=黑底白字）、卡片（封面+徽章+描述+元信息）、圆形图标键、分段控制器（白色滑块跟随选中）、折叠区块（标题+摘要+chevron）。
4. **液态玻璃工具类**：`.glass/.glass-strong/.glass-dark` = backdrop blur + 半透明 + 内侧高光 + specular 高光条；**白名单硬约束**（模态/抽屉/侧栏/控制键/hero 专用；列表滚动内容、正文、语音运行页禁用）；`body[data-glass="off"]` 全局降级开关。
5. **程序化视觉**：ProcCover（内容 hash→确定性 canvas 纹理：渐变场+流带+halftone 噪点+限定色板）替代缺失的插画资产；HeroCanvas 类原生 WebGL（无 three.js）仅一处焦点，reduced-motion/页面隐藏/语音任务自动暂停。
6. **图标**：lucide 内联生成 icons.tsx（ISC 协议），Nav/按钮全用线性图标。
7. **字体**：拉丁可变字体（Manrope 24KB woff2）@font-face 打包，中文回退系统栈；数字 tabular-nums。

## 阶段 4 · 结构整合

- 侧栏：图标+文字、活跃态浅 wash、底部用户块/游戏化徽章
- 页面重组：hero 板（问候+主行动玻璃卡）+ 提醒 chips 行（有才显示）+ 按需折叠区块（FoldSection：默认收起+摘要行）
- 深层内容一律**抽屉化/模态化**（记录、设置、详情下钻），主视图保持一眼可见
- 页面切换：方向感知滑入转场 + reduced-motion 全关
- 反馈：Toast（成功/错误玻璃条）+ 确认模态（替代 window.confirm）+ 骨架屏（取代文字加载态）

## 阶段 5 · 截图验收闭环（无真实浏览器的 Electron 场景）

1. 主进程加 `APP_SHOT=1` 钩子：遍历全部 tab 自动点击截图到 data/shots/，含窄窗复检。
2. **注入脚本作用域陷阱**：executeJavaScript 的模板字符串里引用外层变量必须 `${JSON.stringify(x)}` 插值；裸 `name` 会落到 `window.name`（空字符串）——曾导致等待失效与匹配失败。
3. 逐图评审 → CSS/JSX 迭代 → 重截。每轮回归：tsc + vite build + 全量测试链。
4. 验收口径：双宽度无溢出、三态齐备（空/载/错）、键盘可达、reduced-motion、玻璃白名单合规。

## 阶段 6 · 打包分发（Electron + pnpm 项目）

1. **pnpm 布局转换**：electron-builder 不支持符号链接布局 → pnpm-workspace.yaml 写 `nodeLinker: hoisted` + `rm -rf node_modules && pnpm install`。vite 插件里硬编码的 `node_modules/.pnpm` 路径要兼容 hoisted（先探顶层再回退 .pnpm）。
2. **幽灵依赖清算**：isolated 模式曾暴露传递依赖（如 @ricky0123/vad-web），hoisted 后失联——扫源码 import，缺的直接声明进 package.json。
3. **electron-builder 配置要点**：
   - `asar: false`（保留 __dirname 相对路径行为：词典 ATTACH、tesseract langPath、data 目录）
   - `files`: dist/**、主进程 *.cjs、package.json、只读数据资源（dict.sqlite/builtins/assessment-bank/packs）
   - **排除**：user.sqlite/backups/media/models/logs/shots（用户数据与缓存第一跑自建）
   - NSIS `perMachine: false` + `allowToChangeInstallationDirectory: true` → 装到 %LOCALAPPDATA%（可写），data 目录行为与开发期完全一致，零代码改动
   - 图标：≥256px png，builder 自动转 ico
4. **镜像**：中国网络构建时 `ELECTRON_MIRROR` + `ELECTRON_BUILDER_BINARIES_MIRROR` 指 npmmirror。
5. **验证**：release/win-unpacked 直接跑 exe（冒烟秒验）再发安装包；安装后首跑会自动建 user.sqlite/种子数据。

## 常见坑

| 坑 | 症状 | 解 |
|---|---|---|
| 注入脚本 `name` 落 window.name | 等待/匹配静默失效 | 全部 `${JSON.stringify()}` 插值 |
| executeJavaScript 传 ArrayBuffer+transfer | 消息跨进程变 null | buffer 放消息体，禁 transfer |
| MessagePortMain 事件参数 | `{data}` 包装 vs 裸值 | 入口归一 |
| pnpm isolated → hoisted | 幽灵依赖失联、.pnpm 路径失效 | 声明依赖 + 路径双探测 |
| 单实例锁 vs 测试桩 | 测试 require main.cjs 即崩 | electron 桩补 requestSingleInstanceLock |
| CSS 类腐化（多轮 AI 并行编辑） | 分支丢失/重复 case | 每轮全文件核对 + node --check |
