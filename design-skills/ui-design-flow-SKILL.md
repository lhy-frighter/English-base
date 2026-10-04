---
name: ui-design-flow
description: 为已有桌面/本地应用（Electron 等）或 Web 应用做 UI 全量重设计与优化的完备流程。融合《前端 UI 设计：Code Agent 提示词模板》：九个参考 skills 分阶段调度 + 共同输入表 + 模板 A/B + 参考工程（灵感网站/GitHub 项目/参考图资产库）+ 设计系统落盘 + 程序化验收闭环（css-audit/像素diff/溢出热区对比度审计）+ 打包分发。当用户要求"美化 UI/重设计界面/优化视觉/换风格/做主题/觉得丑/太模板化/打包分发"时使用。
---

# UI 全量设计与优化流程

> **v3.0（#210）** 升级要点：
> 1. **grill-me 前置**——不再等盘点完才访谈，读完代码/截图的第一件事就是一次一问的方案拷问（见「阶段 0.6」）。上一版把它排在阶段 1，导致实际执行时常被跳过，用户反馈「没有加入方案选择拷问」。
> 2. **短视频收藏夹素材库**——新增「阶段 2.5 · 短视频素材入库」：抖音/小红书收藏的 UI 视频 → 逐帧截图 → 七维拆解 → 动效/实现形式提取，与截图参考同等待遇。
> 3. **像素取证**——当 agent 读不了截图（无图像输入模型）时，用 Python/PIL 分析像素定位「顶部被遮住」「右侧抽屉贴边」等视觉问题，而不是凭代码猜。
> 4. **实战教训入库**——把本仓库真实踩过的坑补进「常见坑表」：写死 `top:70px` 被系统标题栏吞、`.v-center` 的 `min-height:100%` 失效、hover 显形控件审计随机误报等。

为**已运行的本地应用**（Electron/Web）做 UI 全量重设计或定向优化。源自用户提供的《前端 UI 设计：Code Agent 提示词模板》，经本项目三轮实战（#181 玻璃层 / #183 五页重构 / #184 收纳密度）沉淀为完备版。核心纪律：

1. **一次一问访谈** → 先定系统再改页面；输入表填不了的写"由你提出并注明假设"，别因小空缺停住
2. **主题覆盖层策略** → 不重写基座，换肤零回归
3. **截图是唯一验收依据** → "完成"=可运行代码+实际页面+关键状态+审查修复结果，不是设计描述
4. **参考工程化** → 灵感网站/GitHub 项目/参考 skills/参考图资产库各司其职，不裸奔
5. **防腐自动化** → css-audit 进测试链、截图像素 diff 建基线、程序化审计 report-only，不靠肉眼
6. **文档逐次编号沉淀** → 每轮改动带验证数据记入交接文档

## 调度原则（先于一切阶段，源自模板）

1. **一次只有一个阶段的主导者**，其他 skill 负责约束或复核；不要求所有 skill 同时"设计一版"。
2. **用户偏好最高**：用户的产品目标、参考图、既有品牌规范和明确偏好，高于 skill 默认风格；冲突时说明取舍，别机械平均。
3. **先锁页面类型**：展示型页面（落地页/作品集）可用 taste-skill 校准审美节奏；数据看板、密集后台、多步业务流程以业务任务、信息架构和可读性优先，不套落地页套路。
4. **保留一处有记忆点的视觉表达**，其余服务阅读与操作；动效只解释状态变化，尊重 reduced-motion。
5. **"完成"的定义**：可运行代码、桌面与手机实际页面、关键状态、审查修复结果——而不是一段设计描述。

## 可用参考 skills 编排（按阶段调用，源自模板第一节）

| 环节 | 主导 skill | 具体产出与边界 |
|---|---|---|
| 读 brief、判断产品场景 | **impeccable** `init`/`shape` | 产品目的、用户、任务、约束；已有项目先读代码和设计系统，新项目用 `init` 沉淀长期产品事实 |
| 需求访谈 | **grill-me** | 一次一问选择题拷问 8 决策分叉；能查代码的不问用户 |
| 创意方向 | **frontend-design** | 从产品内容提出 2 个真正不同的方向，各用「核心概念/主视觉/字体色彩/适用理由/潜在代价」五项描述；不以"漂亮"为设计理由 |
| 落地页审美校准 | **taste-skill** | 仅营销页/作品集/展示型改版参与；数据看板与密集后台明确跳过 |
| 设计系统检索 | **ui-ux-pro-max** | 按产品类型检索布局/字体/色板/UX 模式与框架建议，整合为少量 tokens，不照搬整套推荐 |
| 实现后细节打磨 | **make-interfaces-feel-better** | 换行/图标/阴影/圆角/对齐/hover/focus/active/动效/热区；沿用项目已有 CSS 方案 |
| 两轮质量评审 | **impeccable** `critique`→`audit`/`harden`/`polish` | critique 看层级与表达；audit 查技术质量；harden 查异常状态溢出边界；polish 交付前统一；按已装版本实际命令调用 |
| 代码规范 | **web-design-guidelines** | 可访问性/响应式/交互规则审查；输出 `文件:行号 → 问题 → 修复` 并修复，不只罗列建议 |
| React 性能 | **react-best-practices** | 数据请求/bundle/渲染优化；React/Next.js 项目才按需 |
| 真实验收 | **browser-testing-with-devtools** | 运行页面/截图/键盘操作/控制台与运行时检查；无工具时如实说明未完成可视验收，不假称看过 |

## 阶段 0 · 盘点与基线

1. 枚举全部 tab/视图/模态/空态，数 CSS 类分布，形成现状矩阵。
2. 写/更新 **DESIGN.md**：模式定义（Operate 页 vs Read 页）→ 视觉世界 → Tokens 表 → 字/形/影/动 → 反默认自审。
3. **防腐基线（已工具化，本项目路径）**：
   - `test/css-audit.cjs`（挂在 package.json 测试链尾）：同文件同作用域内**规则体完全相同**的重复规则 = FAIL（纯复制粘贴腐化，删任一条计算结果不变）；规则体不同 = INFO 层叠覆写（共享组+覆写等有意层叠，report-only）；花括号不平衡 = FAIL；孤儿类 report-only（动态类/主进程注入类误报多，不作断言）。CSS 源覆盖独立 .css 文件 + 组件内联 `<style>` 块。
   - **截图像素 diff**：`APP_SHOT_BASELINE=1 APP_SHOT=1` 建 `data/shots-baseline/`；此后每次 `APP_SHOT=1` 自动与基线逐 tab 比较（nativeImage.toBitmap() BGRA 原始位图、每通道容差 12），控制台 `DIFF <tab> x.xx%`，汇总写 `shots/diff.json`；尺寸不匹配报 size-mismatch。
4. 基线截图：`APP_SHOT=1` 遍历 tab 截图（导航匹配用 startsWith；页面签名轮询防旧帧；慢页加长等待）。

## 阶段 0.5 · 共同输入表（模板第二节，访谈前填）

填不了的地方写"由你根据产品用途提出并注明假设"；真正影响产品定位的歧义再问（转 grill-me）。

| 项目 | 要点 |
|---|---|
| 项目与目标 | 一句话用途 + 可衡量目标（如"3 分钟内发现异常"） |
| 页面类型 | 落地页/作品集/Web App/BI 看板/Agent 对话页——决定 taste-skill 是否参与 |
| 用户与首要任务 | 谁在什么场景做什么，按用户决策顺序 |
| 关键内容 | 真实标题/字段/示例数字/操作入口；无真实内容标注演示数据 |
| 必须具备的功能 | 筛选/导出/空载错三态等 |
| 自己的审美 | 3 个喜欢的形容词 + 3 个明确不要的特征 |
| 参考资料 | 网址/截图/Figma；明确喜欢哪个局部、哪些不要、允许借用到什么程度 |
| 品牌与资产 | logo/品牌色/字体/图标；没有则由 agent 提议 |
| 现有技术 | 仓库路径/框架/CSS 方案/组件库/可用命令 |
| 边界与验收 | 适配设备/无障碍要求/优先级/交付路径/完成标准 |

## 阶段 0.6 · 方案选择拷问（grill-me，一次一问）

**这是 v3.0 的关键改动：grill-me 不是流程中段的访谈，而是读项目后立即执行的第一件事。**

历史教训：旧版把 grill-me 排在「阶段 1」，前面还有阶段 0/0.5，实际执行时常常被跳过或压缩成"我自己猜"，导致用户反馈「根本没有方案选择拷问」。正确做法：

1. **读完代码与截图后、动手写任何方案前**，立刻进入一次一问的 grill-me（`Skill: grill-me`）。
2. **一次只问一个问题**，每题给 2–4 个**具体选项 + 推荐项**（可用 `AskUserQuestion` 的 `preview` 字段放 ASCII 示意图）。
3. **能查代码的不问**——比如"当前有没有主题色""有几个 tab"这类自己去 grep。
4. **每个决定落盘**：用户回答即写入 `DESIGN.md` 标「访谈定案」，作为后续一切颜色/组件决策的依据。后续阶段的每个分叉点也持续用「一次一问」来确认，而不是攒到最后一次性问。

必问顺序（从 8 个决策分叉中挑最影响当前目标的 3–5 个先问，不必一次问完 8 个）：
① 风格关系（推翻/在框架内做深/只修细节）→ ② 卡片层次（阴影分层/边框辅助）→ ③ 内容密度 → ④ 半屏页面（内容居中/补内容/大留白）→ ⑤ 页面范围（只改问题页/全部/先定风格再铺开）→ ⑥ WebGL 范围 → ⑦ 沉浸页质感 → ⑧ 字体。

## 阶段 1 · 8 个决策分叉明细（grill-me 题库）

**已在阶段 0.6 前置执行**。这里列出完整题库（每个分叉一次一问、每问 2–4 个具体选项 + 推荐项；能查代码的不问）：① 风格关系 ② 封面/视觉锚点 ③ WebGL 动效范围（同时确认 GPU 争用方+降级路径）④ 字体 ⑤ 游戏化 ⑥ 范围节奏 ⑦ 沉浸页质感 ⑧ 密度。结论写入 DESIGN.md 标注「访谈定案」，作为后续一切颜色/组件决策的依据。

## 阶段 2 · 参考工程（灵感采集与拆解）

### 2.1 灵感源矩阵（按用途选用）

- **画廊/灵感**（找布局节奏与模式，不抄视觉）：Mobbin（真实产品全流程截图，最有价值：看完整用户路径而非单帧）· Landdding（落地页每日精选+社区投票）· Dribbble/Behance（单帧视觉，多为不可实现 concept）· Lapa.ninja/Landingfolio（落地页分类集）· Muzli（趋势速览）
- **组件/模板**（直接借结构）：shadcn/ui（基础件事实标准）· ThreeUI Community（103 个 Three.js 程序化组件，注意 GPU 争用）· Webflow Templates / Modulify（整页模板与区块拼装思路）· ui-ux-pro-max 内置检索
- **动效**：Motion（motion.dev，原 Framer Motion，React 动效原语）· emilkowalski 动效教程与 Vaul（抽屉手感基准）。准则：动效只解释状态变化，reduced-motion 必须降级
- **AI 生成**（快速出方向，不直接抄产物）：Modulify（prompt→Webflow 站）· v0.dev（prompt→React 组件）· VEKTR（自然语言概念设计）
- **待确认**：EPOCH / Verona 未定位到确切站点，让用户补 URL/截图后再纳入

### 2.2 GitHub 项目挖掘法

按"技法"而非"组件"挖：看到好效果 → 找实现机制 → 判断自研成本 → 决定引库或提取技法。路径：GitHub topic 搜索（如 `topic:liquid-glass`）→ star 排序 → **读 src 而非 README** → 检查许可证与平台兼容（Electron Chromium 对 backdrop-filter/SVG 滤镜完整支持；Safari/Firefox 需降级）。案例：liquid-glass-react = SVG feDisplacementMap + backdrop-filter + 高光边 + 弹性跟随，可提取为纯 CSS/薄层自研；ThreeUI = 程序化组件的目录组织与变体控制。

### 2.3 参考拆解 + 资产化

拿到参考图：**先存 `design-skills/refs/`**（命名 `YYYYMMDD-来源-关键词.png`，同参考多张加 `-01/-02` 后缀；目录 README 有完整约定）→ **再做七维拆解**（信息架构/版式比例/字体/色彩/组件/动效/文案语气），每维标注「继承/改造/舍弃」及理由，写成参考卡 `.md` 入库，已落地的改动记交接文档编号，未用的灵感留档。分清可见事实与推测，不凭一张截图编造隐藏页面。**红线**：只取布局节奏与组件语言，不复制品牌素材、文案与可识别整页组合。

### 2.4 收敛产出

写代码前输出紧凑「继承—改造—舍弃」对照表 + **5 个明确决定**：主视觉、字体层级、色彩角色、内容密度、交互节奏。写进 DESIGN.md。

## 阶段 2.5 · 短视频收藏夹素材入库（抖音/小红书/视频号）

用户收藏的 UI 短视频（动效演示、交互动线、视觉片段）与静态截图是**同级参考资产**，必须工程化入库，不能只停留在"看过一眼"。

### 2.5.1 素材来源与获取

- 用户发来**抖音口令**（如 `##DDNyHthJga9##`）时，agent 无法直接解析口令、也无法登录账号抓取收藏夹——**如实说明，不要假装抓到了**。
- 请用户提供以下任一形式，即可入库：
  1. **视频文件/录屏**（MP4/MOV）——最佳，可逐帧分析；
  2. **视频内关键帧截图**（把喜欢的效果暂停后截屏）；
  3. **收藏夹导出**（抖音「我的收藏」→ 分享到剪映/相册，或逐个转发视频文件）；
  4. **视频分享链接**（`v.douyin.com/xxx` 短链）——可尝试 WebFetch，但抖音通常要求登录，失败就退回 1/2。
- 拿到视频后：`ffmpeg -i in.mp4 -vf fps=1 out_%03d.png` 抽帧，或用 Python/PIL 提取关键帧。

### 2.5.2 入库动作（与截图同一套约定）

1. 视频存 `design-skills/refs/videos/`，抽出的关键帧存 `design-skills/refs/`（命名 `YYYYMMDD-来源-关键词-帧号.png`）。
2. 写**参考卡** `.md`：七维拆解（信息架构/版式比例/字体/色彩/组件/动效/文案语气），每维标注「继承/改造/舍弃」及理由。
3. **动效专项**：视频比截图多了时间维度，参考卡必须记录：
   - 触发条件（hover/进入视口/点击/页面切换）；
   - 时长与缓动（若可见，记大致 ms 与 ease 类型；看不到就标"推测"）；
   - reduced-motion 降级路径（有没有关闭/静态态）。
4. 可实现的**实现形式**：把动效翻译成 CSS/JS 写法（`transition`、`@keyframes`、`backdrop-filter`、`transform-origin` 等），存入参考卡"实现形式"字段；写明 GPU 争用、合成层成本（阶段 4 会用）。
5. 红线与静态参考一致：只取布局节奏与组件语言，不复制品牌素材、文案与可识别整页组合。

### 2.5.3 常见失败

| 情况 | 处理 |
|---|---|
| 只有口令，无法登录 | 明确告诉用户需要视频/截图，给可执行路径（2.5.1 的 4 种） |
| 视频不可下载（DRM/平台限制） | 请用户录屏或截关键帧，退到截图素材 |
| 动效看不清时长 | 参考卡标「推测」，不写死数值 |

## 阶段 3 · 设计系统落盘（先于一切页面改动）

1. **主题覆盖层策略**：新建 theme.css 加载于 styles.css 之后重定义 tokens + 组件视觉 + 新类——不重写基座，400+ 类换肤零回归；分区切换用 body data-attr 或页面类。
2. **Tokens**：主色/hover/wash/底/表面/墨三级/线条/语义色 + 圆角阶梯（卡/面板/胶囊/hero）+ 阴影两档。
3. **组件族**：胶囊按钮（primary/secondary/ghost/Done）、区块头（粗标题+灰副标题+查看全部）、筛选 chip（选中=黑底白字）、卡片、圆形图标键（44/68px 两档）、分段控制器（白色滑块 JS 测量跟随）、折叠区块（默认收起+摘要行）。
4. **液态玻璃**：`.glass/.glass-strong/.glass-dark` = backdrop blur + 半透明 + 内侧高光 + specular 条。**白名单硬约束**（模态/抽屉/侧栏/控制键/hero）；列表滚动内容、正文、语音运行页禁用；`body[data-glass="off"]` 全局降级。
5. **程序化视觉**：ProcCover（内容 hash→确定性 canvas 纹理）替代缺失插画；HeroCanvas 原生 WebGL（无 three.js）仅一处焦点；自动暂停（reduced-motion/页面隐藏/重任务）+ 失败降级 CSS。
6. **字体**：拉丁可变字体打包 @font-face（如 Manrope woff2 ~24KB）；中文系统栈回退；数字 tabular-nums；禁止外联字体。
7. **中文排版细则**：`body { line-break: strict }`（避头尾加强：行首禁现 。，！？；：等收尾标点）；正文行高在各 prose 容器**就地显式声明**（1.6~1.95），不靠继承层统一抬高（防紧凑行被拉高）；数字等宽逐处声明；中西文混排间距待 Chromium text-autospace 稳定后接入（已知边界）。

## 阶段 4 · 结构整合（分层/收纳/转场）

侧栏（图标+文字、活跃态浅 wash、滑动指示器）→ 页面重组（hero 板 + 提醒 chips 行（有才显示）+ 按需折叠区块，重复导航块删除）→ 深层内容抽屉化（右滑玻璃抽屉 + 遮罩）→ iOS 式全屏态（通话/媒体）→ 方向感知转场（reduced-motion 全关）→ 反馈三件（Toast 玻璃条/确认模态替代 window.confirm/骨架屏）→ hover 统一（业务区中性浅灰，沉浸区纸感加深）。

## 阶段 5 · 截图验收闭环（工具化）

1. **`APP_SHOT=1`** 每轮产出三样：
   - **截图**：12 tab + 窄窗复检（今日/词库）→ `data/shots/`
   - **像素 diff**：对比 `shots-baseline`，控制台 `DIFF <tag> x.xx%`，汇总 `shots/diff.json`（首跑用 `APP_SHOT_BASELINE=1` 建基线；此后 diff 应归零或仅含有意变更）
   - **程序化审计**：写 `shots/ui-audit.json`，三项 report-only——横向溢出（scrollWidth>clientWidth+1）、点击热区 <32px 计数（含 tag/类名/尺寸）、文本对比度 WCAG 采样（纯文本叶节点限 500；≥24px 或 ≥18.66px 粗体按 3:1，其余 4.5:1；半透明玻璃底穿透到最近不透明实底近似；结果含 cls/ratio/px/txt）。审计数据人审后决定修什么，不自动改。
2. **注入脚本两条铁律**：① 模板字面量引用外层变量必须 `${JSON.stringify(x)}` 插值（裸 `name` 会落 `window.name`，静默失效）；② **注入脚本内正则禁用 `\d` 类反斜杠转义**——模板字面量会把 `\d` 烤制成字面量 `d`，`[\d.]` 静默变 `[d.]`；颜色解析用逗号切分等无反斜杠写法。
3. 逐图评审 + 审计数据 → CSS/JSX 迭代 → 重截（diff 归零或仅含有意变更）→ 用户定向反馈（截图+一句话）→ 再迭代。
4. **验收口径**：双宽度无溢出；空/载/错三态齐备；键盘可达且 focus 圈可见；reduced-motion 降级；玻璃白名单合规；每页最多一个动效焦点；css-audit 0 FAIL。
5. 每轮回归：tsc + vite build + 全量测试链（css-audit 已挂链尾）；文档按 #序号追加（改动+验证数据+待真机复验清单）。

### 5.5 像素取证（agent 读不了截图时的兜底）

当 agent 的模型不支持图像输入（`Read` 图片返回 "Media omitted"）时，**不要停在"我看不到截图"**。用 Python/PIL 对截图做像素分析，仍能定位大量视觉问题：

1. **获取尺寸与整体布局**：`PIL.Image.open(path).size`——确认窗口/视口实际宽高（很多"被遮住"问题与视口高度有关）。
2. **找贴边/被裁**：逐列采样最右侧 30px 的像素——若出现持续深色竖线（`(55-140)` 灰度），是滚动条或抽屉边缘；若最右列是纯白 `(252,252,252)` 且高占比，说明有 `position:fixed; right:0` 面板贴边。
3. **找半透明/浮层边界**：右侧 1/3 区域按行扫描，检测白占比突变点——能定位 `.panel`、`.drawer-right` 的实际左右边界与是否贴视口底。
4. **对比两张截图**：`ImageChops.difference(a,b).getbbox()` 给出差异区域；按象限统计差异像素（右上多 → 右上角有变化元素）。
5. **定位系统标题栏高度**：顶部 0–60px 逐行采样，深色条（`(31,33,31)` 等）结束的 y 就是标题栏底——`position:fixed; top:70px` 的面板若在其下方不远处，视觉上就像"顶部被遮住"。
6. 结论写成「像素取证：xxx 位于 y≈50 起，紧贴标题栏」，作为修复依据，不要凭猜测改代码。

> 典型案例（#209）：`.panel { top:70px }` 写死，深色模式标题栏高 40px 时面板顶部视觉上被吞。像素取证发现后改为 `top: max(70px, 7vh)` 自适应，实测 1221px 视口下面板顶从 70 → 83px。

### 常见坑表（真实踩过）

| 坑 | 症状 | 解 |
|---|---|---|
| executeJavaScript 注入脚本 `name` 落 window.name | 等待/匹配静默失效 | 全部 `${JSON.stringify()}` 插值 |
| 模板字面量烤制 `\d` 转义 | 注入正则 `[\d.]` 静默变 `[d.]` | 脚本内正则不用反斜杠转义 |
| executeJavaScript 传 ArrayBuffer+transfer | 消息跨进程变 null | buffer 放消息体，禁 transfer |
| MessagePortMain 事件参数 | `{data}` 包装 vs 裸值 | 入口归一 |
| CSS 类腐化（多轮并行编辑） | 同文件重复规则/分支丢失 | css-audit 进测试链 + 截图像素 diff 基线 |
| 中文 productName | NSIS spawn UNKNOWN | productName ASCII，shortcutName 留中文 |
| 单实例锁 vs 测试桩/截图钩子 | 秒退 | 清僵尸进程 + electron 桩补 requestSingleInstanceLock |
| pnpm isolated→hoisted | 幽灵依赖失联、.pnpm 路径失效 | 声明依赖 + vite 插件双布局探测 |
| 渲染层异步吞错 | 界面永久卡加载态 | catch 里必须有可见反馈；关键 await 加超时 |
| Device Guard 拦截 shim | pnpm/npx 被禁 | npm 直装或 npx pnpm@版本 |
| **写死 `top:70px` 被系统标题栏吞**（#209） | 查词面板顶部像被遮住 | `top: max(70px, 7vh)` 自适应；像素取证定位标题栏高度 |
| **`.v-center { min-height:100% }` 失效**（#192） | 内容居中不生效，下方大片空 | 用 `min-height: calc(100dvh - 上下padding)` 锚定视口 |
| **hover 显形控件审计随机误报**（#203） | 同一代码两次运行审计结论相反 | 采样前 `sendInputEvent` 移出指针 + 让出一帧（CSS 注入 `:not(:hover)` 无效，指针驱动无解） |
| **grill-me 排在流程中段被跳过**（#210） | 用户说"没有方案选择拷问" | 读项目后立即进入一次一问（阶段 0.6），每个分叉单独问，能查代码的不问 |

## 阶段 6 · 打包分发（Electron + pnpm）

pnpm `nodeLinker: hoisted` + 幽灵依赖清算 → electron-builder：`asar: false`（保 __dirname 相对路径：词典 ATTACH/tesseract langPath/data 目录）、files 白名单含只读数据资源（词典/内置素材/题库/词包）、**排除用户数据**（user.sqlite/backups/media/models/logs/shots）、NSIS per-user 可改目录、图标 ≥256px、`signAndEditExecutable: false`（Device Guard 拦 rcedit/signtool）→ 国内镜像 `ELECTRON_MIRROR` + `ELECTRON_BUILDER_BINARIES_MIRROR` → release/win-unpacked 直接跑 exe 冒烟 → `gh release create` + `gh release upload`（资产命名 ASCII，gh 中文编码坑）。

## 阶段 7 · 分发后

用户反馈循环（截图+一句话 → 定向迭代，只改被点名的，不夹带）→ 版本发布流程（改 version → build → release → 文档编号追加）→ 数据备份（每日首启 VACUUM INTO 滚动 7 份）。

---

## 附录 A · 一句话追加定向迭代（模板第五节）

**优先只选一条，写明目标页面和截图位置，让 agent 改代码后再次截图。**

- **"太像 AI 模板"** → frontend-design + impeccable critique：指出当前页面最像模板的 3 处，依据产品内容替换；保留已清晰的业务路径
- **"太花"** → impeccable quieter/distill + make-interfaces-feel-better：装饰与动效收敛到一处重点，保持信息层级与可操作性
- **"不够有记忆点"** → impeccable bolder：首屏/主模块给一个有产品依据的视觉重点，再查手机与可访问性
- **"看板很乱"** → 先按用户决策顺序重排信息，再用 ui-ux-pro-max 查密度/表格/筛选/图表模式；不用营销页巨型标题和大面积留白
- **"细节还是粗糙"** → make-interfaces-feel-better：换行/对齐/边框/阴影/图标/焦点/热区/状态切换；列出每处修改前后差别
- **"参考图没学到位"** → 重新比较参考与当前截图，只修明确要求继承的 3 个维度；不连带复制品牌色和文案

## 附录 B · 模板 A：从零开始构造（新页面/新功能用）

```text
你是同时负责产品体验、视觉设计和前端实现的 coding agent。请直接完成一个可运行的前端，
不要停在方案或静态 mockup。

【项目】
- 产品/页面：【名称和一句话用途】
- 页面类型：【落地页/作品集/Web App/BI 看板/Agent 对话页】
- 目标用户与首要任务：【谁在什么场景做什么】
- 关键内容与功能：【内容、路径、字段、交互、必需状态】
- 技术环境：【仓库、框架、样式系统、组件库、启动命令；若未知，请先检查】
- 设备与语言：【桌面/手机/平板；中文/英文】
- 我的审美偏好：【3 个想要的词；3 个明确不要的特征】
- 品牌资产/约束：【色彩、logo、字体、数据真实性、不得更改的功能等】
- 完成标准：【例如可启动、核心流程可操作、手机不溢出、截图验收】

【工作顺序：按阶段选择 skill，避免互相覆盖】
1. 读项目：查看现有页面、组件、样式、路由和资产。若是新项目，用 Impeccable init/shape
   （以已安装版本实际命令为准）整理产品目标、用户任务及设计约束。列出最多 3 条会影响实现的假设。
   若已有设计系统，优先保持兼容。
2. 定方向：用 Frontend Design 从产品内容提出 2 个真正不同的设计方向，各用「核心概念、主视觉/布局、
   字体与色彩、适用理由、潜在代价」五项描述。选择最符合用户任务和我的偏好的一项，写下取舍。
   不要把"漂亮"当作设计理由。
3. 查证并收敛：用 UI UX Pro Max 针对【产品类型】检索布局、字体、色板、UX 模式和【当前框架】建议，
   挑选有根据的部分，形成一页简短的设计约定：色彩角色、字体层级、间距节奏、容器宽度、
   按钮/输入/卡片/图表样式、状态与动效。不要把不相关风格拼贴。若为落地页/作品集/展示型改版，
   用 Design Taste Frontend 检查设计方向、首屏表现与视觉节奏；若为看板或复杂业务页，跳过其具体布局规则。
4. 实现：直接修改代码，复用现有框架与样式方案；用真实业务含义的文案和可信示例数据；
   让核心动作可操作，完成 loading/empty/error/success、长文本和边界值。避免无意义的图表、
   虚构产品截图、随机渐变、层层嵌套卡片和所有模块同等强调。React/Next.js 项目按需使用 Vercel React Best Practices。
5. 视觉复核：运行项目并实际打开页面。至少检查桌面约 1440px 和手机约 390px 的首屏、全页及关键交互状态；
   对照截图调整层级、宽度、换行、留白和溢出。用 Make Interfaces Feel Better 做细节复核，
   尤其是光学对齐、图标一致性、按钮热区、hover/focus/active 与动效克制。
   无浏览器工具时如实说明未完成可视验收。
6. 质量闭环：按需使用 Impeccable critique → 修改 → audit/harden/polish；再用 Web Design Guidelines
   审查本次改动文件，修正高影响问题。检查键盘操作、可见焦点、语义标签、对比度、响应式、
   reduced motion、控制台错误；不要仅罗列建议而不修复。

【交付】
- 直接交付可运行代码，列出修改文件与启动方法。
- 给出所选设计方向的 3 个关键决策及理由，说明哪些要求已实现。
- 提供桌面和手机截图/预览（工具可用时），列出实测的交互与剩余限制。
- 如某个 skill 未安装或没有截图工具，说明实际采用的替代方法，不声称已调用或验收。
```

## 附录 C · 模板 B：参考设计 + 加入自己的风格（改版用）

```text
请在【项目路径】实现【页面/功能】。参考【链接、附件或设计文件】，
做成适合【我的产品/用户】的原创版本，最终交付可运行代码。

【参考材料的使用范围】
- 我欣赏的部分：【例如信息层级、非对称布局、留白、卡片密度、导航方式、图表表达、细微动效】
- 我不想保留的部分：【例如紫色、玻璃拟态、巨型标题、拟物图标】
- 必须保留的现有产品元素：【logo、品牌色、页面流程、组件或内容】
- 我想加入的个人风格：【3~5 个可解释的词；也可以写"稳重但不沉闷"并举一个具体例子】
- 与参考的距离：【只借鉴原则 / 接近结构但重做风格 / 内部授权的高保真复现】
- 我自己的业务内容：【产品介绍、字段、页面文案、数据、CTA、操作路径】
- 技术与验收要求：【框架、设备、交互、可访问性、完成定义】

【按顺序工作】
1. 先查看参考资料与现有仓库。参考为截图时，分析可见内容；参考为链接但无法访问时，
   明确指出缺少的视觉信息并依据已有材料继续。把参考拆为「信息架构、版式/比例、字体、色彩、
   组件、动效、文案语气」七个维度，每维标注"借鉴/改造/舍弃"及理由。
   分清可见事实与推测，不凭一张截图编造隐藏页面和交互。
2. 用 Impeccable shape/critique 审核参考的任务路径和现有产品约束；用 Frontend Design 提出一个
   属于【我的产品】的视觉概念，解释它和参考的关系。用 UI UX Pro Max 检索适合产品类别的
   布局/交互/字体建议，整理成可实现的 design tokens。仅在展示型页面中使用 Design Taste Frontend 做审美校准。
3. 在写代码前输出一个紧凑的「继承—改造—舍弃」对照表，并给出 5 个明确决定：主视觉、字体层级、
   色彩角色、内容密度、交互节奏。然后直接实现，使用我的内容与资产；若缺图，使用有授权的素材
   或明确标注的占位，不能伪称真实产品截图。
4. 打开实现结果，对照参考和自己的目标分别检查：相似处是否准确；差异是否有意图；
   阅读和操作是否更适合我的用户。桌面约 1440px、手机约 390px 做截图和交互复核。
   用 Make Interfaces Feel Better 打磨局部，再用 Impeccable critique/audit/harden/polish 和
   Web Design Guidelines 修复可访问性、响应式、状态与技术问题。
   React/Next.js 才按需使用 Vercel React Best Practices。

【验收与交付】
- 完成代码和运行说明；给出改动文件。
- 提供参考对照表的最终版本，并说明最能体现我个人风格的 3 个改变。
- 提供桌面/手机截图或预览，以及已测试和未测试的交互。
- skill、参考链接或浏览器能力不可用时如实说明，不虚构分析和调用。
```

## 附录 D · 公开前检查清单

密钥扫描（含历史提交）→ 个人数据与业务数字模糊化 → LICENSE 补齐（MIT/Apache-2.0）→ README 截图与链接有效 → 嵌套 .git 排除 → Releases 资产命名 ASCII 化。

## 附录 E · 灵感源速查

Mobbin · Landdding · Dribbble/Behance · Lapa.ninja/Landingfolio · Muzli · shadcn/ui · ThreeUI · Webflow Templates · Modulify · v0.dev · VEKTR · Motion（motion.dev）· EPOCH/Verona（待确认 URL）· **用户抖音/小红书收藏夹**（走阶段 2.5：口令 → 视频/截图 → 参考卡入库）

## 附录 F · 参考 skills 安装入口（模板第六节）

安装命令、命令名与版本可能变动，以当前仓库文档和实际 agent 环境为准。

- [Design Taste Frontend — Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md)
- [Frontend Design — Anthropic](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- [Impeccable — pbakaus](https://github.com/pbakaus/impeccable/blob/main/README.md)
- [Make Interfaces Feel Better — jakubkrehel](https://github.com/jakubkrehel/make-interfaces-feel-better/blob/main/skills/make-interfaces-feel-better/SKILL.md)
- [UI UX Pro Max — nextlevelbuilder](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [Web Design Guidelines — Vercel Labs](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md)
- [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md)
- [Browser Testing with DevTools — Addy Osmani](https://github.com/addyosmani/agent-skills/blob/main/skills/browser-testing-with-devtools/SKILL.md)

**最省心的使用法**：日常直接填附录 B/C 模板；结果出来后针对一个具体问题追加附录 A 的一句。不要把所有 skill 的全文和所有命令粘成一条超长指令。
