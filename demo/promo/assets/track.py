# Авторский трек под промо: мягкий поп, 96 BPM, акценты на склейках.
import numpy as np, wave
from scipy.signal import butter, lfilter
SR = 44100; DUR = 45.0; n = int(SR * DUR); L = np.zeros(n); R = np.zeros(n)
rs = np.random.RandomState(3); B = 60 / 96
def put(t, s, g=1.0, pan=0.0):
    i = int(t * SR)
    if i >= n: return
    e = min(n, i + len(s)); s = s[:e - i] * g
    L[i:e] += s * (1 - pan) * 0.7; R[i:e] += s * (1 + pan) * 0.7
tt = lambda d: np.arange(int(d * SR)) / SR
def lp(x, f): b, a = butter(2, f / (SR / 2)); return lfilter(b, a, x)
def hp(x, f): b, a = butter(2, f / (SR / 2), 'high'); return lfilter(b, a, x)
def bp(x, f1, f2): b, a = butter(2, [f1 / (SR / 2), f2 / (SR / 2)], 'band'); return lfilter(b, a, x)
def ep(f, d=1.2):  # мягкое электропиано
    t = tt(d); x = sum(np.sin(2 * np.pi * f * k * t) * a for k, a in ((1, 1), (2, .35), (3, .12), (4, .05)))
    return x * np.exp(-t * 3.2) * np.minimum(1, t / .004)
def pad(fs, d):
    t = tt(d); x = sum(np.sin(2 * np.pi * f * t * (1 + dt)) for f in fs for dt in (-.003, 0, .004)) / (3 * len(fs))
    return lp(x, 2400) * np.minimum(1, t / .6) * np.clip((d - t) / .8, 0, 1)
def kick():
    t = tt(.35); f = 120 * np.exp(-t * 30) + 45; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
def clap():
    t = tt(.22); return bp(rs.randn(len(t)), 1000, 5000) * np.exp(-t * 20) * .7
def shaker():
    t = tt(.07); return hp(rs.randn(len(t)), 6000) * np.exp(-t * 60) * .3
def whoosh(d=.7, up=True):
    t = tt(d); x = bp(rs.randn(len(t)), 500, 7000); e = (t / d) ** 2.5 if up else np.exp(-t * 5); return x * e
def hit():
    t = tt(1.4); f = 80 * np.exp(-t * 5) + 40
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3) + lp(rs.randn(len(t)), 2500) * np.exp(-t * 7) * .4
def pop(f=900):
    t = tt(.12); return np.sin(2 * np.pi * (f + 900 * np.exp(-t * 40)) * t) * np.exp(-t * 35)
def click():
    t = tt(.03); return hp(rs.randn(len(t)), 2500) * np.exp(-t * 200) * .6
def chime(f):
    t = tt(2.5); return (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 2.01 * t)) * np.exp(-t * 1.6)
# аккорды Fmaj7 – Am7 – Dm7 – Bbmaj7 по такту (4 доли)
CH = [[174.6, 220, 261.6, 329.6], [220, 261.6, 329.6, 392], [146.8, 174.6, 220, 261.6], [116.5, 146.8, 174.6, 220]]
BAR = 4 * B
nb = int(DUR / BAR) + 1
for bi in range(nb):
    t0 = bi * BAR; c = CH[bi % 4]
    put(t0, pad(c, BAR + .3), .32)
    # арпеджио электропиано восьмыми
    for k in range(8):
        tm = t0 + k * B / 2
        if tm > 44: break
        if 15 <= tm < 15.8: continue
        put(tm, ep(c[[0, 2, 1, 3, 2, 1, 3, 2][k]] * 2, .9), .16 if tm < 5.2 else .2, (-.3, .3)[k % 2])
    put(t0, ep(c[0] / 2, 1.8) * 1.2, .22)            # бас
# ударные: с 5.2, кроме паузы в «Simple» и финала
for i in range(int(DUR / B) + 1):
    tm = i * B
    if tm < 5.2 or 15.0 <= tm < 19.5 or tm >= 37.0: continue
    put(tm, kick(), .55)
    if i % 2 == 1: put(tm, clap(), .25, .1)
    for s in (0, .25, .5, .75): put(tm + s * B, shaker(), .5, -.4)
# акценты на склейках
for t0 in (5.2, 19.6, 24.2, 31.6): put(t0 - .55, whoosh(.6), .35)
put(0.65, chime(523.3), .18); put(0.85, chime(659.3), .14)
put(15.0, hit(), .45); put(17.1, whoosh(.9), .3); put(18.0, hit(), .5); put(18.0, chime(698.5), .2)
put(28.2, whoosh(.5), .4); put(29.15, hit(), .5)
for tt0 in np.arange(20.9, 21.55, 1 / 12): put(tt0, click(), .35)
for tt0 in np.arange(21.8, 22.2, 1 / 10): put(tt0, click(), .35)
put(22.6, pop(700), .4); put(22.8, chime(784), .2); put(26.55, pop(800), .4); put(26.8, chime(880), .16)
for a, s in ((34.75, "Launch it"), (35.55, "Trade it"), (36.35, "Moon it")):
    for k in range(len(s)): put(a + k / 22, click(), .3)
put(36.4, whoosh(.65), .35); put(37.0, pad([349.2, 440, 523.3, 659.3], 7.5), .5); put(38.5, chime(1046.5), .22); put(38.5, hit(), .3)
put(39.9, pop(1000), .35)
for k, icon in enumerate(range(8)): put(1.2 + k * .12, pop(900 + k * 60), .18)
x = np.stack([L, R], 1)
x *= np.clip((DUR - np.arange(n) / SR) / 1.6, 0, 1)[:, None]
x = np.tanh(x * 1.2) / np.tanh(1.2); x /= np.abs(x).max() * 1.12
w = wave.open('track.wav', 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((x * 32767).astype(np.int16).tobytes()); w.close()
