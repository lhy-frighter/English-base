export interface PriorityParts {
  overdue: number; recurrence: number; recent_error: number;
  exam: number; output_gap: number; success_decay: number;
}
export interface ExamWeakItem {
  id: number;
  paper_id: number;
  q_index: number;
  paper_title: string;
  reason: string;
  stem: string;
  section_kind: string;
  answer: string;
  point: string;
  is_listening: boolean;
}

export interface PriorityDto {
  asset_id: number; score: number; parts: PriorityParts;
  reasons: string[]; algo: string;
  canonical: string; gloss: string; asset_kind: string;
}

export interface TodayBrief {
  primary: "review" | "reading" | "feed";
  due_cards: number;
  fresh_today: number;
  queue: number;
  est_minutes: number;
  resume: { refId: string; title: string; pi: number; ch: number } | null;
  wrong_due: number;  recycle_multi: number;
  recycle_total: number;
  shadow_due: number;
}

// S11-c 跟读句 1/3/7 轻量复习
export interface ShadowDueItem {
  id: number; sentence: string; textId: number | null; sourceTitle: string;
  stage: number; dueAt: number; practiceCount: number; bestSimilarity: number; overdueMs: number;
}
export interface ShadowPracticeResult {
  hash: string; isNew: boolean; advanced: boolean; graduated: boolean;
  stage: number; status: "active" | "graduated" | "dismissed"; dueAt: number; sentence: string;
}

export type InsightDay = {
  key: string; label: string;
  minutes: { read: number; shadow: number; review: number; exam: number };
  counts: { lookup: number; note: number; translation: number };
  reviews: number; readWords: number; shadowSentences: number; examPapers: number; valid: boolean;
};
export type CoveragePoint = {
  key: string; kind: string; cefr: string; rate: number; total: number; known: number;
  textId: number | null; title: string | null; deleted: boolean;
};
export interface Insights {
  range_days: number;
  days: InsightDay[];
  totals: {
    minutes: { read: number; shadow: number; review: number; exam: number };
    counts: { lookup: number; note: number; translation: number };
    reviews: number; readWords: number; shadowSentences: number; examPapers: number;
  };
  streak: { current: number; longest: number };
  coverage: CoveragePoint[];
  history_note: string;
}
export type TimelineEntry = {
  kind: string; ts?: number | null; title?: string; refType?: string; refId?: string;
  deleted?: boolean; amount?: number; unit?: string; minutes?: number; status?: string;
};
export interface DayTimeline { key: string; valid: boolean; entries: TimelineEntry[]; }

export interface ResumeState {
  scope: "reading" | "shadow";
  refId: string;
  locator: { pi?: number; ch?: number; [k: string]: unknown };
  contentHash: string;
  updatedAt: number;
}
export interface SessionDto {
  id: number; kind: "read" | "shadow"; sessionKey: string;
  refType: string; refId: string; titleSnapshot: string;
  locator: Record<string, unknown>; contentHash: string;
  amount: number; unit: string; startedAt: number; endedAt: number | null;
  lastActiveAt: number; status: "open" | "closed" | "abandoned"; activeMs: number;
}
export interface Token {
  i: number;
  text: string;
  label: string;
  start: number;
  phrase?: string;
  learned?: boolean;
  awl?: number; // AWL 子表号 1-10，0=非学术词
}
export interface PackBadge {
  id: string;
  name: string;
}
export interface Entry {
  word: string;
  lemma: string;
  phonetic: string;
  pos: string;
  translation: string;
  definition: string;
  tag: string;
  bnc: number;
  frq: number;
  kind: string;
  layers?: PackBadge[]; // 领域词包来源（L0 ECDICT 不在此列）
  cardable?: boolean;   // false=专名/数字占位，不允许建卡
}
export interface TextStats {
  words: number;
  learnedTokens: number;
  learnedUnique: number;
  rate: number;
  awlTokens?: number;
  awlUnique?: number;
  awlRate?: number;
}
export interface Annotated {
  text_id: number;
  tokens: Token[];
  stats: TextStats;
}
export interface DashText {
  id: number;
  title: string;
  created_at: number;
  words: number;
  rate: number;
  learnedUnique: number;
  density: number;
}
export interface Dashboard {
  texts: DashText[];
  states: { new: number; learning: number; review: number };
  reviews: { day: string; n: number }[];
  growth: { day: string; n: number; total: number }[];
  syllabus: SyllabusGroup[];
  backup: { count: number; last: string; recovery: string };
  totals: { lexemes: number; cards: number };
}
export interface SyllabusGroup {
  tag: string;
  label: string;
  total: number;
  learned: number;
  rate: number;
}
export interface SyllabusWord {
  word: string;
  phonetic: string;
  pos: string;
  translation: string;
  definition: string;
  frq: number;
  bnc: number;
  learned: boolean;
  gloss: string;
  sub?: number; // AWL 子表号（仅学术 AWL 牌组）
}
export interface SyllabusPage {
  total: number;
  offset: number;
  page: number;
  rows: SyllabusWord[];
}
export interface ReviewCard {
  card_id: number;
  note_id: number;
  asset_id?: number | null;
  asset_kind?: AssetKind | null;
  payload?: Record<string, unknown> | null;
  card_type: string;
  sentence: string;
  full: string;
  text_id: number | null;
  word: string;
  phonetic: string;
  sense: string;
  exchange: string;
  definition: string;
  answer: string;
  clozeMiss: boolean;
  choices?: string[];
  correctChoice?: string | null;
  reference?: string;   // 仅 note_translate：参考答案译文（翻译批改基准）
  noExample?: boolean; // 仅 chunk_cloze：缺例句时正面即答案（#200）
  state: number;
}
export interface LexemeInfo {
  id: number;
  lemma: string;
  sense: string;
  tag: string;
  level: string;
  created_at: number;
  cards: number;
  due: number;
  lapses: number;
  encounters: number;
  has_reading: 0 | 1;
  has_standalone: 0 | 1;
}
export type LexSort = "created" | "lapses" | "encounters" | "level";
export interface LexemePage {
  total: number;
  offset: number;
  rows: LexemeInfo[];
}
export interface Related {
  family: { word: string; gloss: string }[];
  synonyms: { word: string; gloss: string }[];
}
export interface LexemeNote {
  id: number;
  context_sentence: string;
  text_id: number | null;
  text_title: string | null;
  zh: string | null;
  source: "reading" | "syllabus";
  cards: { id: number; card_type: string; due: number; state: number; lapses: number }[];
}
export interface LexemeDetail {
  id: number;
  lemma: string;
  sense: string;
  tag: string;
  level: string;
  lapses: number;
  encounters: number;
  created_at: number;
  related: Related;
  notes: LexemeNote[];
}
export interface Counts {
  due_review: number;
  new_remaining_today: number;
  total_cards: number;
  total_lexemes: number;
}

export interface BuiltIn {
  id: string;
  title: string;
  genre: string;
  level: string;
  source: string;
  words: number;
}

// —— V3 考试模式 ——
export interface PaperQuestion {
  index: number;
  section: string;
  section_kind: string;
  stem: string;
  options: { key: string; text: string }[];
  qtype: "objective" | "subjective";
  answer: string;
  analysis: string;
  point: string;
  model: string;
}
export interface PaperCue { t: number; text: string; }
export interface PaperSection {
  title: string; kind: "reading" | "listening" | "writing" | string;
  audio: string; passage: string; cues: PaperCue[]; questions: PaperQuestion[];
}
export interface PaperStruct { title: string; kind: string; sections: PaperSection[]; questions: PaperQuestion[]; }
export interface PaperListItem {
  id: number; title: string; kind: string; n_questions: number; created_at: number;
  last_attempt: number | null; active_wrong: number;
}
export interface PaperDetail {
  id: number; title: string; kind: string; raw_md: string; n_questions: number; audio: string;
  struct: PaperStruct; created_at: number;
}
export interface GradeDetail {
  index: number; picked: string; qtype: string; section: string;
  graded: boolean; correct: boolean | null; answer: string; model: string;
}
export interface GradeResult { correct: number; total: number; total_all: number; details: GradeDetail[]; }
export interface WrongItem {
  id: number; paper_id: number; q_index: number; picked: string; reason: string;
  state: "active" | "archived"; stage: number; next_review: number; redos: number;
  concept_card_id: number | null; created_at: number; paper_title: string;
  due: boolean; stage_label: string; question: PaperQuestion | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// S6：文章来源与书库卡片
export type TextSourceKind = "builtin" | "feed" | "url" | "file" | "paste" | "extension";
export interface TextSource {
  kind: TextSourceKind; label: string; uri: string; externalRef: string; importedAt: number;
}
export interface TextCard {
  id: number; title: string; created_at: number; lookups: number;
  sources: TextSource[];
  stats: { words: number; rate: number; learnedTokens: number; awlRate: number; cefr: string | null } | null;
}
export interface TextQuery {
  limit?: number; offset?: number; sort?: "recent" | "words" | "cefr" | "rate" | "lookups";
  kind?: TextSourceKind | ""; cefr?: string | ""; q?: string;
}
export interface RecycleItem {
  lemma: string; phonetic: string; gloss: string; tag: string; frq: number;
  level: string; levelRank: number; awl: 0 | 1;
  texts: number; total: number; firstSeen: number; lastSeen: number;
  sources: { text_id: number; title: string; count: number }[];
}
export interface RecyclePage { total: number; items: RecycleItem[]; }
export interface RecycleAddResult {
  added: { lemma: string; cards: number }[];
  already: string[];
  skipped: { lemma: string; reason: string }[];
}


// —— V8-2b 对话会话与轮次 ——
export interface ConvSession {
  id: number; sessionKey: string; title: string;
  topic: { goal: string; cefr: string; suggestedTurns: number };
  startedAt: number; endedAt: number | null; lastActiveAt: number;
  status: "open" | "closed" | "abandoned"; activeMs: number;
  brainEngine: string; brainModelRevision: string;
  augmented: 0 | 1; cefrAtStart: string; turnsCount: number;
}
export interface ConvTurn {
  id: number; turnKey: string; sessionId: number; seq: number;
  role: "user" | "assistant"; status: string; text: string; committedText: string;
  playedCharEnd: number | null; provider: string; modelRevision: string;
  asrEngine: string; asrModel: string; edited: 0 | 1; audioRef: string | null;
  localFeedback: unknown[]; cloudFeedback: unknown[];
  augmentStatus: string; interruptedAt: number | null; errorCode: string | null; createdAt: number;
}
// —— V8-2d 云端同意：三类数据各自独立开关 ——
export interface CloudConsent {
  profile: boolean;      // 学习画像
  historyText: boolean;  // 历史对话文本
  audio: boolean;        // 录音原文
  grammarCloud: boolean; // 文本送云端做语法深度分析（S15-1）
  topicClassify: boolean; // 好文标题+摘要送云端做题材分类（#208）
  baseUrl: string;       // OpenAI 兼容端点
  model: string;         // 云端模型名
  updatedAt: number;
}
export type AssetKind = "word" | "chunk" | "grammar" | "pronunciation" | "concept";
export type AssetOriginKind = "reading" | "conversation" | "shadow" | "exam" | "syllabus";
export interface CaptureEncounter {
  origin_kind: AssetOriginKind;
  origin_ref: string;
  locator?: Record<string, unknown>;
  locator_hash?: string;
  title?: string;
  sentence?: string;
  content_hash?: string;
}
export interface CaptureAssetInput {
  asset_kind: AssetKind;
  canonical: string;
  gloss?: string;
  payload?: Record<string, unknown>;
  lexeme_id?: number;
  paper_id?: string;
  q_index?: string;
  test_point?: string;
  content_hash?: string;
  confirmed?: boolean;
  idempotency_key: string;
  encounter?: CaptureEncounter;
  relations?: { rel: string; target_kind: AssetKind; target_identity: string }[];
}
export interface CaptureAssetResult {
  asset_id: number;
  created: boolean;
  cards_created: number;
  encounter_added: boolean;
  relations_added: number;
  replayed: boolean;
}
export type EvidenceResult =
  | "correct" | "partial" | "wrong" | "practice_observation" | "improved"
  | "recurred" | "recognized" | "used_spontaneously"
  | "used_prompted" | "used_after_correction";
export interface AssetEvidenceInput {
  asset_id: number;
  dimension: string;
  result: EvidenceResult;
  source_kind: AssetOriginKind | "review";
  source_ref?: string;
  payload?: Record<string, unknown>;
  idempotency_key: string;
}
// —— S13-a-2 会话复盘 ——
export interface DebriefCandidate {
  kind: AssetKind;
  canonical: string;
  clicked?: string;
  gloss?: string;
  sentence?: string;
  payload?: Record<string, unknown>;
}
export interface DebriefDraft {
  draft_key: string;
  origin_kind: "reading" | "conversation" | "shadow" | "exam";
  origin_ref: string;
  candidates_json: string;
  status: "open" | "done" | "skipped";
  created_at: number;
  updated_at: number;
}
export interface TextLearnedSummary {
  words: number;
  assets: Partial<Record<AssetKind, number>>;
  shadow_pass: number;
}
export interface ConversationSummaryDto {
  assets: number;
  assetKinds: Partial<Record<AssetKind, number>>;
  evidence: Record<"used_spontaneously" | "used_prompted" | "used_after_correction" | "recognized", number>;
}
export const api = (window as any).electronAPI as {
  convCreate: (o: {
    goal: string; cefr: string; suggestedTurns: number; sessionKey?: string;
    brainEngine?: string; brainModelRevision?: string;
  }) => Promise<ConvSession>;
  convList: (limit?: number) => Promise<ConvSession[]>;
  convGet: (sessionKey: string) => Promise<{ session: ConvSession; turns: ConvTurn[] } | null>;
  convAddTurn: (o: {
    sessionKey: string; turnKey: string; role: "user" | "assistant";
    text?: string; committedText?: string; status?: string; seq?: number;
    provider?: string; modelRevision?: string;
    asrEngine?: string; asrModel?: string;
  }) => Promise<ConvTurn>;
  convUpdateTurn: (o: {
    turnKey: string; status?: string; text?: string; committedText?: string;
    playedCharEnd?: number; errorCode?: string; interruptedAt?: number;
    provider?: string; modelRevision?: string; audioRef?: string;
    localFeedback?: unknown[]; cloudFeedback?: unknown[];
    augmentStatus?: string; edited?: boolean;
  }) => Promise<ConvTurn>;
  convClose: (o: { sessionKey: string; activeMs: number; status?: "closed" | "abandoned" }) => Promise<ConvSession | null>;
  // —— V8-2d 云端显式同意 + safeStorage ——
  cloudGetConsent: () => Promise<{
    consent: CloudConsent; keySet: boolean; encryptionAvailable: boolean;
  }>;
  cloudSaveConsent: (consent: CloudConsent) => Promise<CloudConsent>;
  cloudSetKey: (apiKey: string) => Promise<{ keySet: boolean }>;
  // 连通性自检：在主进程执行（渲染层拿不到 key 明文），只发一次 1-token 请求
  cloudProbe: (p: { baseUrl: string; model: string }) =>
    Promise<{ ok: boolean; reason?: string; model?: string }>;
  cloudClearKey: () => Promise<{ keySet: boolean }>;
  cloudGetKey: () => Promise<string>;
  annotate: (text: string, title?: string, source?: { kind: TextSourceKind; label?: string; uri?: string; externalRef?: string }) => Promise<Annotated>;
  fetchUrl: (url: string) => Promise<UrlPreview>;
  lookup: (word: string, label: string, phrase: string | null, textId: number | null) => Promise<Entry | null>;
  dashboard: () => Promise<Dashboard>;
  listTexts: (p?: TextQuery) => Promise<{ total: number; totalAll: number; items: TextCard[] }>;
  getText: (id: number) => Promise<{ id: number; title: string; raw_text: string }>;
  textDelete: (id: number) => Promise<{ deleted: boolean; notes: number; lexemesRemoved: number }>;

  // S9-1 学习会话（阅读/跟读活跃计时）
  sessionBegin: (o: {
    kind: "read" | "shadow" | "conversation"; sessionKey: string; refType: string; refId: string;
    titleSnapshot?: string; locator?: Record<string, unknown>; contentHash?: string;
    amount?: number; unit?: "words" | "sentences" | "turns" | "";
  }) => Promise<SessionDto>;
  sessionHeartbeat: (sessionKey: string, activeMs: number, amount: number, locator?: Record<string, unknown>) => Promise<SessionDto>;
  sessionClose: (sessionKey: string, activeMs: number, amount: number, locator?: Record<string, unknown>) => Promise<SessionDto | null>;
  resumePut: (scope: "reading" | "shadow", refId: string, locator: Record<string, unknown>, contentHash?: string) => Promise<ResumeState>;
  resumeGet: (scope: "reading" | "shadow") => Promise<ResumeState | null>;
  todayBrief: () => Promise<TodayBrief>;
  recycleCandidates: (p?: { minTexts?: number; limit?: number; offset?: number }) => Promise<RecyclePage>;
  recycleAdd: (words: string[]) => Promise<RecycleAddResult>;
  shadowPractice: (p: {
    sentence: string; textId?: number | null; title?: string; similarity?: number;
    originKind?: string; originRef?: string;
  }) => Promise<ShadowPracticeResult>;
  shadowDue: (limit?: number) => Promise<ShadowDueItem[]>;
  shadowDismiss: (id: number) => Promise<boolean>;
  insights: (days?: number) => Promise<Insights>;
  dayTimeline: (key: string) => Promise<DayTimeline>;
  builtinsList: () => Promise<BuiltIn[]>;
  getBuiltin: (id: string) => Promise<{ id: string; title: string; text: string } | null>;
  transForText: (textId: number) => Promise<{
    paras: { en: string; zh: string; pairs: [string, string][] }[];
  } | null>;
  // —— S7b 离线机翻缓存 ——
  mtCacheGet: (textId: number) => Promise<MtCachePara[]>;
  mtCachePut: (p: {
    textId: number; paraIndex: number; source: string; translatedText: string;
    pairs: [string, string][]; status?: "ok" | "failed"; engine?: string; modelRevision?: string;
    srcLang?: string; dstLang?: string;
  }) => Promise<{ textId: number; paraIndex: number; sourceSha: string; status: string }>;
  mtCacheClear: (textId: number) => Promise<{ deleted: number }>;
  createNote: (p: {
    word: string; label: string; phrase: string | null; sense: string; textId: number; offset: number;
  }) => Promise<{ lexeme_id: number; note_id: number; cards_created: number; already: boolean; merged: boolean }>;
  createStandaloneNote: (p: {
    word: string; label: string; phrase: string | null; sense: string;
  }) => Promise<{ lexeme_id: number; note_id: number; cards_created: number; already: boolean }>;
  createShadowNote: (p: {
    word: string; sentence: string;
  }) => Promise<{ lexeme_id: number; note_id: number; cards_created: number; already: boolean; merged: boolean }>;
  captureAsset: (p: CaptureAssetInput) => Promise<CaptureAssetResult>;
  // #208 好文题材分类
  feedItemsNeedingTopic: (p?: { limit?: number }) => Promise<FeedTopicInput[]>;
  feedApplyTopics: (p: { rows: { feed_id: string; guid: string; topic: string; gist: string }[] }) =>
    Promise<{ applied: number }>;
  feedTopicsOverview: () => Promise<FeedTopicOverview>;
  feedItemsByTopic: (p: { topic: string; limit?: number }) => Promise<FeedTopicItem[]>;
  pruneStaleFeedItems: (p?: { days?: number }) => Promise<{ removed: number; days: number }>;
  // 自动沉淀复盘候选（#204）：会话/文章收口时把确定性候选转成学习资产，
  // 不必等用户手动打开复盘面板。preload-drift 守卫要求两侧键集一致。
  debriefAutoArchive: (p: { origin_kind: string; origin_ref: string; session_key?: string | null }) =>
    Promise<{ archived: number; draft_key: string; remaining?: number; skipped?: string }>;
  addPronProductionCard: (assetId: number) => Promise<{ card_id: number; created: boolean }>;
  findAssetByCanonical: (kind: AssetKind, canonical: string) => Promise<number | null>;
  addAssetEvidence: (p: AssetEvidenceInput) => Promise<{ evidence_id: number; replayed: boolean }>;
  debriefPut: (p: {
    origin_kind: DebriefDraft["origin_kind"]; origin_ref: string; candidates: DebriefCandidate[];
  }) => Promise<{ draft_key: string }>;
  debriefList: () => Promise<DebriefDraft[]>;
  debriefGet: (draftKey: string) => Promise<DebriefDraft | null>;
  debriefSetStatus: (draftKey: string, status: DebriefDraft["status"]) => Promise<DebriefDraft | null>;
  textDebriefCandidates: (textId: number) => Promise<DebriefCandidate[]>;
  textLearnedSummary: (textId: number) => Promise<TextLearnedSummary>;
  conversationSummary: (sessionKey: string) => Promise<ConversationSummaryDto>;
  detectUsedAssets: (p: { sessionKey: string; turnKey: string; text: string;
    prompted?: number[]; }) =>
    Promise<{ asset_id: number; result: EvidenceResult; replayed: boolean; }[]>;
  assetUseCounts: (assetId: number) => Promise<{
    used_spontaneously: number; used_prompted: number;
    used_after_correction: number; recognized: number;
  }>;
  priorityList: (p?: { limit?: number; kinds?: string[]; }) => Promise<PriorityDto[]>;
  shadowPassedForSentences: (sentences: string[]) => Promise<boolean[]>;
  shadowPassedForTurn: (turnId: string) => Promise<boolean>;
  examWeakList: (p?: { limit?: number }) => Promise<ExamWeakItem[]>;
  phonetics: (words: string[]) => Promise<(string | null)[]>;
  getDue: (limit: number) => Promise<ReviewCard[]>;
  answer: (cardId: number, rating: number, elapsedMs: number) => Promise<{
    due_ms: number; interval_days: number; stability: number; difficulty: number; lapses: number;
  }>;
  counts: () => Promise<Counts>;
  listLexemes: (p?: { q?: string; offset: number; sort?: LexSort }) => Promise<LexemePage>;
  lexemeDetail: (id: number) => Promise<LexemeDetail | null>;
  relatedWords: (lemma: string) => Promise<Related>;
  syllabusList: () => Promise<SyllabusGroup[]>;
  syllabusWords: (p: { tag: string; q?: string; offset: number }) => Promise<SyllabusPage>;
  importFiles: (paths: string[]) => Promise<
    { file: string; ok: boolean; textId?: number; truncated?: boolean; error?: string }[]
  >;
  importPaper: (md: string, audioPaths?: string[]) => Promise<{ id: number; duplicated: boolean; title: string; nQuestions: number; audio?: string; copied?: string[] }>;
  listPapers: () => Promise<PaperListItem[]>;
  getPaper: (id: number) => Promise<PaperDetail | null>;
  mediaUrl: (name: string) => Promise<string | null>;
  gradeAttempt: (paperId: number, answers: Record<number, string>, startedAt: number) => Promise<GradeResult>;
  listWrong: (state: "active" | "archived" | "all") => Promise<WrongItem[]>;
  wrongDueCount: () => Promise<number>;
  setWrongReason: (id: number, reason: string) => Promise<{ concept_card_id: number | null }>;
  redoWrong: (id: number, picked: string) => Promise<{ correct: boolean; stage: number; state: string; next_review: number; stage_label: string }>;
  archiveWrong: (id: number) => Promise<void>;
  // —— V6 语音模型 ——
  modelCatalog: () => Promise<ModelCatalogItem[]>;
  modelStatus: (id: string) => Promise<{ state: "installed" | "partial" | "missing"; manifest: ModelManifest | null }>;
  modelEnsure: (id: string) => Promise<{ id: string; state: string; totalBytes?: number; files?: number; tookMs?: number }>;
  modelCancel: (id: string) => Promise<{ cancelled: boolean }>;
  modelDelete: (id: string) => Promise<{ id: string; deleted: boolean }>;
  modelGetMirror: () => Promise<string>;
  modelSetMirror: (mirror: string) => Promise<{ mirror: string }>;
  modelGetMtMirror: () => Promise<{ mirror: string }>;
  modelSetMtMirror: (mirror: string) => Promise<{ mirror: string }>;
  modelBaseUrl: () => Promise<string>;
  modelRuntime: (id: string) => Promise<ModelRuntime>;
  onModelProgress: (cb: (p: ModelProgress) => void) => () => void;
  pathForFile: (file: File) => string;
  onIngested: (cb: (p: { title: string; url: string; at: number }) => void) => () => void;
  // Realtime 中继：Key 只在主进程，port 经 window.postMessage 在 DOM 层转移（不能走 contextBridge）。
  // 此前这条漏了声明，call-engine 只好自己手写一份 as unknown as —— 契约没 formalized 的典型代价。
  // test/ipc-contract.cjs 现在会锁 preload 暴露面与本块的键集一致（#197）。
  realtimeOpen: (opts?: unknown) => void;
  // —— 语音回归集 ——
  regressionList: () => Promise<RegressionClip[]>;
  regressionSave: (p: RegressionSave) => Promise<RegressionClip>;
  regressionRead: (id: string) => Promise<{ mime: string; bytes: Uint8Array; clip: RegressionClip }>;
  regressionDelete: (id: string) => Promise<{ deleted: boolean }>;
  regressionSetEval: (p: { id: string; model: string; result: RegressionEval }) => Promise<RegressionEval>;
  // —— S3/S4 每日好文 ——
  feedsList: () => Promise<FeedSource[]>;
  feedsRefresh: (p?: { force?: boolean }) => Promise<{ added: number; at: number; results: unknown[] }>;
  feedsRefreshOne: (p: { id: string; force?: boolean }) => Promise<unknown>;
  feedsAdd: (p: { url: string; title?: string }) => Promise<{ id: string; reused?: boolean; ok?: boolean; error?: string }>;
  feedsRemove: (p: { id: string }) => Promise<{ removed: boolean; builtin?: boolean }>;
  feedsToggle: (p: { id: string; enabled: boolean }) => Promise<{ changed: boolean }>;
  feedItems: (p?: { status?: string; limit?: number; offset?: number }) => Promise<{ total: number; items: FeedItem[] }>;
  feedItemStatus: (p: { feedId: string; guid: string; status: string; textId?: number | null }) => Promise<{ changed: boolean }>;
  feedAnalyze: (p?: { limit?: number; recompute?: boolean }) => Promise<{ analyzed: number; scanned: number }>;
  feedImport: (p: { feedId: string; guid: string }) => Promise<{ textId: number; duplicated?: boolean; title: string; truncated?: boolean; chars: number }>;
  // —— S12 平行文本能力测评 ——
  assessmentBlueprints: () => Promise<AssessmentBlueprint[]>;
  assessmentStart: (blueprintId: string) => Promise<AssessmentStart>;
  assessmentFinish: (p: {
    formId: string; activeMs: number; lookups: number; translatedParas: number; answers: number[];
  }) => Promise<AssessmentResult>;
  assessmentHistory: (limit?: number) => Promise<AssessmentHistoryItem[]>;
};

// —— S12 平行文本能力测评 ——
export interface AssessmentBlueprint {
  id: string; cefr: string; domain: string; name: string;
  recWpm: number; forms_total: number; forms_left: number;
}
export interface AssessmentQuestion {
  q: string; options: string[]; answer: number; pi: number;
}
export interface AssessmentStart {
  form_id: string; builtin_id: string; blueprint: string; cefr: string; title: string;
  questions: AssessmentQuestion[];
  coverage: { rate: number; total: number; known: number };
}
export interface AssessmentResult {
  score: number; blueprint: string; form: string;
  correct: number; questions: number; wpm: number; active_ms: number;
  lookups: number; translated_paras: number;
  comp: number; coverage: number; speed: number; dependence: number;
  formula: string; bankVersion: string;
}
export interface AssessmentHistoryItem {
  cefr: string; score: number; created_at: number;
  wpm: number; correct: number; questions: number;
  comp: number; coverage: number; speed: number; dependence: number;
  // snapshot_json 损坏/非对象时为 true，此时上面那些数值字段不可信（core 不会填），
  // UI 须显式提示而不是照常渲染出 NaN（#195）。
  corrupt?: boolean;
}

export interface FeedTopicInput { feed_id: string; guid: string; title: string; summary: string }
export interface FeedTopicItem extends FeedTopicInput {
  published_at: number; cefr: string; rate: number | null; text_id: number | null;
}
export interface FeedTopicOverview {
  total: number; classified: number; unclassified: number;
  counts: Record<string, number>;
}

export interface ModelFileRec { path: string; bytes: number; sha256: string }
export interface ModelManifest {
  id: string; repo: string; revision: string; dtype: string; mirror: string;
  files: ModelFileRec[]; totalBytes: number; license: { model: string; url: string };
  installedAt: number; tookMs: number;
}
export interface ModelCatalogItem {
  id: string; name: string; sizeNote: string; dtype: string; multilingual?: boolean; revision?: string;
  license: { model: string; url: string }; state: "installed" | "partial" | "missing";
}
export interface ModelRuntime { base: string; repo: string; revision: string; files: string[]; dtype: string; multilingual?: boolean; state: string }
// S7b 离线机翻缓存段
export interface MtCachePara {
  paraIndex: number; sourceSha: string; engine: string; modelRevision: string;
  zh: string; pairs: [string, string][]; status: "ok" | "failed" | string; updatedAt: number;
}
export interface ModelProgress {
  id: string; phase: "skip" | "download" | "progress" | "filedone" | "installed";
  file?: string; index?: number; total?: number; done?: number; totalBytes?: number; pct?: number;
}

// —— 语音回归集 ——
export type RegressionLang = "en" | "zh" | "mixed";
export interface RegressionEval {
  at: number; ms: number; text: string;
  sim: number | null; wer: number | null;
  misses: number; subs: number; extras: number;
  cjkRatio: number; hallucinated: boolean;
}
export interface RegressionClip {
  id: string; file: string; mime: string; lang: RegressionLang;
  ref: string; source: "shadow" | "voice"; model: string; hyp: string; ms: number;
  createdAt: number; evals: Record<string, RegressionEval>;
}
export interface RegressionSave {
  lang: RegressionLang; ref: string; source: "shadow" | "voice";
  model: string; hyp: string; ms: number; mime: string; bytes: ArrayBuffer | Uint8Array;
}

export interface UrlPreview {
  title: string; text: string; truncated: boolean; paragraphs: number; chars: number; url: string;
}

// —— 每日好文 ——
export interface FeedSource {
  id: string; title: string; url: string; builtin: boolean; enabled: boolean;
  last_sync: number; etag: string; last_error: string;
}
export interface FeedItem {
  feed_id: string; guid: string; title: string; link: string; summary: string;
  author: string; published_at: number; fetched_at: number;
  status: "new" | "imported" | "dismissed";
  words: number | null; known: number | null; rate: number | null; cefr: string | null;
  text_id: number | null; feed_title: string;
  topic: string | null;   // #208 题材；null = 尚未分类
  gist: string;           // 一句话中文提要（云端生成）
}
