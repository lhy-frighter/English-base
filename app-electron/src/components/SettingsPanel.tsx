// src/components/SettingsPanel.tsx — 统一的 API 配置入口（#206）
//
// 背景：云端配置此前散落在两处——对话页的抽屉里一份、通话页里又一份。
// 后果实测可见：通话页的缺 Key 提示写着「在『对话』页云端设置中保存」，
// 而语法分析、翻译批改这些新功能都还要再依赖同一份配置。用户找不到，也没法统一管。
//
// 这里把端点 / 模型 / Key / 各类授权开关收成一处独立页面：
//   - 对话页与通话页不再自带云端设置，只保留「去设置」的跳转；
//   - 新增功能（翻译批改的云端语法剖析）在这里有明确的落点。
//
// 安全边界（沿用既有约束，不做任何放宽）：
//   API Key 只经主进程 safeStorage（Windows 密钥链）加密，渲染层只拿到「有没有」，
//   明文永不落盘、永不下发；baseUrl/model/授权位是普通配置，存 app_settings。
import { useCallback, useEffect, useState } from "react";
import { api, type CloudConsent } from "../api";
import { Icon } from "../icons";
import { toast } from "./ui";
import { persist } from "../persist";

const CONSENT_ROWS: { key: keyof CloudConsent; label: string; desc: string }[] = [
  { key: "grammarCloud", label: "文本送云端做语法深度分析", desc: "开启后，语法诊断与翻译批改的深度分析会把文本发到云端模型。本地判定始终先做且免费。" },
  { key: "topicClassify", label: "好文题材分类", desc: "把好文的标题+摘要送云端，标注所属题材用于分区浏览。只在��击「整理题材」时发送，不自动跑。" },
  { key: "profile", label: "学习画像", desc: "把本地学习统计汇总后送云端分析。" },
  { key: "historyText", label: "历史对话文本", desc: "对话历史正文可送云端做复盘分析。" },
  { key: "audio", label: "录音原文", desc: "通话/跟读的录音转写文本可送云端。通话必须开启才能实时识别。" },
];

export function SettingsPanel({ onClose }: { onClose?: () => void }) {
  const [consent, setConsent] = useState<CloudConsent | null>(null);
  const [keySet, setKeySet] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.cloudGetConsent();
      setConsent(r.consent); setKeySet(r.keySet);
    } catch (e) {
      console.error("[settings] 读取云端配置失败", e);
      setMsg("读取配置失败：" + String((e as Error)?.message || e));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const save = (next: CloudConsent, what: string) =>
    void persist(`cloudSaveConsent(${what})`, api.cloudSaveConsent(next),
      () => toast(`${what}未保存：写入本机失败，重启后会丢失`, "err")).then((saved) => {
        if (saved) setConsent(saved);
      });

  const toggle = (key: keyof CloudConsent) => {
    if (!consent) return;
    save({ ...consent, [key]: !consent[key], updatedAt: Date.now() },
      CONSENT_ROWS.find((r) => r.key === key)?.label || String(key));
  };

  const saveKey = async () => {
    const k = keyInput.trim();
    if (!k) return;
    try {
      await api.cloudSetKey(k);
      setKeySet(true); setKeyInput(""); setMsg("");
      toast("API Key 已加密保存在本机");
    } catch (e) { setMsg(String((e as Error)?.message || "保存失败")); }
  };
  const clearKey = async () => {
    await persist("cloudClearKey", api.cloudClearKey());
    setKeySet(false); setMsg("");
  };

  const testConn = async () => {
    if (!consent?.baseUrl || !consent?.model) { setMsg("先填端点与模型名"); return; }
    if (!keySet) { setMsg("还没有保存 API Key"); return; }
    setMsg("正在测试…");
    try {
      const r = await api.cloudProbe({ baseUrl: consent.baseUrl, model: consent.model });
      setMsg(r.ok ? `连接正常：${r.model || consent.model}` : "连接失败：" + (r.reason || "未知原因"));
    } catch (e) { setMsg("测试失败：" + String((e as Error)?.message || e)); }
  };

  return (
    <div className="page settings-page">
      <div className="page-head">
        <h2>设置</h2>
        <span className="muted">端点、模型与云端授权的统一入口 · Key 只经系统密钥链加密，不落盘</span>
        {onClose && (
          <button className="ghost2" style={{ marginLeft: "auto" }} onClick={onClose}>关闭</button>
        )}
      </div>

      {loading ? <p className="muted">加载中…</p> : !consent ? (
        <p className="muted">配置读取失败{msg ? "：" + msg : ""}</p>
      ) : (
        <>
          <div className="zone">
            <h3>云端端点与模型</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              OpenAI 兼容端点。留空则所有云端功能自动降级为本地模式。
            </p>
            <label className="set-label">端点</label>
            <input className="form-input" value={consent.baseUrl} placeholder="https://api.example.com/v1"
              onChange={(e) => save({ ...consent, baseUrl: e.target.value, updatedAt: Date.now() }, "端点")} />
            <label className="set-label">模型名</label>
            <input className="form-input" value={consent.model} placeholder="glm-4.5-flash"
              onChange={(e) => save({ ...consent, model: e.target.value, updatedAt: Date.now() }, "模型名")} />
            <div className="set-row">
              <button className="ghost2" onClick={testConn}><Icon name="Retry" size={13} />测试连接</button>
              <span className="muted set-note">只在此时发出一次请求，不产生学习数据</span>
            </div>
          </div>

          <div className="zone">
            <h3>API Key</h3>
            {keySet ? (
              <div className="set-row">
                <span className="muted">已保存，随系统密钥链加密（明文不落盘、不下发渲染层）</span>
                <button className="ghost2" onClick={() => { void clearKey(); }}>清除</button>
              </div>
            ) : (
              <div className="set-row">
                <input className="form-input" type="password" value={keyInput} placeholder="粘贴 key，本地加密存储"
                  style={{ flex: "1 1 280px" }}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void saveKey(); }} />
                <button className="btn-primary" disabled={!keyInput.trim()} onClick={() => { void saveKey(); }}>保存</button>
              </div>
            )}
          </div>

          <div className="zone">
            <h3>云端授权</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              默认全关。逐项开启后，对应功能才允许把内容发往云端——本地判定始终先跑且不消耗额度。
            </p>
            {CONSENT_ROWS.map((r) => (
              <label key={String(r.key)} className="set-switch">
                <input type="checkbox" checked={Boolean(consent[r.key])} onChange={() => toggle(r.key)} />
                <span className="ss-text">
                  <b>{r.label}</b>
                  <em>{r.desc}</em>
                </span>
              </label>
            ))}
          </div>
          {msg && <p className="set-msg">{msg}</p>}
        </>
      )}
    </div>
  );
}