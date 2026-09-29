# UI 改版研究笔记：Liquid Glass × ThreeUI × SchoolAI 参考

> 2026-09-27 · 为 UI 美化改版准备。参考：SchoolAI 9 张截图（Mobbin）、liquid-glass-react（rdev，6.3k★）、ThreeUI Community（MengTo/threeui，103 个 Three.js 程序化组件）。
> 状态：研究笔记，尚未与用户访谈对齐。访谈后按结论更新 DESIGN.md。

## 1. liquid-glass-react（rdev/liquid-glass-react）

**机制**：SVG feDisplacementMap 位移滤镜 + backdrop-filter blur + 边缘高光渐变 + 鼠标跟随弹性形变（elasticity）。React 18+，纯前端，无原生依赖。

**关键 props**：`displacementScale`(折射强度) / `blurAmount`(磨砂) / `saturation` / `aberrationIntensity`(色差) / `elasticity`(液体感 0-1) / `cornerRadius` / `overLight` / `mode`(standard|polar|prominent|shader) / `mouseContainer`。

**Electron/Chromium 兼容性**：Chromium 对 backdrop-filter + SVG filter 支持完整（Safari/Firefox 才有降级问题），我们打包的 Electron 38 无兼容风险。

**引入策略（二选一，访谈定）**：
- A. 直接 `npm i liquid-glass-react` 用于少量关键组件（按钮、模态、悬浮控制条）；
- B. **提取技法自研薄层**：把 SVG 滤镜 + backdrop-filter + 高光边框封装成我们自己的 `.glass-*` 工具类/组件（可控性更好、bundle 更小、可全局换参）。

**性能红线**：位移滤镜对 GPU 有成本；**通话/ASR/WebLLM 页面（ort-web、WebGPU 已占用）禁用重滤镜**，这些页面只允许 CSS-only 玻璃（backdrop-filter blur + 半透明 + 高光边框）。列表滚动容器内不做 displacement（滚动重绘代价高）。

**适用面建议**：模态弹窗、今日页 hero 板、通话页悬浮控制条、卡片 hover 态、侧栏悬浮条、空状态插画容器。**不适用**：正文阅读区、密集表格、长列表。

## 2. ThreeUI Community（MengTo/threeui，npm `@designcodeio/threeui`）

103 个 Three.js/WebGL 程序化组件。与我们相关的候选：

| 组件 | 用途映射 | 备注 |
|---|---|---|
| GlassmorphismCta / LiquidMetalButton / LiquidFormBackground | 玻璃质感 CTA/按钮/表单底 | 与 liquid-glass 技法重叠，择一 |
| SkeuomorphicToggle(Collection) | 学习偏好/设置开关 | 拟物质感强 |
| PerformanceGauges / DiagnosticsPanel / DataField / ConnectivityGraph | **仪表盘/统计页**（对应参考图第 9 张的仪表+洞察面板） | WebGL 仪表 vs SVG 仪表需取舍 |
| ConstellationField / FlowField / ParticleNetwork / CloudField | 沉浸背景：阅读器封面、今日 hero、通话等待页 | WebGL 常驻背景有 GPU 代价 |
| AnimatedTopDock | 底部/顶部悬浮 dock（复习队列快捷条？） | |
| SparkBadge / GradientPillButton / CircleButtons | 徽章/胶囊按钮 | 轻量 |

**依赖代价**：three.js 全量 ~600KB gzip；按需引入单组件仍带 three 运行时。**GPU 争用警告**：ASR(ort-web WASM/WebGPU) 与 WebLLM 已在用 GPU，WebGL 背景必须做到：①只在无语音任务页面启用；②页面不可见/通话中暂停渲染（visibility + 页面级开关）；③提供"减弱动效"全局降级（尊重 prefers-reduced-motion，自伤降级到 CSS 渐变）。

**结论建议**：ThreeUI 组件按"每页最多一个 WebGL 焦点"原则选用，其余质感用 CSS/SVG 实现。

## 3. SchoolAI 参考拆解（9 图）

**布局语言**：白色圆角卡（r≈14-16px）+ 近白灰底；区块 = 粗标题 + 灰副标题 + 右侧 "View all (n) →"；5 列卡片网格；卡片 = 封面插画 + 标题 + 徽章（Updated 蓝底 pill）+ 描述 + 作者/用量行。

**组件语言**：全圆角胶囊按钮（蓝实心/白描边/带勾 Done）；筛选 chip 行（选中=黑底白字）；彩色圆点表（学生 outcomes 5 点）；细轨道进度条（步骤 Step1-5）；半环仪表（Class mastery 3 分）；右侧洞察文字流栏；深色学生预览聊天面板（近黑底白字 + Listen/赞/踩/复制）；表单+实时预览双栏（Space details + Previewing as a student）+ "Draft Saved" + "Save and continue →"；引导蓝板（Welcome Alex + 3 步骤白卡 + 彩带 + Completed 弹窗）；等级系统（Level 0/1 徽章+头像挂侧栏底部）。

**色彩**：亮钴蓝主按钮（≈#2563EB-2E5CE6）、近白灰底、黑字、白色卡片、插画为粉/蓝/橙柔色 duotone、落地页黄色手绘下划线强调、仪表绿/黄/蓝分段色。

**字体**：几何无衬线为主；**详情页大标题用衬线**（The 3 Whys Reflection）——与我们阅读器衬线气质有天然接点。

**可迁移到我们产品的完整组件清单**（对照 SchoolAI）：
1. 侧栏：图标+文字+活跃态浅色圆角行 + 底部用户/等级块 → 替换现有 nav-item
2. 今日页 hero 板（蓝底大圆角面板 + 欢迎语 + 步骤卡）→ 今日页主行动区
3. 区块头组件（标题+副标题+View all→）→ 书库/复习/好文各区
4. 内容卡（封面+徽章+描述+元信息行）→ 书库文章卡、好文卡（徽章可放 CEFR/来源）
5. 筛选 chip 行 → 书库筛选、复习卡型筛选
6. 仪表盘三件套（半环仪表/分段条/步骤进度）→ insights 页 + 考试统计
7. 双栏"表单+实时预览"→ 模型管理/设置页参考
8. 深色对话面板 → 通话页/对话页的 AI 面板（现状已深色，需玻璃化）
9. 等级/连续 streak 徽章 → 仪表盘游戏化位
10. Completed 彩带庆祝 → 复习完成/测评出分时刻

## 4. 待访谈决策（grill-me 问题清单）

1. 风格关系：全面 SchoolAI 化 / 藏青保留学结构 / 分区混合
2. Liquid Glass 引入策略：npm 库 vs 自研薄层；哪些表面用玻璃、哪些禁用
3. WebGL 背景：要不要（哪个页面）、降级方案
4. 插画资产：占位插画生成 / 图标 / 纯色纹理（我们无插画资产）
5. 字体：系统栈 vs 离线字体文件；衬线标题保留范围
6. 改版范围与顺序：全量 vs 核心页先行
7. 游戏化元素（等级/streak/庆祝动效）要不要
8. 深色面板（对话/通话）与浅色主体的关系
