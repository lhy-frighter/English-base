# -*- coding: utf-8 -*-
"""S13-0a step1b: 本地 FLAC → float32 PCM（离线）。"""
import json, os
import soundfile as sf

ROOT = os.path.dirname(os.path.abspath(__file__))
raw = json.load(open(os.path.join(ROOT, "smartturn-raw-meta.json"), encoding="utf-8"))
if isinstance(raw, dict):
    raw = raw.get("items", [raw])
CLIP_DIR = os.path.join(ROOT, "smartturn-clips")
os.makedirs(CLIP_DIR, exist_ok=True)

meta = []
for m in raw:
    pcm, sr = sf.read(os.path.join(ROOT, "smartturn-raw", m["raw"]), dtype="float32")
    if pcm.ndim > 1:
        pcm = pcm[:, 0]
    name = m["raw"].replace(".flac", ".f32")
    pcm.tofile(os.path.join(CLIP_DIR, name))
    d = dict(m); d.update({"file": name, "sr": int(sr), "samples": int(len(pcm))})
    d.pop("raw", None)
    meta.append(d)
    print(name, sr, len(pcm))

json.dump(meta, open(os.path.join(ROOT, "smartturn-meta.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("decoded:", len(meta))
