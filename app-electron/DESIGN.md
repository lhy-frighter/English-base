# DESIGN.md — 个人英语能力底座 · 视觉方向 v2（分区混合）

> v2 · 2026-09-27 · 经 grill-me 访谈定案（分区混合 / 程序化封面 / 仅今日 hero 一处 WebGL / 拉丁字体打包 / 轻游戏化 / 一次全量 / 纸感底+玻璃件）。v1「词典纸与藏青」全文保留在本文件末尾附注——沉浸区仍沿用它的气质。
> 参考：SchoolAI（Mobbin 9 图）、Apple Liquid Glass（liquid-glass-react 技法）、ThreeUI Community（MengTo）。
> 所有 UI 改动以本文件为准；改方向先改这里。逐页执行规范见 **UI-BLUEPRINT.md**（现状矩阵 + 14 页改造 + 4 批实施顺序）。

## 0. 分区混合原则（访谈核心结论）

| 区域 | 气质 | 底色 |
|---|---|---|
| **业务区**：今日 / 书库 / 复习 / 考试 / 仪表盘 / 语音模型 / 好文 | SchoolAI 式亮蓝活泼：亮钴蓝主色、近白底、白卡胶囊按钮、程序化封面、轻游戏化 | 近白灰 `#f5f6f8` |
| **沉浸区**：阅读器 / 对话页 | 保留 v1 词典纸气质（衬线正文、纸感底），控制件升级玻璃质感 | 词典纸 `#f4f3ec` |
| **通话页** | 深色沉浸 + 玻璃控制件 | 近黑 |
| **玻璃禁用区** | 阅读正文、长列表滚动容器内、通话/ASR 运行中页面（GPU 已被语音占用） | — |

## 1. 色彩 Tokens（业务区）

| 名 | 值 | 用 |
|---|---|---|
| --bg | `#f5f6f8` | 业务区页面底 |
| --surface | `#ffffff` | 卡片 |
| --brand | `#2456f5` | 主色：主按钮/链接/活跃态/hero 板 |
| --brand-h | `#1d47d9` | 主色 hover |
| --brand-wash | `#eef2ff` | 活跃侧栏项/选中浅底 |
| --accent | `#f5b83d` | 琥珀：streak 火焰/下划线强调 |
| --ink | `#101828` | 标题 |
| --ink-2 | `#344054` | 正文 |
| --ink-3 | `#667085` | 弱文字 |
| --line | `#e4e7ec` | 发丝线 |
| --ok | `#12805c` | 成功/正确 |
| --red-pen | `#b42318` | 批改红（保留 v1） |

沉浸区（阅读/对话）继续使用 v1 的 paper/brass-wash/藏青墨。

## 2. 字体

- **拉丁**：Manrope 可变字体（400-800，woff2 已打包 `src/assets/fonts/manrope-latin-var.woff2`，24KB）——标题、数字、英文内容全部用它；动态数字 `tabular-nums`。
- **中文**：系统栈 `"Microsoft YaHei"` 回退；body 栈 = Manrope → Segoe UI → 雅黑。
- **衬线**：阅读器正文/词条继续 Georgia（v1 保留）。
- 禁止外联字体；新增字重只允许走已打包的可变文件。

## 3. 形状 / 影 / 玻璃

- 圆角：卡 16 / 面板 20 / 胶囊按钮与 chip 999 / hero 板 24。
- 阴影：`0 1px 2px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.06)`（卡）；面板更深一档。
- **液态玻璃工具类**（自研薄层，不引入 liquid-glass-react 运行时依赖）：
  - `.glass`：backdrop-filter blur(14px) saturate(1.4) + 半透明白 + 内侧高光边 + 顶部 specular 高光条。
  - `.glass-strong`：blur(20px) 更高不透明度（模态/悬浮控制条）。
  - hover 时 specular 亮度 +10%；禁用区（§0）自动退化为实色卡（`body[data-glass="off"]`）。
- 液体弹性跟随（鼠标微形变）只允许 hero 与模态；列表内禁用。

## 4. 程序化视觉（无插画资产的解法）

- **ProcCover**（canvas 2D，内容 hash → 确定性）：渐变场 + 流线/圆斑纹理 + 噪点，色相从限定柔和色板按 hash 选取；用于书库卡、好文卡、考纲卡封面。
- **HeroCanvas**（原生 WebGL fragment shader，无 three.js）：仅今日页 hero 板背景（流场），reduced-motion / 页面不可见 / 通话·ASR 激活自动暂停，失败降级 CSS 渐变。
- 触发预算：**每页最多一个 canvas/WebGL 动效焦点**。

## 5. 组件语言

- 按钮：胶囊 999（primary 蓝实心 / secondary 白描边 / ghost / 带勾 Done）；hover 提亮 + 轻投影。
- 区块头 `.sec-head`：粗标题 + 灰副标题 + 右侧「查看全部 →」。
- 内容卡：程序化封面 + 徽章 pill（CEFR/来源/Updated）+ 描述 + 元信息行。
- 筛选 chip 行：选中=墨黑底白字（SchoolAI 同款），未选=白底描边。
- 侧栏：lucide 图标 + 文字，活跃态浅蓝 wash 圆角行；底部 = 用户块 + streak 火焰 + 等级徽章（轻游戏化）。
- 仪表盘：半环仪表 + 分段彩色条 + 步骤进度轨 + 彩点表（对应参考图第 9 张）。
- 庆祝：复习完成/测评出分 canvas 彩带（一次性爆发；reduced-motion 只显示静态徽章）。

## 6. 文案语气

业务区口语亲切（「继续今天的精读」「连胜 3 天」）；沉浸区保持 v1 的克制书面语气。

## 7. 反默认自审（v2）

- ✗ 照搬 SchoolAI 的 K-12 插画/教师协作文案 → ✓ 只取布局节奏与组件语言，内容全为本产品
- ✗ 玻璃滥用到正文与列表 → ✓ §0 禁用区硬性约束
- ✗ WebGL 铺满 → ✓ 仅今日 hero 一处 + 自动降级
- ✓ 保留的 v1 记忆点：阅读器衬线纸感（沉浸区不亮蓝化）

---

## 附：v1「词典纸与藏青」（沉浸区沿用）

- 模式：书库/复习/建卡 = Operate（可扫读、一致）；阅读器/查词 = Read（为理解而结构化）。
- 视觉世界：词典、书页、音标、红笔批改、铜金头词。Tokens：paper `#f4f3ec` / surface `#fbfaf5` / ink `#1c2b3a`(2:#3d4a5c 3:#7a8291) / brass `#a16207`(wash `#f3e9cf`) / red-pen `#b42318` / line `#ddd8c9`。
- 字：UI Segoe UI/雅黑；阅读器与头词 Georgia 衬线 17px/1.95，栏宽 ≤70ch；数字 tabular-nums。
- 形/影/动：卡 14/内 8；阴影分层透明；动效仅 bg/border/color/transform/opacity，按压 scale(.96)；focus-visible 铜金外圈；未命中词红笔波浪线。
