# Трек к ролику «Сделано в Mintly» (17 с): ровный электронный бит под
# первую половину, щелчки клавиш под оба запроса, свисты на каждом
# переходе камеры, звон на знаке, глитч-удар на концовке и тишина за ним.
import numpy as np, wave, sys
from scipy.signal import butter, lfilter
SR = 44100; DUR = 17.0; n = int(SR * DUR); L = np.zeros(n); R = np.zeros(n)
rs = np.random.RandomState(5)
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
def kick():
    t = tt(.32); f = 120 * np.exp(-t * 26) + 44; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10)
def clap():
    t = tt(.22); return bp(rs.randn(len(t)), 1000, 5000) * (np.exp(-t * 22) + .5 * np.exp(-np.maximum(t - .012, 0) * 30) * (t > .012)) * .45
def hat(o=False):
    t = tt(.18 if o else .05); return hp(rs.randn(len(t)), 8000) * np.exp(-t * (18 if o else 85)) * .2
def bass(m, d):
    t = tt(d); x = np.sin(2 * np.pi * N2F(m) * t) + .3 * np.sin(4 * np.pi * N2F(m) * t)
    return lp(x, 500) * np.exp(-t * 3) * np.minimum(1, t / .006)
def pad(ms, d, cut=2600, att=.3, rel=.8):
    t = tt(d); x = sum(np.sin(2 * np.pi * N2F(m) * t * (1 + dt)) for m in ms for dt in (-.004, 0, .005)) / (3 * len(ms))
    return lp(x, cut) * np.minimum(1, t / att) * np.clip((d - t) / rel, 0, 1)
def whoosh(d, up=True):
    t = tt(d); env = np.sin(np.pi * t / d) ** 2
    f = np.linspace(600, 6000, len(t)) if up else np.linspace(6000, 500, len(t))
    x = rs.randn(len(t)); y = np.zeros_like(x)
    # полоса бежит по частоте — свист «пролетает»
    for k in range(0, len(t), 2048):
        seg = x[k:k + 2048]; c = f[min(k, len(f) - 1)]
        y[k:k + 2048] = bp(seg, max(200, c * .6), min(18000, c * 1.6))[:len(seg)]
    return y * env * .9
def tick():
    t = tt(.03); return hp(rs.randn(len(t)), 3000) * np.exp(-t * 220) * .5 + np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 300) * .2
def click():
    t = tt(.06); return (np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 120) + hp(rs.randn(len(t)), 2000) * np.exp(-t * 200) * .4)
def pop(f=700):
    t = tt(.14); return np.sin(2 * np.pi * (f + 1200 * np.exp(-t * 45)) * t) * np.exp(-t * 30)
def chime(m):
    t = tt(2.4); f = N2F(m); return (np.sin(2 * np.pi * f * t) + .35 * np.sin(2 * np.pi * f * 2.01 * t) + .15 * np.sin(2 * np.pi * f * 3.02 * t)) * np.exp(-t * 1.7)
def hit():
    t = tt(1.6); f = 70 * np.exp(-t * 6) + 34
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.6) + lp(rs.randn(len(t)), 3000) * np.exp(-t * 9) * .5
def glitch(d):
    t = tt(d); sq = np.sign(np.sin(2 * np.pi * 220 * t * (1 + 3 * (rs.rand() - .5)))) * .3
    gate = (np.floor(t * 40) % 3 != 0).astype(float)
    return (bp(rs.randn(len(t)), 800, 9000) * .6 + sq) * gate * np.exp(-t * 4)

# бит 122 BPM от начала до знака
B = 60 / 122; PROG = [(45, [57, 64, 69, 72]), (41, [53, 60, 65, 69]), (48, [55, 60, 64, 67]), (43, [55, 59, 62, 67])]
t = 0.0; bar = 0
while t < 9.95:
    root, ch = PROG[bar % 4]
    put(t, pad(ch, 4 * B + .3), .22)
    for b in range(4):
        tb = t + b * B
        if tb >= 9.95: break
        put(tb, kick(), .55)
        if b in (1, 3): put(tb, clap(), .4)
        for h in range(2): put(tb + h * B / 2 + B / 4, hat(h == 1), .6, pan=.3)
        put(tb, bass(root, B * .85), .32)
    t += 4 * B; bar += 1
# переходы и действия
put(0.0, whoosh(.5), .25); put(0.12, chime(81), .16)
put(1.14, whoosh(.32), .3); put(1.36, pop(900), .25); put(1.45, pop(1300), .15)
put(2.16, click(), .5)
put(2.55, whoosh(.18, False), .3)
for i in range(9): put(2.7 + .75 * i / 9, tick(), .5, pan=(rs.rand() - .5) * .3)
for i in range(4): put(3.92 + .24 * i / 4, tick(), .45)
put(3.48, whoosh(.38), .22)
put(4.24, click(), .5)
put(4.3, whoosh(.6), .55)
put(5.18, whoosh(.45, False), .45)
put(6.38, whoosh(.38, False), .45)
put(7.92, click(), .5); put(8.0, pop(1200), .2)
put(8.22, whoosh(.45), .5)
put(9.85, whoosh(.3, False), .3)
put(10.08, chime(76), .3); put(10.08, chime(83), .14)
for i in range(17): put(10.32 + .8 * i / 17, tick(), .3)
put(11.0, pad([64, 71, 76, 83], 1.6, cut=3000, att=.4, rel=1.0), .18)
# концовка: глитч и удар, потом тишина
put(13.04, glitch(.5), .45); put(13.04, hit(), .7); put(13.42, pop(1600), .2)

mix = np.stack([L, R], 1); mix = np.tanh(mix * 1.1) * .9
fade = np.ones(n); a, b = int(13.75 * SR), int(14.0 * SR); fade[a:b] = np.linspace(1, 0, b - a); fade[b:] = 0
mix *= fade[:, None]
pcm = (mix / max(1e-6, np.abs(mix).max()) * .92 * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("track", sys.argv[1])
