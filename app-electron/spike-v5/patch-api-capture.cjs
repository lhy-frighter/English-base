const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/api.ts";
let s = fs.readFileSync(p, "utf8");
const anchor = "export const api = (window as any).electronAPI as {";
if (!s.includes(anchor)) throw new Error("anchor missing");
const types = [
  'export type AssetKind = "word" | "chunk" | "grammar" | "pronunciation" | "concept";',
  'export type AssetOriginKind = "reading" | "conversation" | "shadow" | "exam" | "syllabus";',
  "export interface CaptureEncounter {",
  "  origin_kind: AssetOriginKind;",
  "  origin_ref: string;",
  "  locator?: Record<string, unknown>;",
  "  locator_hash?: string;",
  "  title?: string;",
  "  sentence?: string;",
  "  content_hash?: string;",
  "}",
  "export interface CaptureAssetInput {",
  "  asset_kind: AssetKind;",
  "  canonical: string;",
  "  gloss?: string;",
  "  payload?: Record<string, unknown>;",
  "  lexeme_id?: number;",
  "  paper_id?: string;",
  "  q_index?: string;",
  "  test_point?: string;",
  "  content_hash?: string;",
  "  confirmed?: boolean;",
  "  idempotency_key: string;",
  "  encounter?: CaptureEncounter;",
  "  relations?: { rel: string; target_kind: AssetKind; target_identity: string }[];",
  "}",
  "export interface CaptureAssetResult {",
  "  asset_id: number;",
  "  created: boolean;",
  "  cards_created: number;",
  "  encounter_added: boolean;",
  "  relations_added: number;",
  "  replayed: boolean;",
  "}",
  "",
].join("\n");
s = s.replace(anchor, types + anchor);

// 在 createShadowNote 声明后加两个方法声明
const oldDecl = `  createShadowNote: (p: {
    word: string; sentence: string;
  }) => Promise<{ lexeme_id: number; note_id: number; cards_created: number; already: boolean; merged: boolean }>;`;
if (!s.includes(oldDecl)) throw new Error("decl anchor missing");
const newDecl = oldDecl + `
  captureAsset: (p: CaptureAssetInput) => Promise<CaptureAssetResult>;
  addPronProductionCard: (assetId: number) => Promise<{ card_id: number; created: boolean }>;`;
s = s.replace(oldDecl, newDecl);
fs.writeFileSync(p, s);
console.log("api.ts types added");
