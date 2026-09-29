# -*- coding: utf-8 -*-
"""
V0 手工标注预演：用 ECDICT 数据模拟 v1.6 方案 §7.2 匹配管线，
量化"可解析 token 未命中率"（Go 门槛 3：≤5%）并产出 golden 语料种子。
本脚本是一次性测量工具，不是产品代码。
"""
import csv, json, re, statistics, sys
from collections import Counter
from pathlib import Path

BASE = Path(__file__).parent
DATA = BASE / "data"
OUT = BASE / "results"
GOLD = OUT / "golden"
GOLD.mkdir(parents=True, exist_ok=True)

WORD_RE = re.compile(r"[A-Za-z]+(?:['’\-][A-Za-z]+)*|[A-Za-z]*\d[A-Za-z0-9\-]*")
CONTRACTIONS = {"s", "t", "re", "ve", "ll", "d", "m"}

def norm(s):
    return re.sub(r"\s+", " ", s.strip().lower())

# ---------- 1. 载入 ECDICT ----------
def load_ecdict():
    words, mwes, lemma_of, forms_of, bnc = set(), set(), {}, {}, {}
    n = 0
    with open(DATA / "ecdict.csv", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            n += 1
            w = row["word"].strip().lower()
            if not w:
                continue
            if " " in w:
                if re.fullmatch(r"[a-z0-9 '\-]+", w):
                    mwes.add(norm(w))
            else:
                if re.fullmatch(r"[a-z][a-z'\-]*", w):
                    words.add(w)
                try:
                    bnc[w] = int(row["bnc"]) if row["bnc"] else 0
                except ValueError:
                    bnc[w] = 0
            ex = row["exchange"]
            if ex:
                kind = None
                for item in ex.split("/"):
                    if ":" in item:
                        kind, val = item.split(":", 1)
                    else:
                        val = item
                    val = val.strip().lower()
                    if not val:
                        continue
                    if kind == "0":
                        lemma_of[w] = val
                    elif kind in ("p", "d", "i", "3", "r", "t", "s"):
                        forms_of.setdefault(val, w)
    with open(DATA / "lemma.en.txt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith(";") or " -> " not in line:
                continue
            left, right = line.split(" -> ", 1)
            lemma = left.split("/")[0].strip().lower()
            for flex in right.split(","):
                flex = flex.strip().lower()
                if flex and flex != lemma:
                    lemma_of.setdefault(flex, lemma)
    return words, mwes, lemma_of, forms_of, bnc, n

# ---------- 2. 语料制备 ----------
def brown_text(files, per_file_words):
    out = []
    for fp, k in zip(files, per_file_words):
        toks = []
        for line in open(DATA / fp, encoding="utf-8", errors="ignore"):
            for tk in line.split():
                word = tk.rsplit("/", 1)[0] if "/" in tk else tk
                toks.append(word)
        out.append(" ".join(toks[:k]))
    return "\n".join(out)

def gutenberg_text(fp, nwords):
    lines = open(DATA / fp, encoding="utf-8", errors="ignore").read().splitlines()
    body, started = [], False
    for ln in lines:
        if not started:
            if ln.strip().startswith("[") or re.fullmatch(r"\s*[IVX]+\.\s+[A-Z ]+", ln.strip()):
                continue
            if ln.strip():
                started = True
        body.append(ln)
        if len(re.findall(r"[A-Za-z']+", " ".join(body))) >= nwords:
            break
    return "\n".join(body)

# ---------- 3. 标注 ----------
def annotate(text, name, D):
    words, mwes, lemma_of, forms_of, bnc, _ = D
    tokens = []
    for m in WORD_RE.finditer(text):
        tokens.append({"i": len(tokens), "t": m.group(0), "start": m.start()})
    n_tok = len(tokens)

    # 句首判定：token 与前一 token 之间的间隙里是否出现句末标点
    prev_end = 0
    for tk in tokens:
        gap = text[prev_end:tk["start"]]
        tk["sent_start"] = (prev_end == 0) or bool(re.search(r"[.!?]", gap))
        prev_end = tk["start"] + len(tk["t"])

    # MWE 最长匹配
    covered_mwe = set()
    i = 0
    while i < n_tok:
        matched = False
        for n in range(5, 1, -1):
            if i + n <= n_tok:
                phrase = norm(" ".join(t["t"] for t in tokens[i:i + n]))
                if phrase in mwes:
                    for t in tokens[i:i + n]:
                        t["label"] = "mwe"; covered_mwe.add(t["i"])
                    i += n
                    matched = True
                    break
        if not matched:
            i += 1

    def resolvable(w):
        w = w.lower()
        if w in words:
            return True
        lem = lemma_of.get(w) or forms_of.get(w)
        return bool(lem and lem in words)

    counts = Counter()
    misses = []
    sense_counts = []
    for tk in tokens:
        t = tk["t"]
        if "label" in tk:
            counts[tk["label"]] += 1
            continue
        low = t.lower()
        if any(c.isdigit() for c in t):
            tk["label"] = "number"; counts["number"] += 1; continue
        is_cap = t[0].isupper()
        allcaps = len(t) > 1 and t.isupper()
        in_dict = low in words
        if allcaps:
            tk["label"] = "proper"; counts["proper"] += 1; continue
        if is_cap and not tk.get("sent_start") and not in_dict and low not in lemma_of and low not in forms_of:
            tk["label"] = "proper"; counts["proper"] += 1; continue
        if in_dict:
            if is_cap and not tk["sent_start"]:
                tk["label"] = "cap_word"; counts["cap_word"] += 1
            else:
                tk["label"] = "word"; counts["word"] += 1
        elif resolvable(low):
            tk["label"] = "word_lemma"; counts["word_lemma"] += 1
        elif "'" in t and low.rsplit("'", 1)[1] in CONTRACTIONS:
            left = low.rsplit("'", 1)[0]
            if resolvable(left):
                tk["label"] = "contraction"; counts["contraction"] += 1
            else:
                tk["label"] = "miss"; counts["miss"] += 1
                misses.append(tk)
        elif "-" in t and all(resolvable(p) for p in low.split("-") if p):
            tk["label"] = "compound"; counts["compound"] += 1
        elif is_cap:
            tk["label"] = "proper"; counts["proper"] += 1
        else:
            tk["label"] = "miss"; counts["miss"] += 1
            misses.append(tk)

    # MWE 命中抽样（检查过度匹配）+ 垃圾短语量化
    STOP = set("a an the and or but if of to in on at by for with from as is are was were be been being am do does did have has had will would can could shall should may might must that this these those it its he she they them his her their we us our you your i me my my not no nor so too very than then there here what which who whom when where why how all each both some any few more most other such only own same just also into over under again about between through during before after above below up down out off once per upon while".split())
    mwe_samples, junk_mwe, buf = [], [], []
    for tk in tokens:
        if tk.get("label") == "mwe":
            buf.append(tk["t"])
        else:
            if buf:
                phrase = " ".join(buf)
                mwe_samples.append(phrase)
                content = [w for w in phrase.lower().split() if w not in STOP]
                if len(content) < 2:
                    junk_mwe.append(phrase)
                buf = []
    if buf:
        mwe_samples.append(" ".join(buf))

    # 义项候选数（翻译行数）与多义词抽样：全量加载 translation
    trans_map = {}
    with open(DATA / "ecdict.csv", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            w = row["word"].strip().lower()
            if w and w not in trans_map:
                tr = row["translation"]
                trans_map[w] = len([ln for ln in tr.split("\\n") if ln.strip()]) if tr else 0

    W = counts["mwe"] + counts["word"] + counts["cap_word"] + counts["word_lemma"] + counts["contraction"] + counts["compound"] + counts["miss"] + counts["proper"] + counts["number"]
    denom = W - counts["proper"] - counts["number"]
    miss_rate = counts["miss"] / denom if denom else 0

    # MWE 缺口候选：连续 miss（非专名）
    gaps = []
    run = []
    for tk in tokens:
        if tk.get("label") == "miss":
            run.append(tk["t"])
        else:
            if len(run) >= 2:
                gaps.append(" ".join(run))
            run = []
    if len(run) >= 2:
        gaps.append(" ".join(run))

    # miss 样本（带上下文）
    samples = []
    for tk in misses[:400]:
        ctx = " ".join(x["t"] for x in tokens[max(0, tk["i"]-6):tk["i"]+7])
        samples.append({"token": tk["t"], "context": ctx})

    # 多义词抽样（候选义项≥6 的已匹配词，给上下文，供人工计时）
    poly = []
    seen = set()
    for tk in tokens:
        low = tk["t"].lower()
        if tk.get("label") in ("word", "word_lemma") and low not in seen:
            cands = trans_map.get(lemma_of.get(low, low), 0) or trans_map.get(low, 0)
            if cands >= 4:
                seen.add(low)
                ctx = " ".join(x["t"] for x in tokens[max(0, tk["i"]-5):tk["i"]+6])
                poly.append({"word": low, "sense_candidates": cands, "context": ctx})
        if len(poly) >= 30:
            break

    # golden 语料种子
    with open(GOLD / f"{name}.tokens.jsonl", "w", encoding="utf-8") as f:
        for tk in tokens:
            f.write(json.dumps({"i": tk["i"], "t": tk["t"], "label": tk.get("label", "?")}, ensure_ascii=False) + "\n")
    with open(GOLD / f"{name}.misses.json", "w", encoding="utf-8") as f:
        json.dump(samples, f, ensure_ascii=False, indent=1)

    return {
        "name": name, "tokens_total": n_tok, "word_tokens": W,
        "mwe": counts["mwe"], "word": counts["word"], "cap_word": counts["cap_word"],
        "word_lemma": counts["word_lemma"],
        "contraction": counts["contraction"], "compound": counts["compound"],
        "proper": counts["proper"], "number": counts["number"], "miss": counts["miss"],
        "denominator": denom, "miss_rate": miss_rate,
        "mwe_gap_candidates": gaps, "miss_samples": samples[:40],
        "mwe_hit_samples": mwe_samples[:25], "mwe_junk": junk_mwe,
        "mwe_junk_rate": len(junk_mwe) / len(mwe_samples) if mwe_samples else 0,
        "polysemy_sample": poly,
    }

def main():
    D = load_ecdict()
    print(f"ecdict rows loaded; words={len(D[0])}, mwes={len(D[1])}, lemma_of={len(D[2])}, forms_of={len(D[3])}", file=sys.stderr)

    texts = {
        "textA_news": ("六级/新闻难度", brown_text(["brown/ca01", "brown/ca02"], [330, 330])),
        "textB_essay": ("外刊/评论难度", gutenberg_text("gutenberg/chesterton-ball.txt", 660)),
        "textC_academic": ("论文/学术难度", brown_text(["brown/cj01", "brown/cj02"], [330, 330])),
    }
    results = []
    for key, (label, text) in texts.items():
        (BASE / "texts" / f"{key}.txt").write_text(text, encoding="utf-8")
        r = annotate(text, key, D)
        r["label"] = label
        results.append(r)

    tot_d = sum(r["denominator"] for r in results)
    tot_m = sum(r["miss"] for r in results)
    agg = tot_m / tot_d if tot_d else 0

    report = {
        "aggregate_miss_rate": agg, "aggregate_denominator": tot_d, "aggregate_miss": tot_m,
        "texts": results,
    }
    (OUT / "preannotate_results.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({r["name"]: {"miss_rate": f"{round(r['miss_rate'] * 100, 2)}%", "miss": r["miss"], "denom": r["denominator"]} for r in results}, ensure_ascii=False))
    print(f"AGGREGATE miss_rate = {agg*100:.2f}%  (gate: <=5%)")

if __name__ == "__main__":
    main()
