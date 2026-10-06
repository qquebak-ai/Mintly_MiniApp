# Трек к вертикальному ролику (25 с): тихое пианино с треском пластинки под
# диалог, разгон и удар на слове «НИКТО», тёплый ритм под гравюру со стуком
# в дверь и сигналом «в эфире», пауза-удар на фразе и мягкий аккорд на финале.
import numpy as np, wave, sys
from scipy.signal import butter, lfilter
SR = 44100; DUR = 25.0; n = int(SR * DUR); L = np.zeros(n); R = np.zeros(n)
rs = np.random.RandomState(12)
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
def piano(m, d=2.4, v=1.0):
    t = tt(d); f = N2F(m); x = 0
    for k, a, dk in ((1, 1, 2.0), (2, .4, 3.2), (3, .15, 4.6), (4, .06, 6.5)):
        x = x + a * np.sin(2 * np.pi * f * k * t * (1 + .0008 * k)) * np.exp(-t * dk)
    return lp(x, 2600) * np.minimum(1, t / .01) * v
def chord(ms, d=2.4, v=.7): return sum(piano(m, d, v) for m in ms) / len(ms)
def crackle(d):
    x = np.zeros(int(d * SR)); idx = rs.randint(0, len(x), int(d * 34)); x[idx] = rs.uniform(-1, 1, len(idx))
    return hp(lp(x, 6000), 900) * .6 + lp(rs.randn(len(x)), 3000) * .012
def kick():
    t = tt(.35); f = 110 * np.exp(-t * 24) + 46; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
def snare():
    t = tt(.25); return bp(rs.randn(len(t)), 900, 6000) * np.exp(-t * 18) * .5
def hat():
    t = tt(.05); return hp(rs.randn(len(t)), 7500) * np.exp(-t * 80) * .22
def bass(m, d):
    t = tt(d); return lp(np.sin(2 * np.pi * N2F(m) * t), 400) * np.exp(-t * 2.5) * np.minimum(1, t / .008)
def knock():
    t = tt(.16); f = 140 * np.exp(-t * 18) + 90
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) + bp(rs.randn(len(t)), 300, 1800) * .6) * np.exp(-t * 28)
def static(d):
    t = tt(d); return bp(rs.randn(len(t)), 1500, 7000) * np.sin(np.pi * t / d)
def beep():
    t = tt(.4); return np.sin(2 * np.pi * 1000 * t) * np.minimum(1, t / .005) * np.clip((.35 - t) / .02, 0, 1)
def riser(d):
    t = tt(d); return bp(rs.randn(len(t)), 500, 8000) * (t / d) ** 3 + np.sin(2 * np.pi * (200 + 600 * (t / d) ** 2) * t) * (t / d) ** 2 * .3
def hit():
    t = tt(2.2); f = 75 * np.exp(-t * 5) + 36
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.3) + lp(rs.randn(len(t)), 2500) * np.exp(-t * 7) * .45
def pad(ms, d, cut=2400, att=.6, rel=1.5):
    t = tt(d); x = sum(np.sin(2 * np.pi * N2F(m) * t * (1 + dt)) for m in ms for dt in (-.003, 0, .004)) / (3 * len(ms))
    return lp(x, cut) * np.minimum(1, t / att) * np.clip((d - t) / rel, 0, 1)
def pop(f=900):
    t = tt(.12); return np.sin(2 * np.pi * (f + 900 * np.exp(-t * 40)) * t) * np.exp(-t * 35)
def chime(m):
    t = tt(2.6); f = N2F(m); return (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 2.01 * t)) * np.exp(-t * 1.6)

# диалог: пианино на каждой реплике, треск пластинки
put(0, crackle(8.3), .45)
for tc, ch in ((0.1, [57, 64, 69, 72]), (2.15, [53, 60, 65, 69]), (4.3, [55, 62, 67, 71]), (6.3, [52, 59, 64, 67])):
    put(tc, chord(ch, 2.3, 1), .5); put(tc, piano(ch[0] - 12, 2.3, 1), .3)
put(7.4, riser(1.15), .5); put(8.55, hit(), .9)

# гравюра: ритм 92 BPM с бочкой, малым и басом
B = 60 / 92; t0 = 9.0; PROG = [(45, [57, 64, 69, 72]), (41, [53, 60, 65, 69]), (48, [55, 60, 64, 67]), (43, [55, 59, 62, 67])]
bar = 0; t = t0
while t < 17.3:
    root, ch = PROG[bar % 4]
    put(t, chord(ch, 4 * B + .4, .9), .32)
    for b in range(4):
        tb = t + b * B
        if tb > 17.3: break
        if b in (0, 2): put(tb, kick(), .5)
        if b in (1, 3): put(tb, snare(), .35)
        for h in range(2): put(tb + h * B / 2, hat(), .7, pan=.25)
        put(tb, bass(root, B * .9), .38)
    t += 4 * B; bar += 1
for k in range(3):
    for j in range(3): put(12.8 + k * 0.42 + j * 0.12, knock(), .45, pan=-.3)
put(14.4, static(0.8), .12); put(14.9, beep(), .16)
put(15.85, pad([57, 64, 69, 76, 81], 1.8, cut=3000, att=.3, rel=1.2), .3)

# фраза: тишина и удар, затем аккорд
put(17.6, hit(), .7); put(17.75, chord([45, 52, 57, 64, 69], 2.6, 1), .5)
# приложение
put(20.35, pop(800), .25); put(20.6, chime(81), .25); put(20.6, pad([45, 57, 64, 69, 76], 4.3, cut=2800, att=.3, rel=2.0), .35)
put(21.8, pop(1100), .18)

mix = np.stack([L, R], 1); mix = np.tanh(mix * 1.1) * .88
fade = np.ones(n); fo = int(.8 * SR); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5; mix *= fade[:, None]
pcm = (mix / max(1e-6, np.abs(mix).max()) * .92 * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("track", sys.argv[1])
