#!/usr/bin/env python3
"""The sizzle reel's music, made from scratch (no samples, so nothing to license): 120 bpm in C major, C, Am, F, G,
a bar (2 s) each. Its sections follow the cuts in scene.html: a soft intro with a rise into the logo, the groove from 4 s,
a lift with bells for the daily (16 s), busier drums under the quick features (24 s), a last chord under the end card
(28 s). A chime marks each solved puzzle and a whoosh each cut, at the times the scene uses.

usage: python3 scripts/sizzle/music.py out.wav [seconds] [--bed]
  --bed: the same groove under another video (the App Store preview, scripts/trailer.js --preview): no chimes or
  whooshes at the sizzle's times, no daily or busy sections, and the last chord on the last bar that leaves 3.5 s.
"""
import sys, wave
import numpy as np

SR = 44100
OUT = sys.argv[1]
DUR = float(sys.argv[2]) if len(sys.argv) > 2 and not sys.argv[2].startswith('-') else 32.0
BED = '--bed' in sys.argv
END_T = 28.0 if not BED else max(4.0, np.floor((DUR - 3.5) / 2) * 2)          # where the last chord starts
N = int(SR * (DUR + 0.5))
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)
BEAT = 0.5

def note(m): return 440.0 * 2 ** ((m - 69) / 12)
def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR); j = min(N, i + len(sig))
    if i >= N or j <= i: return
    s = sig[: j - i] * gain
    L[i:j] += s * (1 - max(pan, 0)); R[i:j] += s * (1 + min(pan, 0))
def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(t / max(a, 1e-4), 1) * np.exp(-t / d)
def lowpass(x, k):
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x): acc += k * (v - acc); y[i] = acc
    return y

# the parts
def kick():
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t / 0.045); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.16) * 1.1
def clap():
    n = int(0.25 * SR); x = rng.standard_normal(n); x = x - lowpass(x, 0.08)
    e = env(n, 0.002, 0.06); e[: int(0.012 * SR)] *= 1.3
    return x * e * 0.55
def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR); x = rng.standard_normal(n); x = x - lowpass(x, 0.5)
    return x * env(n, 0.001, 0.05 if open_ else 0.012) * 0.22
def bass(m, length):
    n = int(length * SR); t = np.arange(n) / SR; f = note(m)
    x = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 7))
    return lowpass(x * env(n, 0.005, 0.18), 0.12) * 0.75
def stab(ms, length=0.22):
    n = int(length * SR); t = np.arange(n) / SR
    x = sum(sum(np.sin(2 * np.pi * note(m) * (1 + d) * t) for d in (-0.004, 0.004)) for m in ms)
    return x * env(n, 0.004, 0.09) * 0.11
def pad(ms, length):
    n = int(length * SR); t = np.arange(n) / SR
    x = sum(sum(np.sin(2 * np.pi * note(m) * (1 + d) * t + 0.3 * np.sin(2 * np.pi * 3 * t)) for d in (-0.006, 0, 0.006)) for m in ms)
    a = np.minimum(t / 0.6, 1) * np.minimum((length - t) / 0.5, 1)
    return x * np.clip(a, 0, 1) * 0.045
def chime(m, length=1.6):
    n = int(length * SR); t = np.arange(n) / SR; f = note(m)
    x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.25) + 0.25 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.12)
    return x * env(n, 0.002, 0.45) * 0.28
def whoosh(length=0.7, rise=True):
    n = int(length * SR); x = rng.standard_normal(n); t = np.arange(n) / SR
    k = np.linspace(0.02, 0.35, n) if rise else np.linspace(0.35, 0.02, n)
    y = np.empty(n); acc = 0.0
    for i in range(n): acc += k[i] * (x[i] - acc); y[i] = acc
    e = np.sin(np.pi * t / length) ** 2
    return y * e * 0.5
def riser(length):
    n = int(length * SR); t = np.arange(n) / SR
    f = 200 * 2 ** (t / length * 2.5); ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) * 0.3 + rng.standard_normal(n) * 0.15) * (t / length) ** 2 * 0.35

CHORDS = [(48, [60, 64, 67]), (45, [57, 60, 64]), (41, [57, 60, 65]), (43, [59, 62, 67])]   # C, Am, F, G
BARS = int(np.ceil(DUR / 2))
for bar in range(BARS):
    t0 = bar * 2.0; root, ch = CHORDS[bar % 4]
    if t0 < 4:          # intro: a pad, then the rise into the logo, a first kick on the logo
        add(pad([m - 12 for m in ch] + ch, 2.0), t0, 1.0)
        if bar == 0: add(riser(1.9), 0.0, 0.8)
        if bar == 1:
            for b in range(4): add(kick(), t0 + b * BEAT, 0.9)
            for b in range(4): add(stab(ch), t0 + b * BEAT + 0.25, 0.8, -0.2)
        continue
    end = t0 >= END_T
    if end:             # the end card: one big chord ringing out
        if t0 == END_T:
            add(kick(), t0, 1.1); add(pad([36] + [m - 12 for m in CHORDS[0][1]] + CHORDS[0][1] + [72], 4.2), t0, 2.2)
            add(chime(84, 3.0), t0 + 0.05, 0.8, 0.3); add(chime(79, 3.0), t0 + 0.5, 0.6, -0.3)
            add(bass(36, 1.6), t0, 1.0)
        continue
    daily = not BED and 16 <= t0 < 24; busy = not BED and 24 <= t0 < 28
    for b in range(4):
        tb = t0 + b * BEAT
        if not (daily and bar == 8 and b < 2): add(kick(), tb, 1.0)
        if b in (1, 3): add(clap(), tb, 0.9)
        add(hat(), tb + 0.25, 1.0, 0.3)
        if busy:
            add(hat(), tb + 0.125, 0.7, -0.3); add(hat(), tb + 0.375, 0.7, -0.3)
        if b == 3: add(hat(True), tb + 0.25, 0.8, 0.3)
        # bass in eighths, the octave on the offbeat
        add(bass(root, 0.24), tb, 1.0); add(bass(root + 12, 0.2), tb + 0.25, 0.6)
        add(stab(ch), tb + 0.25, 1.0, -0.25 if b % 2 else 0.25)
    if daily:           # bells over the daily: the chord's notes up high
        for k, m in enumerate([ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[2] + 24]):
            add(chime(m, 0.9), t0 + k * BEAT, 0.35, 0.4 if k % 2 else -0.4)
        add(pad(ch, 2.0), t0, 0.9)
    if (busy and bar == 13) or (BED and t0 == END_T - 2):          # a snare roll into the end card
        for k in range(16): add(clap(), t0 + 1.0 + k * 0.0625, 0.25 + k * 0.03)

# chimes on the solves, whooshes on the cuts (times from scene.html)
for t, m in [] if BED else [(6.65, 76), (8.95, 79), (11.5, 79), (13.5, 81), (15.35, 84), (19.95, 84)]:
    add(chime(m), t, 1.0, 0.15); add(chime(m + 7), t + 0.08, 0.5, -0.2)
for t in () if BED else (10.0, 16.0, 24.0):
    add(whoosh(0.6), t - 0.45, 0.9)
for t in () if BED else (0.9, 10.2, 12.3, 14.1, 16.6, 24.05):          # pieces dropping in: a soft whoosh down
    add(whoosh(0.5, rise=False), t + 0.1, 0.35)

# a little room: two short delays
for d, g in ((0.0937, 0.18), (0.1563, 0.12)):
    k = int(d * SR); L[k:] += R[:-k] * g; R[k:] += L[:-k] * g
mix = np.stack([L, R], 1)[: int(SR * DUR)]
fade = int(1.2 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix = np.tanh(mix * 0.9); mix /= np.abs(mix).max() / 0.89
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
