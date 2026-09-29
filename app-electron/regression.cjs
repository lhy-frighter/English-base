// 语音回归样本仓库（主进程）：把"录音 + 参考句 + 语言标签 + 当时识别结果"持久化到 data/regression，
// 供语音页用不同模型批量重跑、横向对比档位（ADR-3 技术闸门：真人回归集定 tiny/base/small）。
// 文件名服务端生成（不接受用户传入路径），manifest 原子改写；录音仅本地，不上传。
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_BYTES = 25 * 1024 * 1024;
const LANGS = new Set(["en", "zh", "mixed"]);

class RegressionStore {
  constructor(dataDir) {
    this.dir = path.join(dataDir, "regression");
    fs.mkdirSync(this.dir, { recursive: true });
    this.manifestPath = path.join(this.dir, "manifest.json");
    this.clips = new Map();
    this.#load();
  }

  #load() {
    try {
      const arr = JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
      if (Array.isArray(arr)) for (const c of arr) if (c && c.id) this.clips.set(c.id, c);
    } catch { /* 首次/损坏则空仓库（不影响主功能） */ }
  }

  #flush() {
    const tmp = this.manifestPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify([...this.clips.values()], null, 2));
    fs.renameSync(tmp, this.manifestPath);
  }

  list() {
    return [...this.clips.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  save(p) {
    const lang = LANGS.has(p.lang) ? p.lang : "en";
    const ref = String(p.ref || "").trim();
    const bytes = p.bytes;
    const n = bytes ? (bytes.byteLength ?? bytes.length ?? 0) : 0;
    if (!n) throw new Error("缺少录音数据");
    if (n > MAX_BYTES) throw new Error("录音过大（>25MB）");
    const mime = String(p.mime || "audio/webm");
    const ext = /ogg/i.test(mime) ? ".ogg" : /wav/i.test(mime) ? ".wav" : ".webm";
    const id = "r" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
    const file = id + ext;
    fs.writeFileSync(path.join(this.dir, file), Buffer.from(bytes)); // 文件名服务端生成，无穿越风险
    const clip = {
      id, file, mime, lang,
      ref,
      source: p.source === "voice" ? "voice" : "shadow",
      model: String(p.model || ""),
      hyp: String(p.hyp || ""),
      ms: Math.round(p.ms || 0),
      createdAt: Date.now(),
      evals: {}, // 按模型留存历次评测结果，供跨档位对比
    };
    this.clips.set(id, clip);
    this.#flush();
    return clip;
  }

  read(id) {
    const c = this.clips.get(id);
    if (!c) throw new Error("样本不存在");
    const fp = path.join(this.dir, c.file);
    if (!fs.existsSync(fp)) throw new Error("录音文件缺失");
    const buf = fs.readFileSync(fp);
    return { mime: c.mime, bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.length), clip: c };
  }

  remove(id) {
    const c = this.clips.get(id);
    if (!c) return { deleted: false };
    try { fs.rmSync(path.join(this.dir, c.file), { force: true }); } catch { /* 清单优先 */ }
    this.clips.delete(id);
    this.#flush();
    return { deleted: true };
  }

  setEval(p) {
    const c = this.clips.get(p.id);
    if (!c) throw new Error("样本不存在");
    const model = String(p.model || "unknown");
    c.evals[model] = { at: Date.now(), ...p.result };
    this.#flush();
    return c.evals[model];
  }
}

module.exports = { RegressionStore };
