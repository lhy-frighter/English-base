# -*- coding: utf-8 -*-
"""S13-0a step C: 本地 FLAC → f32 PCM + meta（从 picked.json 取标签）。"""
import json, os
import soundfile as sf

ROOT = os.path.dirname(os.path.abspath(__file__))
picked = json.load(open(os.path.join(ROOT, "smartturn-picked.json"), encoding="utf-8-sig"))
CLIP_DIR = os.path.join(ROOT, "smartturn-clips")
os.makedirs(CLIP_DIR, exist_ok=True)

meta = []
for i, item in enumerate(picked):
    d = item["row"]
    raw_name = "clip-{:02}-{}-{}.flac".format(i, d["language"], int(d["endpoint_bool"]))
    pcm, sr = sf.read(os.path.join(ROOT, "smartturn-raw", raw_name), dtype="float32")
    if pcm.ndim > 1:
        pcm = pcm[:, 0]
    name = raw_name.replace(".flac", ".f32")
    pcm.tofile(os.path.join(CLIP_DIR, name))
    meta.append({"file": name, "id": d.get("id"), "language": d.get("language"),
                 "endpoint": bool(d["endpoint_bool"]), "sr": int(sr),
                 "samples": int(len(pcm)), "spoken_text": d.get("spoken_text"),
                 "midfiller": d.get("midfiller"), "endfiller": d.get("endfiller"),
                 "synthetic": d.get("synthetic"), "dataset": d.get("dataset")})
json.dump(meta, open(os.path.join(ROOT, "smartturn-meta.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("decoded:", len(meta))
from collections import Counter
print(Counter((m["language"], m["endpoint"]) for m in meta))
print("sample rates:", Counter(m["sr"] for m in meta))
