# Авторский трек под историю Эдисона (62 с). Газетная часть — мягкое
# «войлочное» пианино, контрабас и телеграфные щелчки морзянкой вместо хэта;
# бегущая лента тикера трещит, на «$40 000» — кассовый звонок; сегодняшняя
# часть — плотный бит; удар и звон на логотипе.
import numpy as np, wave, sys
from scipy.signal import butter, lfilter
SR = 44100; DUR = 62.0; n = int(SR * DUR); L = np.zeros(n); R = np.zeros(n)
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
def piano(m, d=2.2, v=1.0):
    # «войлочное» пианино: мягкая атака, гармоники быстро гаснут, лёгкая расстройка
    t = tt(d); f = N2F(m); x = 0
    for k, a, dk in ((1, 1, 2.2), (2, .45, 3.5), (3, .18, 5), (4, .08, 7)):
        x = x + a * np.sin(2 * np.pi * f * k * t * (1 + .0009 * k)) * np.exp(-t * dk)
    return lp(x, 2600) * np.minimum(1, t / .012) * v
def chord(ms, d=2.2, v=.5): return sum(piano(m, d, v) for m in ms) / len(ms)
def ubass(m, d=.9):
    t = tt(d); f = N2F(m); x = np.sin(2 * np.pi * f * t) + .35 * np.sin(2 * np.pi * 2 * f * t)
    return lp(x, 600) * np.exp(-t * 4) * np.minimum(1, t / .006)
def tick(f=2600, d=.035):
    # щелчок телеграфного ключа: короткий резонанс + стук
    t = tt(d); return (np.sin(2 * np.pi * f * t) * .6 + bp(rs.randn(len(t)), 1500, 6000)) * np.exp(-t * 160)
def softkick():
    t = tt(.3); f = 90 * np.exp(-t * 25) + 48; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)
def kick():
    t = tt(.35); f = 125 * np.exp(-t * 30) + 45; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
def clap():
    t = tt(.22); return bp(rs.randn(len(t)), 1000, 5000) * np.exp(-t * 20) * .6
def hat():
    t = tt(.06); return hp(rs.randn(len(t)), 7000) * np.exp(-t * 70) * .28
def sub(m, d):
    t = tt(d); return lp(np.sin(2 * np.pi * N2F(m) * t), 300) * np.exp(-t * 1.4) * np.minimum(1, t / .01)
def pad(ms, d, cut=2400, att=.6, rel=1.2):
    t = tt(d); x = sum(np.sin(2 * np.pi * N2F(m) * t * (1 + dt)) for m in ms for dt in (-.003, 0, .004)) / (3 * len(ms))
    return lp(x, cut) * np.minimum(1, t / att) * np.clip((d - t) / rel, 0, 1)
def whoosh(d=.8, up=True):
    t = tt(d); x = bp(rs.randn(len(t)), 400, 7000); return x * ((t / d) ** 2.5 if up else np.exp(-t * 5))
def paper(d=.7):
    # шорох бумаги при смене страницы
    t = tt(d); return bp(rs.randn(len(t)), 1800, 9000) * np.sin(np.pi * t / d) ** 2 * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t))
def bell():
    # кассовый звонок: два тона с негармоническими призвуками
    t = tt(2.2); x = 0
    for f, a, dk in ((1568, 1, 2.2), (1568 * 2.76, .45, 4), (2093, .7, 2.6), (2093 * 2.76, .3, 5)):
        x = x + a * np.sin(2 * np.pi * f * t) * np.exp(-t * dk)
    return x * .35
def hit():
    t = tt(2.0); f = 80 * np.exp(-t * 5) + 38
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.5) + lp(rs.randn(len(t)), 2500) * np.exp(-t * 7) * .4
def pop(f=900):
    t = tt(.12); return np.sin(2 * np.pi * (f + 900 * np.exp(-t * 40)) * t) * np.exp(-t * 35)
def ping(m):
    t = tt(1.6); f = N2F(m); return (np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * f * 3.01 * t)) * np.exp(-t * 3)

# морзянка: точка = 1 доля, тире = 3, паузы между знаками
def morse(t0, code, unit=.075, g=.5):
    t = t0
    for ch in code:
        if ch == " ": t += unit * 3; continue
        put(t, tick(2500), g, pan=-.2)
        if ch == "-": put(t + unit * 2, tick(2100), g * .7, pan=-.2)
        t += unit * (2 if ch == "." else 4)
    return t

# ---- 0–5.3 · хук ----
put(0.3, chord([57, 64, 69, 72], 3.0, .9), .5); put(2.6, chord([53, 60, 65, 69], 3.0, .9), .45)
put(1.5, ping(88), .2); put(2.6, whoosh(.5, False), .2)
morse(0.6, "-- .. -. -")  # M I N T
put(4.6, whoosh(.7), .3); put(5.3, paper(.8), .5)

# ---- 6–39.6 · газета: 92 BPM, пианино + контрабас + щелчки ----
B = 60 / 92; T0 = 6.0
PROG = [(45, [57, 60, 64, 69]), (41, [53, 57, 60, 65]), (48, [55, 60, 64, 67]), (43, [55, 59, 62, 67])]
bar = 0; t = T0
while t < 38.8:
    root, ch = PROG[bar % 4]
    put(t, chord(ch, 4 * B + .4, .9), .34)
    for b in range(4):
        tb = t + b * B
        put(tb, ubass(root if b % 2 == 0 else root + 7), .42)
        if b in (0, 2): put(tb, softkick(), .32)
        # телеграфный «хэт»: точка-тире на восьмых
        put(tb, tick(2600), .22, pan=.3); put(tb + B / 2, tick(2300), .16, pan=.3)
        if b == 3 and bar % 2: put(tb + B * .75, tick(2800), .12, pan=.3)
    t += 4 * B; bar += 1
for tc in (12.0, 18.2, 24.9, 31.3): put(tc - .2, paper(.7), .35)
tt0 = 20.4  # лента тикера трещит, пока ползёт
while tt0 < 24.4: put(tt0, tick(3200 + 300 * rs.rand(), .02), .1, pan=.4); tt0 += .085 + .03 * rs.rand()
k = 0
while 27.0 + k * .05 < 28.3: put(27.0 + k * .05, tick(1800 + k * 40, .025), .16); k += 1  # счётчик крутится
put(28.3, bell(), .6); put(28.3, softkick(), .4)
put(32.5, pad([57, 64, 69, 76], 6.0, cut=1800, att=1.2, rel=2), .22)
put(38.6, whoosh(.9), .4); put(39.4, paper(.7), .3); put(39.6, hit(), .5)

# ---- 39.6–56.4 · сегодня: 110 BPM ----
B2 = 60 / 110; T1 = 39.6
PROG2 = [(45, [57, 64, 69, 72]), (41, [53, 60, 65, 69]), (48, [55, 60, 64, 67]), (43, [55, 62, 67, 71])]
bar = 0; t = T1
while t < 56.0:
    root, ch = PROG2[bar % 4]
    put(t, pad(ch, 4 * B2 + .3, cut=2800, att=.1, rel=.3), .24)
    for b in range(4):
        tb = t + b * B2
        put(tb, kick(), .72)
        if b in (1, 3): put(tb, clap(), .5)
        put(tb, sub(root, B2 * .95), .5)
        for h in range(2): put(tb + h * B2 / 2, hat(), .75, pan=.25)
    t += 4 * B2; bar += 1
for i in range(4): put(51.6 + i * .4, pop(780 + i * 140), .22)
for i in range(16): put(46.3 + i * .25, tick(3400, .015), .08, pan=.5)  # тики живого графика
put(45.3, whoosh(.6, False), .2); put(50.7, whoosh(.6, False), .2)

# ---- 56–62 · призыв и логотип ----
put(56.1, chord([57, 64, 69, 72, 76], 2.8, 1), .45)
put(57.8, whoosh(.8), .45); put(58.6, hit(), .8); put(58.6, bell(), .35)
put(58.6, pad([45, 57, 64, 69, 72, 76], 3.4, cut=3200, att=.2, rel=2.2), .42)
put(59.8, pop(1000), .22)

mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.1) * .88
fade = np.ones(n); fo = int(1.0 * SR); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
mix *= fade[:, None]
pcm = (mix / max(1e-6, np.abs(mix).max()) * .92 * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("track", sys.argv[1])
