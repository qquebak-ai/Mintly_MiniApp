# Авторский трек под историю Леса Брауна (64 с): соул и бум-бэп — тёплые
# аккорды электропиано, мягкие барабаны, треск пластинки. Звуковые события
# идут по таймлайну: стук в дверь радиостанции, шипение эфира и сигнал
# «в эфире», аплодисменты на сцене, подъём на мостике и удар на логотипе.
import numpy as np, wave, sys
from scipy.signal import butter, lfilter
SR = 44100; DUR = 64.0; n = int(SR * DUR); L = np.zeros(n); R = np.zeros(n)
rs = np.random.RandomState(9)
def put(t, s, g=1.0, pan=0.0):
    i = int(t * SR)
    if i >= n or i < 0: return
    e = min(n, i + len(s)); s = s[:e - i] * g
    L[i:e] += s * (1 - pan) * 0.7; R[i:e] += s * (1 + pan) * 0.7
tt = lambda d: np.arange(int(d * SR)) / SR
def lp(x, f): b, a = butter(2, f / (SR / 2)); return lfilter(b, a, x)
def hp(x, f): b, a = butter(2, f / (SR / 2), 'high'); return lfilter(b, a, x)
def bp(x, f1, f2): b, a = butter(2, [f1 / (SR / 2), f2 / (SR / 2)], 'band'); return lfilter(b, a, x)
N2F = lambda m: 440 * 2 ** ((m - 69) / 12)
def rhodes(m, d=2.4, v=1.0):
    # электропиано: синус с колокольным призвуком и медленным тремоло
    t = tt(d); f = N2F(m)
    x = np.sin(2 * np.pi * f * t + 0.8 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 4)) * np.exp(-t * 1.3)
    x += 0.18 * np.sin(2 * np.pi * f * 4.01 * t) * np.exp(-t * 6)
    return lp(x * (1 + 0.12 * np.sin(2 * np.pi * 4.5 * t)), 3000) * np.minimum(1, t / .006) * v
def chord(ms, d=2.4, v=.6): return sum(rhodes(m, d, v) for m in ms) / len(ms)
def bass(m, d=.8):
    t = tt(d); f = N2F(m); return lp(np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * 2 * f * t), 500) * np.exp(-t * 3) * np.minimum(1, t / .008)
def bkick():
    t = tt(.4); f = 105 * np.exp(-t * 22) + 46; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8) + lp(rs.randn(len(t)), 900) * np.exp(-t * 60) * .3
def snare():
    t = tt(.3); return bp(rs.randn(len(t)), 900, 6000) * np.exp(-t * 16) * .55 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * .35
def hat(open_=False):
    t = tt(.18 if open_ else .05); return hp(rs.randn(len(t)), 7500) * np.exp(-t * (18 if open_ else 80)) * .22
def kick():
    t = tt(.35); f = 125 * np.exp(-t * 30) + 45; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
def clap():
    t = tt(.22); return bp(rs.randn(len(t)), 1000, 5000) * np.exp(-t * 20) * .6
def knock():
    t = tt(.16); f = 140 * np.exp(-t * 18) + 90
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) + bp(rs.randn(len(t)), 300, 1800) * .6) * np.exp(-t * 28)
def static(d):
    t = tt(d); return bp(rs.randn(len(t)), 1500, 7000) * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * t)) * np.sin(np.pi * t / d)
def beep():
    t = tt(.45); return np.sin(2 * np.pi * 1000 * t) * (t < .4) * np.minimum(1, t / .005) * np.clip((.4 - t) / .02, 0, 1)
def applause(d):
    # аплодисменты: много коротких шумовых щелчков с нарастанием и спадом
    out = np.zeros(int(d * SR)); env = np.sin(np.pi * np.arange(len(out)) / len(out)) ** .7
    for _ in range(int(d * 260)):
        i = rs.randint(0, len(out) - 2000); c = bp(rs.randn(1800), 800, 6000) * np.exp(-np.arange(1800) / 180)
        out[i:i + 1800] += c * rs.uniform(.3, 1)
    return out * env * .25
def crackle(d):
    x = np.zeros(int(d * SR)); idx = rs.randint(0, len(x), int(d * 30)); x[idx] = rs.uniform(-1, 1, len(idx))
    return hp(lp(x, 6000), 900) * .6 + lp(rs.randn(len(x)), 3000) * .015
def pad(ms, d, cut=2400, att=.6, rel=1.2):
    t = tt(d); x = sum(np.sin(2 * np.pi * N2F(m) * t * (1 + dt)) for m in ms for dt in (-.003, 0, .004)) / (3 * len(ms))
    return lp(x, cut) * np.minimum(1, t / att) * np.clip((d - t) / rel, 0, 1)
def whoosh(d=.8, up=True):
    t = tt(d); x = bp(rs.randn(len(t)), 400, 7000); return x * ((t / d) ** 2.5 if up else np.exp(-t * 5))
def hit():
    t = tt(2.0); f = 80 * np.exp(-t * 5) + 38
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.5) + lp(rs.randn(len(t)), 2500) * np.exp(-t * 7) * .4
def pop(f=900):
    t = tt(.12); return np.sin(2 * np.pi * (f + 900 * np.exp(-t * 40)) * t) * np.exp(-t * 35)
def chime(m):
    t = tt(2.6); f = N2F(m); return (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 2.01 * t)) * np.exp(-t * 1.5)

# ---- 0–38.7 · история: бум-бэп 86 BPM, аккорды Dm9–Gm9–C9–Fmaj7 ----
put(0, crackle(38.7), .5)
B = 60 / 86
PROG = [(38, [62, 65, 69, 72, 76]), (43, [55, 58, 62, 65, 69]), (36, [55, 58, 60, 64, 67]), (41, [57, 60, 64, 65, 69])]
bar = 0; t = 0.0
while t < 38.6:
    root, ch = PROG[bar % 4]
    put(t, chord(ch, 4 * B + .5, .9), .34)
    if bar >= 1:  # барабаны вступают со второго такта — первый такт тихий, на хук
        for b in range(4):
            tb = t + b * B
            if b == 0 or (b == 2 and bar % 2): put(tb, bkick(), .55)
            if b == 2 and not bar % 2: put(tb + B * .5, bkick(), .4)
            if b in (1, 3): put(tb, snare(), .42)
            for h in range(2): put(tb + h * B / 2 + (0.03 if h else 0), hat(), .7, pan=.25)
            put(tb, bass(root if b < 2 else root + 7, B * .9), .38)
    t += 4 * B; bar += 1
# события истории
put(9.0, knock()[:int(.12 * SR)], .25)  # штамп «отсталый» — сухой хлопок
for k in range(3):  # стук в дверь станции: три серии по три удара
    for j in range(3): put(20.6 + k * 0.72 + j * 0.15, knock(), .55, pan=-.35)
put(27.0, static(2.4), .14, pan=.2); put(29.4, beep(), .16)  # шипение эфира и сигнал «в эфире»
put(34.0, applause(4.2), .9)  # сцена
put(38.0, whoosh(.8), .4)

# ---- 38.7–57.7 · Mintly: бит плотнее, 96 BPM ----
B2 = 60 / 96; T1 = 38.7
put(T1, hit(), .45)
PROG2 = [(38, [62, 65, 69, 72]), (46, [58, 62, 65, 69]), (41, [57, 60, 64, 69]), (36, [55, 60, 64, 67])]
bar = 0; t = T1
while t < 51.6:
    root, ch = PROG2[bar % 4]
    put(t, pad(ch + [ch[0] + 12], 4 * B2 + .3, cut=2800, att=.1, rel=.3), .24)
    for b in range(4):
        tb = t + b * B2
        put(tb, kick(), .7)
        if b in (1, 3): put(tb, clap(), .48)
        put(tb, bass(root, B2 * .9), .45)
        for h in range(2): put(tb + h * B2 / 2, hat(), .8, pan=.25)
    t += 4 * B2; bar += 1
for b in (0.16, 0.34, 0.5, 0.64, 0.77, 0.89): put(41.3 + 2.6 * b, pop(1200 + 900 * b), .2)
for i in range(4): put(46.9 + i * .42, pop(780 + i * 140), .22)
# фраза: бит уходит, остаются аккорды — слова звучат весомо
put(51.6, chord([50, 57, 62, 65, 69], 3.2, 1), .5); put(54.8, chord([46, 53, 58, 62, 65], 3.2, 1), .45)
put(56.9, whoosh(.8), .38)

# ---- 57.7–64 · призыв и логотип ----
put(57.7, kick(), .6); put(57.7, chord([50, 57, 62, 66, 69], 2.5, 1), .45)
put(59.4, whoosh(.8), .45); put(60.2, hit(), .8); put(60.2, pad([38, 50, 57, 62, 66, 69, 74], 3.8, cut=3200, att=.2, rel=2.4), .42)
put(60.3, chime(86), .25); put(61.4, pop(1000), .22)

mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.1) * .88
fade = np.ones(n); fo = int(1.0 * SR); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
mix *= fade[:, None]
pcm = (mix / max(1e-6, np.abs(mix).max()) * .92 * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("track", sys.argv[1])
