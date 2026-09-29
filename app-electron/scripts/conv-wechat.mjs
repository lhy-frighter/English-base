import fs from "node:fs";
let s = fs.readFileSync("src/conversation/ConversationPage.tsx", "utf8");
if (s.includes("conv-list-main")) { console.log("already done"); process.exit(0); }

// 1) 扩展 ui 引入
s = s.replace(`import { Seg, toast } from "../components/ui";`,
  `import { Seg, toast, Modal, EmptyState } from "../components/ui";`);

// 2) histOpen 状态 → newOpen/settingsOpen
s = s.replace(`  const [histOpen, setHistOpen] = useState(false);`,
`  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);`);

// 3) 整体替换 setup 视图
const start = s.indexOf(`  // ==================== Setup ====================`);
const end = s.indexOf(`  // ==================== Chat ====================`);
if (start < 0 || end < 0 || end <= start) { console.error("setup block anchors missing"); process.exit(1); }

const NEW_SETUP = `  // ==================== Setup（微信式：会话列表为主，新建走模态，设置走抽屉） ====================
  if (view === "setup") {
    return (
      <div className="page">
        <div className="page-head">
          <h2>对话</h2>
          <span className="muted">和 AI 练口语 · 逐轮轻纠错 · 结束有复盘</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="conv-hist-btn" onClick={() => setSettingsOpen(true)}>
              <Icon name="Settings" size={15} />设置
            </button>
            <button className="btn-primary" onClick={() => setNewOpen(true)}>
              <Icon name="Plus" size={15} />新对话
            </button>
          </span>
        </div>

        <div className="conv-list-main card">
          {history.length === 0 ? (
            <EmptyState seed="conv-list" text="还没有对话。点右上「新对话」，选个话题开始第一次口语练习。"
              action={<button className="btn-primary" onClick={() => setNewOpen(true)}>开始第一次对话</button>} />
          ) : history.map((h) => (
            <button key={h.sessionKey} className="conv-list-row" onClick={() => { void openHistory(h); }}>
              <span className="conv-row-avatar">{(h.title || "对话").trim().charAt(0).toUpperCase()}</span>
              <span className="conv-row-main">
                <b>{h.title}</b>
                <span>{fmtWhen(h.startedAt)} · {h.turnsCount} 轮 · {h.status === "open" ? "进行中" : h.status === "closed" ? "已结束" : "已放弃"}</span>
              </span>
              <span className="tb-go"><Icon name="ChevronRight" size={16} /></span>
            </button>
          ))}
        </div>

        {newOpen && (
          <Modal title="新对话" onClose={() => setNewOpen(false)} width={520}>
            <label className="conv-label">对话引擎</label>
            <Seg ariaLabel="对话引擎" value={engine} onChange={setEngine}
              options={[{ value: "cloud", label: "云端 GLM" }, { value: "local", label: "本地 3B" }]} />
            <label className="conv-label">话题目标</label>
            <input className="conv-input" value={formGoal} onChange={(e) => setFormGoal(e.target.value)}
              placeholder="想聊什么？" />
            <div className="conv-presets">
              {TOPIC_PRESETS.map((t) => (
                <button key={t} className={formGoal === t ? "chip chip-on" : "chip"} onClick={() => setFormGoal(t)}>{t}</button>
              ))}
            </div>
            <div className="conv-row">
              <div>
                <label className="conv-label">难度锚点</label>
                <Seg ariaLabel="难度锚点" value={formCefr} onChange={setFormCefr}
                  options={CEFR_LEVELS.map((c) => ({ value: c, label: c }))} />
              </div>
              <div>
                <label className="conv-label">建议轮数</label>
                <Seg ariaLabel="建议轮数" value={String(formTurns)} onChange={(v) => setFormTurns(Number(v))}
                  options={["6", "8", "10", "12"].map((n) => ({ value: n, label: n }))} />
              </div>
            </div>
            <button className="btn-primary conv-start" style={{ width: "100%" }}
              onClick={() => { setNewOpen(false); void startSession(); }}>开始对话</button>
          </Modal>
        )}

        {settingsOpen && (
          <>
            <div className="drawer-mask" onClick={() => setSettingsOpen(false)} />
            <div className="drawer-right">
              <div className="drawer-head">
                <h3>云端设置</h3>
                <button className="ghost2" style={{ marginLeft: "auto", padding: "5px 14px" }} onClick={() => setSettingsOpen(false)}>关闭</button>
              </div>
              <div className="drawer-body">
                {!cloud ? <p className="muted" style={{ padding: "8px 10px" }}>加载中…</p> : (
                  <div className="conv-cloud">
                    <p className="muted conv-cloud-note">
                      云端为默认引擎；失败不会自动联网兜底。只有你逐项授权后，对应数据才会发送；授权可随时在此关闭。
                    </p>
                    <label className="cloud-toggle">
                      <input type="checkbox" checked={cloud.profile} onChange={() => { void toggleCloud("profile"); }} />
                      <span>上传学习画像（词汇掌握与能力数据，用于云端分析）</span>
                    </label>
                    <label className="cloud-toggle">
                      <input type="checkbox" checked={cloud.historyText} onChange={() => { void toggleCloud("historyText"); }} />
                      <span>上传历史对话文本（用于更强的云端大脑与纠错）</span>
                    </label>
                    <label className="cloud-toggle">
                      <input type="checkbox" checked={cloud.audio} onChange={() => { void toggleCloud("audio"); }} />
                      <span>上传录音原文（用于云端发音分析）</span>
                    </label>
                    <label className="cloud-toggle">
                      <input type="checkbox" checked={cloud.grammarCloud} onChange={() => { void toggleCloud("grammarCloud"); }} />
                      <span>文本送云端做语法深度分析（逐句批改并生成语法练习）</span>
                    </label>
                    <label className="conv-label">云端端点（OpenAI 兼容，可留空）</label>
                    <input className="conv-input" value={cloud.baseUrl}
                      placeholder="https://api.example.com/v1"
                      onChange={(e) => {
                        const next = { ...cloud, baseUrl: e.target.value, updatedAt: Date.now() };
                        setCloud(next);
                        api.cloudSaveConsent(next).catch(() => {});
                      }} />
                    <label className="conv-label">模型名</label>
                    <input className="conv-input" value={cloud.model}
                      placeholder="glm-4.7-flash"
                      onChange={(e) => {
                        const next = { ...cloud, model: e.target.value, updatedAt: Date.now() };
                        setCloud(next);
                        api.cloudSaveConsent(next).catch(() => {});
                      }} />
                    <label className="conv-label">API Key{keySet ? "（已加密保存）" : ""}</label>
                    {keySet ? (
                      <div className="cloud-key-row">
                        <span className="muted">已保存，随系统密钥链加密</span>
                        <button className="ghost2" onClick={() => { void clearKey(); }}>清除</button>
                      </div>
                    ) : (
                      <div className="cloud-key-row">
                        <input className="conv-input" type="password" value={keyInput}
                          placeholder="粘贴 key，本地加密存储"
                          onChange={(e) => setKeyInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") void saveKey(); }} />
                        <button className="btn-primary" disabled={!keyInput.trim()} onClick={() => { void saveKey(); }}>保存</button>
                      </div>
                    )}
                    {cloudMsg && <em className="err-text">{cloudMsg}</em>}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

`;
s = s.slice(0, start) + NEW_SETUP + s.slice(end);
fs.writeFileSync("src/conversation/ConversationPage.tsx", s);
console.log("setup WeChat-ified");
