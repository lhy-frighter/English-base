# 参考卡 · 短视频 · React 实现苹果液态玻璃效果

- **来源**：抖音收藏夹（用户提供链接）
- **作者**：程序员Ghost
- **链接**：https://v.douyin.com/D5UexCPDWH0/
- **主题**：React 实现苹果液态玻璃效果（Liquid Glass / Apple Design）
- **入库日期**：2026-10-04

## 素材状态

⚠️ **待用户补图**：agent 无法登录抖音抓取视频内容，本卡基于用户提供的标题与已知苹果 Liquid Glass 设计语言填写。拿到视频/截图后按阶段 2.5.2 抽帧补全七维拆解，并核对下列"推断"。

## 七维拆解（基于主题的可信推断，待补图确认）

| 维度 | 可见事实 / 推断 | 继承/改造/舍弃 | 理由 |
|---|---|---|---|
| 信息架构 | 液态玻璃常用作控制条/侧栏/浮动面板的载体 | 改造 | 本仓库已有 `.glass` 工具类（白名单模式），可借鉴其表现手法 |
| 版式比例 | 圆角偏大（20px+），卡片悬浮感 | 改造 | 与本仓库 v2 圆角档位（卡 12/面板 16/胶囊 999）需对齐 |
| 字体 | 不确定，标题未提及 | — | 待补图 |
| 色彩 | 半透明白 + 高光边 + 顶部 specular 高光条 | 继承 | 本仓库 `.glass` 已有此结构（#181） |
| 组件 | 液态玻璃控制键 / 卡片 / 弹层 | 改造 | 可提取为新的组件变体，而非推翻现有 |
| 动效 | 弹性跟随（鼠标微形变）、hover 高光亮度变化 | 继承 | DESIGN.md v2 已定「弹性跟随仅 hero 与模态」 |
| 文案语气 | 与视觉语言无关 | — | 不涉及 |

## 实现形式（可直接落地的技术方案）

```
/* 核心：backdrop-filter 半透层 + 内侧高光边 + 顶部 specular */
.glass {
  background: rgba(255,255,255,.28);
  backdrop-filter: blur(20px) saturate(1.55);
  -webkit-backdrop-filter: blur(20px) saturate(1.55);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.6);   /* 内侧高光边 */
  position: relative;
}
.glass::before {   /* 顶部 specular 高光条 */
  content: ""; position: absolute; inset: 0 0 auto 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent);
}
```

- **成本提醒**：`backdrop-filter` 每帧重采样，白名单外禁用；`body[data-glass="off"]` 全局降级已就绪。
- **React 实现**：`.glass` 工具类即可，无需库。若做"鼠标跟随形变"需 SVG feDisplacementMap 或 CSS 变量 `--px/--py` 驱动，成本高，仅限 hero 与模态（DESIGN.md 约束）。

## 继承/改造/舍弃对照

- **继承**：半透明白 + 高光边 + specular 条（与本仓库 v2 液态玻璃一致）
- **改造**：把效果从"工具类"扩展为"可复用的组件变体"（如 `glass-card` / `glass-pill`）
- **舍弃**：不做全站玻璃化（白名单硬约束），不引入运行时依赖库

## 待用户补图后更新

- [ ] 视频关键帧截图
- [ ] 确认圆角/阴影/动效时长
- [ ] 补充动效专项（触发/时长/缓动/reduced-motion）