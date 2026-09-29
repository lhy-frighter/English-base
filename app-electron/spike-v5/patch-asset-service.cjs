const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");
const NL = "\n"; // core.cjs LF
function mustReplace(oldStr, newStr, label) {
  if (!s.includes(oldStr)) throw new Error("NOT FOUND: " + label);
  if (s.split(oldStr).length - 1 > 1) throw new Error("NOT UNIQUE: " + label);
  s = s.replace(oldStr, newStr);
}

// 1) migrateV14：cards 重建块后补资产卡类型唯一索引
mustReplace(
  `    CREATE INDEX idx_cards_due ON cards(due, state);
    CREATE INDEX idx_cards_note ON cards(note_id);
    CREATE INDEX idx_cards_asset ON cards(asset_id);\`);
  }
}`,
  `    CREATE INDEX idx_cards_due ON cards(due, state);
    CREATE INDEX idx_cards_note ON cards(note_id);
    CREATE INDEX idx_cards_asset ON cards(asset_id);\`);
  }
  db.exec(\`CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_asset_type
    ON cards(asset_id, card_type) WHERE asset_id IS NOT NULL;\`);
}`,
  "asset card unique index"
);

// 2) 在 migrateV14 函数后插入纯函数助手
const helpers = [
  "// —— V9 资产身份/规范化纯函数（asset-service 用，导出供单测）——",
  "function normalizeExpression(str) {",
  "  return String(str || \"\")",
  "    .replace(/[\\u2018\\u2019]/g, \"'\").replace(/[\\u201C\\u201D]/g, '\"')",
  "    .replace(/\\s+/g, \" \").trim().toLowerCase();",
  "}",
  "function shortHash(str) {",
  "  let h = 5381;",
  "  for (let i = 0; i < String(str).length; i++) { h = ((h << 5) + h + str.charCodeAt(i)) | 0; }",
  "  return (h >>> 0).toString(36);",
  "}",
  "function assetIdentity(kind, o) {",
  "  switch (kind) {",
  "    case 'word': return `lex:${o.lexeme_id}`;",
  "    case 'chunk': return `chk:${normalizeExpression(o.canonical)}`;",
  "    case 'grammar': return `gra:${normalizeExpression(o.canonical)}|${(o.payload && o.payload.exercise_form) || ''}`;",
  "    case 'pronunciation': return `pron:${normalizeExpression(o.canonical)}|${(o.payload && o.payload.problem_type) || ''}`;",
  "    case 'concept': return `con:${o.paper_id}:${o.q_index}:${shortHash(o.test_point || o.canonical)}`;",
  "    default: throw new Error('bad asset_kind');",
  "  }",
  "}",
  "const ASSET_CARD_TYPES = {",
  "  chunk: ['chunk_recall', 'chunk_cloze'],",
  "  grammar: ['grammar_pattern'],",
  "  pronunciation: ['pron_perception'], // 产出卡 pron_production 只能由产出链人工确认后建",
  "  concept: ['concept_recall'],",
  "  word: [], // word 的卡由现有 note/card 管线拥有",
  "};",
];
mustReplace(
  `  db.exec(\`CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_asset_type
    ON cards(asset_id, card_type) WHERE asset_id IS NOT NULL;\`);
}`,
  `  db.exec(\`CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_asset_type
    ON cards(asset_id, card_type) WHERE asset_id IS NOT NULL;\`);
}

` + helpers.join(NL),
  "helpers"
);

// 3) 在 createShadowNote 方法后插入 captureAsset 服务方法
const service = [
  "  // —— #139B 统一资产服务：captureAsset ——",
  "  // 同一语言对象（identity_key）只建一次：命中 → 仅追加 encounter；卡片按工厂创建，全部同一事务。",
  "  captureAsset(input) {",
  "    const kind = input.asset_kind;",
  "    const canonical = String(input.canonical || '').trim();",
  "    const idem = String(input.idempotency_key || '').trim();",
  "    // —— 输入校验（先于任何写入）——",
  "    if (!ASSET_CARD_TYPES[kind]) throw new Error('asset_kind 非法');",
  "    if (!canonical) throw new Error('canonical 不能为空');",
  "    if (!idem) throw new Error('idempotency_key 不能为空');",
  "    let payload = input.payload || {};",
  "    if (typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload 必须是对象');",
  "    let payloadJson;",
  "    try { payloadJson = JSON.stringify(payload); JSON.parse(payloadJson); }",
  "    catch { throw new Error('payload 不可序列化'); }",
  "    if (kind === 'word' && !(Number(input.lexeme_id) > 0)) throw new Error('word 资产必须给 lexeme_id');",
  "    if (kind !== 'word' && input.lexeme_id != null) throw new Error('非 word 资产不得挂 lexeme_id');",
  "    const idInput = {",
  "      lexeme_id: input.lexeme_id, canonical, payload,",
  "      paper_id: input.paper_id ?? '', q_index: input.q_index ?? '',",
  "      test_point: input.test_point || (payload && payload.test_point) || '',",
  "    };",
  "    const identity = assetIdentity(kind, idInput);",
  "    const enc = input.encounter || null;",
  "    if (enc && !['reading','conversation','shadow','exam','syllabus'].includes(enc.origin_kind))",
  "      throw new Error('encounter.origin_kind 非法');",
  "    let locatorJson = '{}', locatorHash = '';",
  "    if (enc) {",
  "      try { locatorJson = JSON.stringify(enc.locator || {}); JSON.parse(locatorJson); }",
  "      catch { throw new Error('encounter.locator 非法'); }",
  "      locatorHash = String(enc.locator_hash || shortHash(locatorJson));",
  "    }",
  "    // —— 操作重放：同 idempotency_key 已建过 → 直接回传，不写库 ——",
  "    const prior = this.user.prepare('SELECT id FROM learning_assets WHERE idempotency_key=?').get(idem);",
  "    if (prior) {",
  "      return { asset_id: prior.id, created: false, cards_created: 0, encounter_added: false, replayed: true };",
  "    }",
  "    const now = nowMs();",
  "    this.user.exec('BEGIN');",
  "    let assetId, created = false, cardsCreated = 0, encounterAdded = false, relationsAdded = 0;",
  "    try {",
  "      const existing = this.user",
  "        .prepare('SELECT id FROM learning_assets WHERE asset_kind=? AND identity_key=?')",
  "        .get(kind, identity);",
  "      if (existing) {",
  "        assetId = existing.id;",
  "      } else {",
  "        this.user.prepare(`INSERT INTO learning_assets",
  "          (asset_kind,canonical,gloss,payload_json,lexeme_id,identity_key,content_hash,status,created_at,confirmed_at,idempotency_key)",
  "          VALUES(?,?,?,?,?,?,?, 'active',?, ?, ?)`)",
  "          .run(kind, canonical, String(input.gloss || ''), payloadJson, input.lexeme_id ?? null,",
  "            identity, String(input.content_hash || shortHash(canonical)), now,",
  "            input.confirmed === false ? 0 : now, idem);",
  "        assetId = Number(this.user.prepare('SELECT last_insert_rowid() AS id').get().id);",
  "        created = true;",
  "        for (const ct of ASSET_CARD_TYPES[kind]) {",
  "          const dupCard = this.user",
  "            .prepare('SELECT id FROM cards WHERE asset_id=? AND card_type=?').get(assetId, ct);",
  "          if (dupCard) continue;",
  "          this.user.prepare('INSERT INTO cards(asset_id,card_type,due,state,created_at) VALUES(?,?,?,0,?)')",
  "            .run(assetId, ct, now, now);",
  "          cardsCreated++;",
  "        }",
  "      }",
  "      if (enc) {",
  "        const dupEnc = this.user.prepare(`SELECT id FROM asset_encounters",
  "          WHERE asset_id=? AND origin_kind=? AND origin_ref=? AND locator_hash=?`)",
  "          .get(assetId, enc.origin_kind, String(enc.origin_ref || ''), locatorHash);",
  "        if (!dupEnc) {",
  "          this.user.prepare(`INSERT INTO asset_encounters",
  "            (asset_id,origin_kind,origin_ref,locator_json,locator_hash,title_snapshot,sentence_snapshot,content_hash,source_status,encountered_at)",
  "            VALUES(?,?,?,?,?,?,?,?, 'active',?)`)",
  "            .run(assetId, enc.origin_kind, String(enc.origin_ref || ''), locatorJson, locatorHash,",
  "              String(enc.title || ''), String(enc.sentence || ''), String(enc.content_hash || ''), now);",
  "          encounterAdded = true;",
  "        }",
  "      }",
  "      for (const rel of (input.relations || [])) {",
  "        if (!['contains','exemplifies','pronunciation_of','variant_of'].includes(rel.rel)) continue;",
  "        const target = this.user",
  "          .prepare('SELECT id FROM learning_assets WHERE asset_kind=? AND identity_key=?')",
  "          .get(rel.target_kind, rel.target_identity);",
  "        if (!target || target.id === assetId) continue;",
  "        this.user.prepare(`INSERT INTO asset_relations(from_asset,to_asset,rel,detail_json)",
  "          VALUES(?,?,?, '{}') ON CONFLICT DO NOTHING`)",
  "          .run(assetId, target.id, rel.rel);",
  "        const ins = this.user.prepare('SELECT changes() AS n').get().n;",
  "        relationsAdded += Number(ins);",
  "      }",
  "      this.user.exec('COMMIT');",
  "    } catch (e) {",
  "      try { this.user.exec('ROLLBACK'); } catch { /* ignore */ }",
  "      throw e;",
  "    }",
  "    return { asset_id: assetId, created, cards_created: cardsCreated,",
  "      encounter_added: encounterAdded, relations_added: relationsAdded, replayed: false };",
  "  }",
  "",
  "  // 发音产出卡（pron_production）只能由产出链（录音→对齐→人工确认）调用：",
  "  addPronProductionCard(assetId) {",
  "    const now = nowMs();",
  "    const a = this.user.prepare(\"SELECT id FROM learning_assets WHERE id=? AND asset_kind='pronunciation'\").get(assetId);",
  "    if (!a) throw new Error('pronunciation 资产不存在');",
  "    const dup = this.user.prepare('SELECT id FROM cards WHERE asset_id=? AND card_type=?').get(assetId, 'pron_production');",
  "    if (dup) return { card_id: dup.id, created: false };",
  "    this.user.prepare('INSERT INTO cards(asset_id,card_type,due,state,created_at) VALUES(?,?,?,0,?)')",
  "      .run(assetId, 'pron_production', now, now);",
  "    return { card_id: Number(this.user.prepare('SELECT last_insert_rowid() AS id').get().id), created: true };",
  "  }",
];
mustReplace(
  `    this.learned.add(lemma); // 提交成功后才纳入会话已学
    return { lexeme_id: lexemeId, note_id: noteId, cards_created, already: false, merged: reused || hadStandalone };
  }`,
  `    this.learned.add(lemma); // 提交成功后才纳入会话已学
    return { lexeme_id: lexemeId, note_id: noteId, cards_created, already: false, merged: reused || hadStandalone };
  }

` + service.join(NL),
  "service methods"
);

// 4) 导出纯函数
mustReplace(
  "module.exports = { Core, MIGRATIONS, extractSentence, buildCloze, nowMs, NEW_PER_DAY, parsePaper, decodeHtmlEntities };",
  "module.exports = { Core, MIGRATIONS, extractSentence, buildCloze, nowMs, NEW_PER_DAY, parsePaper, decodeHtmlEntities, normalizeExpression, assetIdentity, shortHash };",
  "exports"
);

fs.writeFileSync(p, s);
console.log("asset service applied");
