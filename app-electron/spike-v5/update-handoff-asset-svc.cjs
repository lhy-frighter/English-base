const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const NL = "\r\n";
const block = [
  "> 更新：2026-09-24 · 版本 v2.42.0-dev（**#139B 统一资产服务 captureAsset：创建/去重/相遇/关系/卡片工厂**）",
  "> - **Core.captureAsset(input)**：统一资产入口，全流程同一事务、校验先于写入、坏输入零写库。",
  ">   - **identity 去重**：按 (asset_kind, identity_key) 查既有资产——命中不重建，仅追加 encounter；同 idempotency_key 请求重放直接回传（replayed），不写库。",
  ">   - **卡片工厂**（新卡 state=0、due=now，同既有约定）：chunk=chunk_recall+chunk_cloze；grammar=grammar_pattern 一张；pronunciation=pron_perception 一张（产出卡 pron_production 只能由产出链人工确认后经 addPronProductionCard 补建，听辨完成不代表发音掌握）；concept=concept_recall 一张；word 不拥有卡（仍归 note/card 管线）。",
  ">   - **encounter**：UNIQUE(asset_id,origin,ref,locator_hash)——同篇两位置记两次、同位置重提不重复；快照（标题/句子/content_hash）随相遇保存。",
  ">   - **relations**：contains/exemplifies/pronunciation_of/variant_of，按目标 identity 解析、唯一键幂等、目标缺失/自关联跳过。",
  "> - **纯函数（已导出）**：normalizeExpression（lowercase+弯引号归一+空白折叠）、assetIdentity（五类身份规则）、shortHash。",
  "> - **migration v14 补充**：部分唯一索引 idx_cards_asset_type（asset_id,card_type），资产卡类型天然幂等。",
  "> - **验证**：新链 test/asset-service.cjs（33 checks：五类工厂数量/类型、跨入口跨位置相遇、重放零写入、relations 幂等、校验失败零写库、lexemes 隔离、队列可取）；全量 **45 链零失败**；tsc=0；vite build=0。",
  "> - **下一步**：#141（方案标签）DictPanel 抽取 + AssetCaptureSheet「转为练习」统一组件；#142 分类型复习渲染。",
  ">",
  "",
].join(NL);
const anchor = "# 个人英语能力底座 · 交接文档" + NL;
if (!s.startsWith(anchor)) throw new Error("doc header mismatch");
s = anchor + block + s.slice(anchor.length);
fs.writeFileSync(p, s);
console.log("handoff updated");
