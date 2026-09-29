# -*- coding: utf-8 -*-
"""S13-0a step1: 从 HF datasets-server 选取并下载冻结样本（英文+中文，标签均衡）。"""
import json, os, urllib.request, urllib.parse, time, io
import soundfile as sf
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
CLIP_DIR = os.path.join(ROOT, "smartturn-clips")
os.makedirs(CLIP_DIR, exist_ok=True)

DATASET = "pipecat-ai/smart-turn-data-v3.2-test"
BASE = "https://datasets-server.huggingface.co/rows?" + urllib.parse.urlencode({
    "dataset": DATASET, "config": "default", "split": "train", "length": 100
})

def fetch(url, binary=False, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "spike/1.0"})
            data = urllib.request.urlopen(req, timeout=90).read()
            return data if binary else data.decode("utf-8")
        except Exception as e:
            print("retry", i, str(e)[:100]); time.sleep(2)
    raise RuntimeError("fetch failed: " + url)

rows = []
for off in range(0, 600, 100):
    j = json.loads(fetch(BASE + f"&offset={off}"))
    rows.extend(j["rows"])
print("fetched metadata rows:", len(rows))

def bucket(r):
    d = r["row"]
    return d.get("language"), bool(d["endpoint_bool"])

# 目标：英文 26（标签各13）、中文 24（标签各12）
targets = {("eng", True): 13, ("eng", False): 13,
           ("zho", True): 12, ("zho", False): 12}
picked, counts = [], {}
for r in rows:
    key = bucket(r)
    if key in targets and counts.get(key, 0) < targets[key]:
        picked.append(r); counts[key] = counts.get(key, 0) + 1
# 中文不足时用英文补齐
for key, n in list(targets.items()):
    have = counts.get(key, 0)
    if have < n and key[0] == "zho":
        need = n - have
        lab = key[1]
        for r in rows:
            if need == 0: break
            k2 = bucket(r)
            if k2 == ("eng", lab) and r not in picked and counts.get(k2, 0) < targets[("eng", lab)] + 12:
                picked.append(r); counts[k2] = counts.get(k2, 0) + 1; need -= 1
print("picked:", len(picked), counts)

meta = []
for i, r in enumerate(picked):
    d = r["row"]
    url = d["audio"]["src"]
    flac = fetch(url, binary=True)
    pcm, sr = sf.read(io.BytesIO(flac), dtype="float32")
    if pcm.ndim > 1:
        pcm = pcm[:, 0]
    name = f"clip-{i:02d}-{d['language']}-{int(d['endpoint_bool'])}.f32"
    pcm.tofile(os.path.join(CLIP_DIR, name))
    meta.append({
        "file": name, "id": d.get("id"), "language": d.get("language"),
        "endpoint": bool(d["endpoint_bool"]), "sr": int(sr),
        "samples": int(len(pcm)),
        "spoken_text": d.get("spoken_text"),
        "midfiller": d.get("midfiller"), "endfiller": d.get("endfiller"),
        "synthetic": d.get("synthetic"), "dataset": d.get("dataset"),
    })
    print(i, d["language"], d["endpoint_bool"], sr, len(pcm), str(d.get("spoken_text"))[:60])

with open(os.path.join(ROOT, "smartturn-meta.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
print("done")
