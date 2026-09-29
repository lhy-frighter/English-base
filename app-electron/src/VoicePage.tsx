import { useEffect, useRef, useState } from "react";
import { api, type ModelCatalogItem, type ModelProgress, type RegressionLang } from "./api";
import { asr } from "./asr/asr";
import { inference } from "./inference/coordinator";
import { decodeToPcm16k } from "./shadow/audio";
import { saveClip, CURRENT_MODEL } from "./regression";
import RegressionPanel from "./RegressionPanel";
import { Icon } from "./icons";
import { confirmDialog } from "./components/ui";

function mb(n?: number) { return n ? (n / 1048576).toFixed(1) + "MB" : ""; }

export default function VoicePage() {
  const [catalog, setCatalog] = useState<ModelCatalogItem[]>([]);
  const [mirror, setMirror] = useState("");
  const [prog, setProg] = useState<Record<string, ModelProgress>>({});
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState(asr.info);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<{ ms: number; text: string; words: { w: string; t: [number, number | null] }[] } | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastBlobRef = useRef<Blob | null>(null);
  const [capLang, setCapLang] = useState<RegressionLang>("en");
  const [capRef, setCapRef] = useState("");
  const [capBusy, setCapBusy] = useState(false);
  const [capMsg, setCapMsg] = useState("");
  const [mirrorOpen, setMirrorOpen] = useState(false);

  const refresh = () => api.modelCatalog().then(setCatalog).catch((e) => setErr(String(e.message)));
  useEffect(() => {
    refresh();
    api.modelGetMirror().then(setMirror);
    const off = api.onModelProgress((p) => setProg((s) => ({ ...s, [p.id]: p })));
    return off;
  }, []);

  const install = async (id: string) => {
    setErr(""); setBusy("dl-" + id);
    try { await api.modelEnsure(id); await refresh(); }
    catch (e) { setErr("下载失败：" + (e as Error).message); }
    finally { setBusy(""); }
  };
  const remove = async (id: string) => {
    const m = catalog.find((x) => x.id === id);
    const ok = await confirmDialog({
      title: `删除模型「${m?.name || id}」？`,
      body: "本机文件会被移除，之后需要重新下载才能使用。学习数据不受影响。",
      danger: true, okLabel: "删除", cancelLabel: "取消",
    });
    if (!ok) return;
    await api.modelDelete(id); await refresh();
  };
  const saveMirror = async () => {
    try { const r = await api.modelSetMirror(mirror); setMirror(r.mirror); setErr(""); }
    catch (e) { setErr((e as Error).message); }
  };

  const initEngine = async () => {
    setErr(""); setBusy("init");
    try { await inference.acquire("asr"); setInfo(await asr.init("wasm", CURRENT_MODEL)); } catch (e) { setErr("初始化失败：" + (e as Error).message); }
    finally { setBusy(""); }
  };

  const toggleRecord = async () => {
    if (recording) { recRef.current?.stop(); return; }
    setResult(null); setErr("");
    try {
      // 显式确保生产单例停在默认档位（回归评测可能加载过其它模型）
      await inference.acquire("asr");
      await asr.init("wasm", CURRENT_MODEL);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false); setBusy("asr");
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          lastBlobRef.current = blob; setCapMsg("");
          const pcm = await decodeToPcm16k(blob);
          const r = await asr.transcribe(pcm);
          setResult(r); setInfo(asr.info);
        } catch (e) { setErr("识别失败：" + (e as Error).message); }
        finally { setBusy(""); }
      };
      recRef.current = mr; mr.start(); setRecording(true);
    } catch (e) { setErr("无法开始录音：" + (e as Error).message); }
  };

  const isolated = self.crossOriginIsolated;

  const saveRegression = async () => {
    if (!lastBlobRef.current || !result) return;
    if (capLang !== "zh" && !capRef.trim()) { setErr("英文/混说样本请填写你实际说的参考文本"); return; }
    setCapBusy(true); setErr("");
    try {
      await saveClip({
        blob: lastBlobRef.current, lang: capLang, ref: capRef.trim(), source: "voice",
        hyp: result.text, ms: result.ms, model: asr.modelId,
      });
      setCapMsg("✓ 已存入回归集");
    } catch (e) { setErr("存入回归集失败：" + (e as Error).message); }
    finally { setCapBusy(false); }
  };

  return (
    <div className="vp">
      <div className="page-head"><h2>语音模型管理</h2>
        <span className="muted">离线语音识别（Whisper，本地运行，录音不上传）</span></div>

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="vp-row">
          <strong>运行环境</strong>
          <span className="vp-mono">{isolated ? "当前环境支持多线程加速" : "当前环境不支持多线程，已自动使用单线程（功能不受影响）"}</span>
          {info && <span className="okmsg">识别已就绪：{info.device} · {info.threads} 线程 · 就绪 {info.ms}ms</span>}
        </div>
        <div className="vp-row">
          <button className="primary" disabled={!!busy || asr.isReady} onClick={initEngine}>{busy === "init" ? "加载中…" : "初始化识别"}</button>
          <button className={recording ? "ghost2 rec-on" : "ghost2"} disabled={!!busy || !asr.isReady} onClick={() => void toggleRecord()}>
            <Icon name={recording ? "Stop" : "Voice"} size={14} /> {recording ? "停止并识别" : "录音测试"}
          </button>
          {busy === "asr" && <span className="muted">转写中…</span>}
        </div>
        {result && (
          <div>
            <div className="vp-mono">耗时 {result.ms}ms</div>
            <div style={{ marginTop: 6 }}>{result.text || "（未识别到内容）"}</div>
            <div className="vp-words">{result.words.map((x, i) => <span key={i}>{x.w} <em className="vp-mono">{x.t[0]}</em></span>)}</div>
          </div>
        )}
        {result && (
          <div className="vp-row" style={{ marginTop: 12, alignItems: "flex-end" }}>
            <label className="vp-mono">语言
              <select value={capLang} onChange={(e) => setCapLang(e.target.value as RegressionLang)} style={{ marginLeft: 6, padding: "6px 8px" }}>
                <option value="en">英文</option>
                <option value="zh">中文</option>
                <option value="mixed">中英混说</option>
              </select>
            </label>
            <input value={capRef} onChange={(e) => setCapRef(e.target.value)} style={{ flex: 1, minWidth: 220, padding: "7px 10px" }}
              placeholder={capLang === "zh" ? "参考中文（可留空，用于核对识别）" : "你实际说的参考句（英文/混说必填）"} />
            <button className="btn-primary" disabled={capBusy} onClick={() => void saveRegression()}>
              <Icon name="Plus" size={14} /> {capBusy ? "保存中…" : "存入回归集"}
            </button>
            {capMsg && <span className="okmsg">{capMsg}</span>}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="sec-head" style={{ margin: "0 0 12px" }}>
          <div>
            <h3>语音模型</h3>
            <p>模型只下载到本机，之后完全离线使用；下载地址（镜像）可自行更换。</p>
          </div>
          <button className="conv-hist-btn" onClick={() => setMirrorOpen(true)}><Icon name="Settings" size={14} /> 下载镜像</button>
        </div>
        <div className="model-grid">
          {catalog.map((m) => {
            const p = prog[m.id];
            const transferring = p && (p.phase === "download" || p.phase === "progress");
            return (
              <div key={m.id} className={"model-card" + (m.state === "installed" ? " installed" : "")}>
                <div className="mc-head">
                  <span className="mc-ico"><Icon name={m.state === "installed" ? "CheckCircle" : "Download"} size={17} /></span>
                  <div className="mc-title">
                    <b>{m.name}</b>
                    <span className="vp-mono">{m.sizeNote} · {m.dtype}</span>
                  </div>
                  <span className={"mc-state" + (m.state === "installed" ? " ok" : m.state === "partial" ? " part" : "")}>
                    {m.state === "installed" ? "已安装" : m.state === "partial" ? "未完成" : "未下载"}
                  </span>
                </div>
                <p className="vp-mono mc-lic">许可：{m.license.model}</p>
                {transferring && (
                  <>
                    <div className="prog-rail"><i style={{ width: (p.pct ?? 0) + "%" }} /></div>
                    <div className="vp-mono mc-prog">
                      {p.file} {p.pct ?? 0}% {mb(p.done)}{p.totalBytes ? "/" + mb(p.totalBytes) : ""}（{(p.index ?? 0) + 1}/{p.total}）
                    </div>
                  </>
                )}
                {p?.phase === "installed" && <div className="okmsg">安装完成 {mb(p.totalBytes)}</div>}
                <div className="mc-actions">
                  {m.state !== "installed" && (
                    <button className="btn-primary" disabled={!!busy} onClick={() => void install(m.id)}>
                      {busy === "dl-" + m.id ? "下载中…" : "下载"}
                    </button>
                  )}
                  {m.state === "installed" && (
                    <button className="ghost2" onClick={() => void remove(m.id)}><Icon name="Trash" size={14} /> 删除</button>
                  )}
                  {transferring && busy === "dl-" + m.id && (
                    <button className="ghost2" onClick={() => void api.modelCancel(m.id)}><Icon name="Stop" size={14} /> 取消</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {mirrorOpen && (
        <>
          <div className="drawer-mask" onClick={() => setMirrorOpen(false)} />
          <div className="drawer-right" role="dialog" aria-label="下载镜像">
            <div className="drawer-head">
              <h3>下载镜像</h3>
              <button className="gbtn" style={{ marginLeft: "auto" }} aria-label="关闭" onClick={() => setMirrorOpen(false)}><Icon name="X" size={16} /></button>
            </div>
            <div className="drawer-body">
              <p className="muted" style={{ fontSize: 12.5, marginTop: 0, lineHeight: 1.8 }}>
                模型下载地址可自行更换，留空用默认。改完点保存，只影响后续下载。
              </p>
              <input className="form-input" value={mirror} onChange={(e) => setMirror(e.target.value)} placeholder="https://hf-mirror.com" />
              <div className="vp-row" style={{ marginTop: 12 }}>
                <button className="btn-primary" onClick={() => void saveMirror()}>保存</button>
              </div>
            </div>
          </div>
        </>
      )}

      <RegressionPanel />

      {err && <div className="err">{err}</div>}
    </div>
  );
}
