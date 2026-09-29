# -*- coding: utf-8 -*-
"""S13-0a step2: Whisper 8s log-mel 特征（复刻 transformers WhisperFeatureExtractor, chunk_length=8）。"""
import json, os
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
CLIP_DIR = os.path.join(ROOT, "smartturn-clips")
FEAT_DIR = os.path.join(ROOT, "smartturn-feats")
os.makedirs(FEAT_DIR, exist_ok=True)

SR, N_FFT, HOP, N_MELS, SEC = 16000, 400, 160, 80, 8
MAXN = SR * SEC

def hz_to_mel_slaney(f):
    f = np.asarray(f, dtype=np.float64)
    return np.where(f >= 1000.0,
                    15.0 + np.log(f / 1000.0) / (np.log(6.4) / 27.0),
                    f / (200.0 / 3.0))

def mel_to_hz_slaney(m):
    m = np.asarray(m, dtype=np.float64)
    return np.where(m >= 15.0,
                    1000.0 * np.exp((m - 15.0) * (np.log(6.4) / 27.0)),
                    m * (200.0 / 3.0))

def mel_filterbank():
    # librosa htk=False, norm='slaney'
    fftfreqs = np.linspace(0, SR / 2, N_FFT // 2 + 1)
    melpts = mel_to_hz_slaney(np.linspace(hz_to_mel_slaney(0), hz_to_mel_slaney(SR / 2), N_MELS + 2))
    fd = np.diff(melpts)
    w = np.zeros((N_MELS, N_FFT // 2 + 1))
    for i in range(N_MELS):
        l, c, r = melpts[i], melpts[i + 1], melpts[i + 2]
        w[i] = np.minimum((fftfreqs - l) / (c - l), (r - fftfreqs) / (r - c))
        w[i] = np.maximum(0, w[i])
    enorm = 2.0 / (melpts[2:N_MELS + 2] - melpts[:N_MELS])
    w *= enorm[:, None]
    return w.astype(np.float32)

FB = mel_filterbank()
WIN = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N_FFT) / N_FFT)  # torch.hann_window periodic

def stft_mag2(x):
    # torch.stft center=True, reflect padding; 801 frames → drop last → 800
    xp = np.pad(x, (N_FFT // 2, N_FFT // 2), mode="reflect")
    n_frames = 1 + len(x) // HOP
    frames = np.lib.stride_tricks.as_strided(
        xp, shape=(n_frames, N_FFT),
        strides=(xp.strides[0] * HOP, xp.strides[0]), writeable=False)
    spec = np.fft.rfft(frames * WIN[None, :], N_FFT)
    mag = (spec.real ** 2 + spec.imag ** 2)
    return mag[:-1]

def extract(pcm):
    pcm = pcm.astype(np.float32)
    if len(pcm) > MAXN:
        pcm = pcm[-MAXN:]
    mask = np.ones(len(pcm), dtype=np.float32)
    if len(pcm) < MAXN:
        padn = MAXN - len(pcm)
        pcm = np.concatenate([np.zeros(padn, dtype=np.float32), pcm])
        mask = np.concatenate([np.zeros(padn, dtype=np.float32), mask])
    real = pcm[mask > 0]
    mu = real.mean()
    std = np.sqrt(np.mean((real - mu) ** 2) + 1e-5)
    pcm = (pcm - mu) / std
    mag = stft_mag2(pcm)
    mel = FB @ mag.T
    log = np.log10(np.maximum(mel, 1e-10))
    log = np.maximum(log, log.max() - 8.0)
    log = (log + 4.0) / 4.0
    return log.astype(np.float32)  # 80 × 800

meta = json.load(open(os.path.join(ROOT, "smartturn-meta.json"), encoding="utf-8"))
for m in meta:
    pcm = np.fromfile(os.path.join(CLIP_DIR, m["file"]), dtype=np.float32)
    feat = extract(pcm)
    out = m["file"].replace(".f32", ".feat")
    feat.tofile(os.path.join(FEAT_DIR, out))
    m["feat"] = out
print("features:", len(meta), "shape", feat.shape)
json.dump(meta, open(os.path.join(ROOT, "smartturn-meta.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
