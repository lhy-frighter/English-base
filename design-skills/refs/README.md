# design-skills/refs/ · 参考图资产库

UI 参考截图的**资产化目录**（ui-design-flow skill 阶段 2.3 配套）。每次用户发来参考图或现场截图，存入本目录并按约定命名，拆解结论写入对应 `.md`——下次重设计直接复用，不再重新理解"当时喜欢它什么"。

## 命名约定

```
YYYYMMDD-来源-关键词.png
例：20260928-schoolai-词库星云.png
```

- `来源`：schoolai / threeui / liquid-glass / dribbble / landdding / 用户手绘 …
- 同一参考多张：`-01` `-02` 后缀。

## 拆解卡（每张参考一份同名 .md）

```markdown
# 参考卡 · <文件名>
- 来源/获取方式：
- 七维拆解（信息架构 / 版式比例 / 字体 / 色彩 / 组件 / 动效 / 文案语气）：
  | 维度 | 可见事实 | 继承/改造/舍弃 | 理由 |
- 已落地的改动（交接文档 #编号）：
- 未使用的灵感（留档）：
```

## 红线

只取布局节奏与组件语言；不复制品牌素材、文案与可识别整页组合（ui-design-flow 阶段 2.3）。

---

## videos/ · 短视频参考库（抖音收藏夹）

**来源**：用户抖音收藏夹，经 ui-design-flow 阶段 2.5 入库。抖音口令无法直接解析，需用户提供链接/截图/录屏（见 skill 2.5.1）。

**已入库清单（2026-10-04）**：

| 文件 | 作者 | 主题 |
|---|---|---|
| `20261004-douyin-react-liquid-glass.md` | 程序员Ghost | React 实现苹果液态玻璃效果 |
| `20261004-douyin-high-end-commerce-ui.md` | 设计碎碎念 | 深色背景+流光渐变的商业 UI |
| `20261004-douyin-6-app-interactions.md` | 西瓜同学🍉 | 6 种高级交互 |
| `20261004-douyin-8-motion-design.md` | 西瓜同学🍉 | 8 个动效设计 |
| `20261004-douyin-8-interaction-effects.md` | 叨叨AI | 8 种交互动效 |
| `20261004-douyin-free-animation-libs.md` | 李白｜AI创造力实验室 | 三个免费动画组件库 |
| `20261004-douyin-12-interactions.md` | 西瓜同学🍉 | 12 种高级交互 |
| `20261004-douyin-vibecoding-motion-sites.md` | IT民工贾大兵 | 视觉动效网站合集 |
| `20261004-douyin-open-source-motion-components.md` | 小美来啦 | 开源 UI 动效组件库 |
| `20261004-douyin-ui-skill-for-ai.md` | 西瓜同学🍉 | 把设计经验做成 UI Skill |

**状态说明**：以上卡片均为「待用户补图」——agent 无法登录抖音抓取视频内容，拆解基于标题与已知设计语言的可信推断，标注了「继承/改造/舍弃」与实现形式，但**关键帧/动效时长/具体视觉待用户提供截图或录屏后核验**（skill 2.5.2 的抽帧流程）。
