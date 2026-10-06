# Авторский трек под ролик-историю (48 с). Акценты стоят на событиях таймлайна:
# касание и «чеканка» в телефоне, раскрытие пергамента, падение монет, удар
# штампа MINT, схлопывание бумаги, бит современной части и удар на логотипе.
import numpy as np, wave, sys
from scipy.signal import butter, lfilter
SR = 44100; DUR = 48.0; n = int(SR * DUR); L = np.zeros(n); R = np.zeros(n)
rs = np.random.RandomState(11)
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
def pad(ms, d, cut=2200, att=.8, rel=1.2):
    t = tt(d); x = sum(np.sin(2 * np.pi * N2F(m) * t * (1 + dt)) for m in ms for dt in (-.0035, 0, .004)) / (3 * len(ms))
    return lp(x, cut) * np.minimum(1, t / att) * np.clip((d - t) / rel, 0, 1)
def drone(m, d):
    t = tt(d); f = N2F(m)
    x = np.sin(2 * np.pi * f * t) + .5 * np.sin(2 * np.pi * f * 1.5 * t) + .3 * np.sin(2 * np.pi * f * 2.003 * t) + .15 * np.sin(2 * np.pi * f * 3.01 * t)
    return lp(x, 900) * np.minimum(1, t / 2.5) * np.clip((d - t) / 2, 0, 1) * (0.8 + 0.2 * np.sin(2 * np.pi * .13 * t))
def lyre(m, d=1.8, damp=.9965):
    # щипок струны Карплюса — Стронга: древний тембр без сэмплов
    f = N2F(m); P = int(SR / f); buf = rs.uniform(-1, 1, P); out = np.zeros(int(d * SR))
    for i in range(len(out)):
        j = i % P; out[i] = buf[j]; buf[j] = damp * .5 * (buf[j] + buf[(j + 1) % P])
    return lp(out, 3500) * np.exp(-tt(d) * 1.2)
def frame_drum():
    t = tt(.7); f = 95 * np.exp(-t * 14) + 52
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6) + lp(rs.randn(len(t)), 900) * np.exp(-t * 18) * .25
def clink(f=2400):
    # звон монеты: несколько негармонических мод быстро гаснут
    t = tt(1.0); return sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * dk) for r, a, dk in ((1, 1, 7), (2.76, .6, 10), (5.4, .35, 14), (8.9, .2, 20))) * .35
def stamp():
    t = tt(2.2); f = 70 * np.exp(-t * 6) + 34
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.4)
    metal = sum(a * np.sin(2 * np.pi * fr * t) * np.exp(-t * dk) for fr, a, dk in ((310, .5, 3), (523, .35, 4), (847, .25, 5), (1361, .15, 7)))
    crack = lp(rs.randn(len(t)), 4000) * np.exp(-t * 30) * .8
    return body * 1.1 + metal * .6 + crack
def kick():
    t = tt(.35); f = 120 * np.exp(-t * 30) + 45; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
def clap():
    t = tt(.22); return bp(rs.randn(len(t)), 1000, 5000) * np.exp(-t * 20) * .6
def hat():
    t = tt(.06); return hp(rs.randn(len(t)), 7000) * np.exp(-t * 70) * .28
def bass(m, d):
    t = tt(d); f = N2F(m); x = np.sin(2 * np.pi * f * t) + .25 * np.sin(2 * np.pi * 2 * f * t)
    return lp(x, 400) * np.minimum(1, t / .01) * np.exp(-t * 1.6)
def whoosh(d=.8, up=True):
    t = tt(d); x = bp(rs.randn(len(t)), 400, 7000); return x * ((t / d) ** 2.5 if up else np.exp(-t * 5))
def hit():
    t = tt(2.0); f = 80 * np.exp(-t * 5) + 38
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.5) + lp(rs.randn(len(t)), 2500) * np.exp(-t * 7) * .4
def pop(f=900):
    t = tt(.12); return np.sin(2 * np.pi * (f + 900 * np.exp(-t * 40)) * t) * np.exp(-t * 35)
def click():
    t = tt(.03); return hp(rs.randn(len(t)), 2500) * np.exp(-t * 200) * .6
def chime(m):
    t = tt(2.6); f = N2F(m); return (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 2.01 * t)) * np.exp(-t * 1.5)

# ---- 0–5 · хук: мягкий пад и тихая пульсация ----
put(0, pad([50, 57, 62, 65, 69], 5.6, cut=1800), .5)
for k in range(10): put(0.3 + k * 0.45, lp(lyre(74 + (0, 3, 7, 5)[k % 4], .5, .993), 6000), .12, pan=(-.3, .3)[k % 2])
put(2.2, click(), .6); put(2.47, pop(700), .5); put(2.5, hit()[:int(.9 * SR)], .35); put(2.8, chime(86), .18)
put(4.2, whoosh(.8), .32); put(5.0, frame_drum(), .7); put(5.0, whoosh(1.0, False), .25)

# ---- 5–31.6 · древность: дрон, лира, бубен на сменах кадров ----
put(5.0, drone(38, 27.2), .42); put(5.0, drone(45, 27.2), .22)
put(5.2, pad([62, 65, 69], 10.5, cut=1200, att=3), .2); put(16.2, pad([60, 64, 67, 69], 15.5, cut=1300, att=2), .2)
MEL = [62, 65, 69, 67, 65, 64, 62, 60, 62, 69, 72, 69, 67, 65, 64, 62]  # ре-дорийский
t = 5.6; i = 0
while t < 31.2:
    if not (15.6 < t < 16.6):  # пауза перед штампом
        put(t, lyre(MEL[i % len(MEL)]), .3, pan=((i % 3) - 1) * .35)
        if i % 4 == 0: put(t, lyre(MEL[i % len(MEL)] - 12, 2.4), .18)
    t += 0.6 if i % 2 == 0 else 0.45; i += 1
for tb in (8.5, 11.5, 17.6, 21.0, 23.9, 26.8, 29.6): put(tb, frame_drum(), .45)
put(11.75, clink(2350), .5, pan=-.3); put(12.03, clink(2680), .45, pan=.3)
put(15.25, whoosh(.8), .4); put(16.05, stamp(), .85)
put(29.6, pad([62, 66, 69, 74], 3.0, cut=2000, att=.6), .25)
put(31.4, whoosh(.9), .4); put(32.3, hit(), .55)

# ---- 32.3–41.9 · сегодня: бит 100 BPM ----
B = 0.6; T0 = 32.3
PROG = [(38, [62, 65, 69]), (46, [58, 62, 65]), (41, [57, 60, 65]), (48, [55, 60, 64])]
for bar in range(4):
    root, ch = PROG[bar % 4]; tb = T0 + bar * 4 * B
    put(tb, pad(ch + [ch[0] + 12], 4 * B + .3, cut=2600, att=.15, rel=.3), .22)
    for b in range(4):
        tq = tb + b * B
        put(tq, kick(), .75)
        if b in (1, 3): put(tq, clap(), .5)
        put(tq, bass(root, B * .95), .45); put(tq + B / 2, bass(root + 12 if b == 3 else root, B * .45), .3)
        for h in range(2): put(tq + h * B / 2, hat(), .8, pan=.25)
for k in range(4): put(32.9 + k * 0.32, pop(800 + k * 120), .22)
for b in (0.12, 0.3, 0.48, 0.64, 0.79, 0.92): put(36.4 + 2.2 * b, pop(1300 + 900 * b), .18)
put(41.0, pop(600), .25); put(41.2, whoosh(.7), .45)

# ---- 41.9–48 · логотип и призыв ----
put(41.9, hit(), .8); put(41.9, pad([50, 57, 62, 66, 69, 74], 6.1, cut=3000, att=.2, rel=2.5), .45)
put(42.0, chime(86), .25); put(42.25, chime(93), .14); put(46.6, chime(81), .18); put(46.6, pop(1000), .2)

mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.1) * .88
fade = np.ones(n); fo = int(1.2 * SR); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
mix *= fade[:, None]
pcm = (mix / max(1e-6, np.abs(mix).max()) * .92 * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("track", sys.argv[1])
