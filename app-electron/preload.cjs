const { contextBridge, ipcRenderer, webUtils } = require("electron");

const call = (name, args) => ipcRenderer.invoke("cmd", name, args ?? {});

contextBridge.exposeInMainWorld("electronAPI", {
  annotate: (text, title, source) => call("annotate", { text, title, source }),
  fetchUrl: (url) => call("fetchUrl", { url }),
  onIngested: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on("ingested", h);
    return () => ipcRenderer.removeListener("ingested", h);
  },
  lookup: (word, label, phrase, textId) => call("lookup", { word, label, phrase, textId }),
  dashboard: () => call("dashboard"),
  listTexts: (p) => call("listTexts", p ?? {}),
  getText: (id) => call("getText", { id }),
  textDelete: (id) => call("textDelete", { id }),
  sessionBegin: (o) => call("sessionBegin", o),
  sessionHeartbeat: (sessionKey, activeMs, amount, locator) => call("sessionHeartbeat", { sessionKey, activeMs, amount, locator }),
  sessionClose: (sessionKey, activeMs, amount, locator) => call("sessionClose", { sessionKey, activeMs, amount, locator }),
  // —— V8-2b 对话 ——
  convCreate: (o) => call("convCreate", o),
  convList: (limit) => call("convList", { limit }),
  convGet: (sessionKey) => call("convGet", { sessionKey }),
  convAddTurn: (o) => call("convAddTurn", o),
  convUpdateTurn: (o) => call("convUpdateTurn", o),
  convClose: (o) => call("convClose", o),
  // —— V8-2d 云端同意 + key ——
  cloudGetConsent: () => call("cloudGetConsent"),
  cloudSaveConsent: (consent) => call("cloudSaveConsent", { consent }),
  cloudSetKey: (apiKey) => call("cloudSetKey", { apiKey }),
  cloudProbe: (p) => call("cloudProbe", p),
  cloudClearKey: () => call("cloudClearKey"),
  cloudGetKey: () => call("cloudGetKey"),
  resumePut: (scope, refId, locator, contentHash) => call("resumePut", { scope, refId, locator, contentHash }),
  resumeGet: (scope) => call("resumeGet", { scope }),
  builtinsList: () => call("builtinsList"),
  getBuiltin: (id) => call("builtinGet", { id }),
  transForText: (textId) => call("transForText", { textId }),
  // —— S7b 离线机翻缓存 ——
  mtCacheGet: (textId) => call("mtCacheGet", { textId }),
  mtCachePut: (p) => call("mtCachePut", p),
  mtCacheClear: (textId) => call("mtCacheClear", { textId }),
  createNote: (p) => call("createNote", p),
  createStandaloneNote: (p) => call("createStandaloneNote", p),
  createShadowNote: (p) => call("createShadowNote", p),
  captureAsset: (inp) => call("captureAsset", inp),
  debriefAutoArchive: (p) => call("debriefAutoArchive", p),
  feedItemsNeedingTopic: (p) => call("feedItemsNeedingTopic", p),
  feedApplyTopics: (p) => call("feedApplyTopics", p),
  feedTopicsOverview: () => call("feedTopicsOverview"),
  feedItemsByTopic: (p) => call("feedItemsByTopic", p),
  pruneStaleFeedItems: (p) => call("pruneStaleFeedItems", p),
  addPronProductionCard: (assetId) => call("addPronProductionCard", { assetId }),
  findAssetByCanonical: (kind, canonical) => call("findAssetByCanonical", { kind, canonical }),
  addAssetEvidence: (inp) => call("addAssetEvidence", inp),
  debriefPut: (inp) => call("debriefPut", inp),
  debriefList: () => call("debriefList"),
  debriefGet: (draftKey) => call("debriefGet", { draftKey }),
  debriefSetStatus: (draftKey, status) => call("debriefSetStatus", { draftKey, status }),
  textDebriefCandidates: (textId) => call("textDebriefCandidates", { textId }),
  textLearnedSummary: (textId) => call("textLearnedSummary", { textId }),
  conversationSummary: (sessionKey) => call("conversationSummary", { sessionKey }),
  detectUsedAssets: (inp) => call("detectUsedAssets", inp),
  assetUseCounts: (assetId) => call("assetUseCounts", { assetId }),
  priorityList: (p) => call("priorityList", p),
  examWeakList: (p) => call("examWeakList", p),
  shadowPassedForSentences: (sentences) => call("shadowPassedForSentences", { sentences }),
  shadowPassedForTurn: (turnId) => call("shadowPassedForTurn", { turnId }),
  phonetics: (words) => call("phonetics", { words }),
  getDue: (limit) => call("getDue", { limit }),
  answer: (cardId, rating, elapsedMs) => call("answer", { cardId, rating, elapsedMs }),
  counts: () => call("counts"),
  todayBrief: () => call("todayBrief"),
  recycleCandidates: (p) => call("recycleCandidates", p),
  recycleAdd: (words) => call("recycleAdd", words),
  shadowPractice: (p) => call("shadowPractice", p),
  shadowDue: (limit) => call("shadowDue", { limit }),
  shadowDismiss: (id) => call("shadowDismiss", id),
  assessmentBlueprints: () => call("assessmentBlueprints"),
  assessmentStart: (id) => call("assessmentStart", id),
  assessmentFinish: (p) => call("assessmentFinish", p),
  assessmentHistory: (limit) => call("assessmentHistory", { limit }),
  insights: (days) => call("insights", { days }),
  dayTimeline: (key) => call("dayTimeline", { key }),
  listLexemes: (p) => call("listLexemes", p ?? {}),
  lexemeDetail: (id) => call("lexemeDetail", { id }),
  relatedWords: (lemma) => call("relatedWords", { lemma }),
  syllabusList: () => call("syllabusList"),
  syllabusWords: (p) => call("syllabusWords", p),
  importPaper: (md, audioPaths) => call("importPaper", { md, audioPaths }),
  listPapers: () => call("listPapers"),
  getPaper: (id) => call("getPaper", { id }),
  mediaUrl: (name) => call("mediaUrl", { name }),
  gradeAttempt: (paperId, answers, startedAt) => call("gradeAttempt", { paperId, answers, startedAt }),
  listWrong: (state) => call("listWrong", { state }),
  wrongDueCount: () => call("wrongDueCount"),
  setWrongReason: (id, reason) => call("setWrongReason", { id, reason }),
  redoWrong: (id, picked) => call("redoWrong", { id, picked }),
  archiveWrong: (id) => call("archiveWrong", { id }),
  // —— V6 语音模型 ——
  modelCatalog: () => call("modelCatalog"),
  modelStatus: (id) => call("modelStatus", { id }),
  modelEnsure: (id) => call("modelEnsure", { id }),
  modelCancel: (id) => call("modelCancel", { id }),
  modelDelete: (id) => call("modelDelete", { id }),
  modelGetMirror: () => call("modelGetMirror"),
  modelSetMirror: (mirror) => call("modelSetMirror", { mirror }),
  modelGetMtMirror: () => call("modelGetMtMirror"),
  modelSetMtMirror: (mirror) => call("modelSetMtMirror", { mirror }),
  modelBaseUrl: () => call("modelBaseUrl"),
  modelRuntime: (id) => call("modelRuntime", { id }),
  // —— 语音回归集 ——
  regressionList: () => call("regressionList"),
  regressionSave: (p) => call("regressionSave", p),
  regressionRead: (id) => call("regressionRead", { id }),
  regressionDelete: (id) => call("regressionDelete", { id }),
  regressionSetEval: (p) => call("regressionSetEval", p),
  // —— S3/S4 每日好文 ——
  feedsList: () => call("feedsList"),
  feedsRefresh: (p) => call("feedsRefresh", p ?? {}),
  feedsRefreshOne: (p) => call("feedsRefreshOne", p),
  feedsAdd: (p) => call("feedsAdd", p),
  feedsRemove: (p) => call("feedsRemove", p),
  feedsToggle: (p) => call("feedsToggle", p),
  feedItems: (p) => call("feedItems", p ?? {}),
  feedItemStatus: (p) => call("feedItemStatus", p),
  feedAnalyze: (p) => call("feedAnalyze", p ?? {}),
  feedImport: (p) => call("feedImport", p),
  onModelProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on("model-progress", h);
    return () => ipcRenderer.removeListener("model-progress", h);
  },
  // —— S14-1B/1C Realtime 中继：Key 只在主进程；MessagePort 不能走 contextBridge
  // （跨隔离 Promise 解析会丢掉 postMessage），改用 window.postMessage 在 DOM 层转移 port ——
  realtimeOpen: (opts) => { ipcRenderer.send("realtime-open", opts ?? {}); },
  importFiles: (paths) => call("importFiles", { paths }),
  pathForFile: (file) => webUtils.getPathForFile(file),
});

// 主进程返回 port / 打开错误 → 经 window 消息转发到主世界（port 可转移、ArrayBuffer 原生可用）
ipcRenderer.on("realtime-port", (ev) => {
  window.postMessage({ __realtimePort: true }, "*", [ev.ports[0]]);
});
ipcRenderer.on("realtime-port-error", (_ev, info) => {
  window.postMessage({ __realtimePortError: true, message: info?.message || "中继打开失败" }, "*");
});
