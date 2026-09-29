# Баннеры 2–4: плоский пиксель-арт в духе горы с флагом, на каждом —
# маскот Минти (круглая фиолетовая монетка-зверёк). Сцена на весь
# баннер; левый верх пуст под заголовок, левый низ — под кнопку.
from PIL import Image
import math

V = ["#0A0014", "#1F0237", "#2E0556", "#45097F", "#5E10B0", "#7A1CD8", "#9636F0", "#B45CFF", "#D29AFF", "#F1E4FF"]
G = ["#063A1E", "#0B6B34", "#12A150", "#2EE87A", "#A8FFCB"]
Y = ["#5A3A00", "#A87400", "#E8B400", "#FFD84A", "#FFF4B8"]
PINK = "#FF6AD5"; BLACK = "#07000F"; WHITE = "#FFFFFF"
GW, GH, SC = 120, 50, 12

class C:
    def __init__(s): s.px = {}
    def put(s, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < GW and 0 <= y < GH: s.px[(x, y)] = c
    def get(s, x, y): return s.px.get((x, y))
    def save(s, path):
        im = Image.new("RGBA", (GW * SC, GH * SC), (0, 0, 0, 0))
        for (x, y), c in s.px.items():
            im.paste(tuple(int(c[i:i+2], 16) for i in (1, 3, 5)) + (255,), (x * SC, y * SC, (x + 1) * SC, (y + 1) * SC))
        im.save(path, quality=95, method=6)

def shade(cv, cells, ramp, base, band=True, seed=0, rim=True):
    cells = set(cells)
    if not cells: return
    xs = [x for x, _ in cells]; ys = [y for _, y in cells]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    top = len(ramp) - 1
    for (x, y) in cells:
        nx = (x - x0) / max(1, x1 - x0); ny = (y - y0) / max(1, y1 - y0)
        v = base + 1.2 - 1.9 * nx - 1.2 * ny
        if band and ((x + y * 0.55 + seed) % 7) < 1.3: v += 1.3
        if rim:
            if (x - 1, y) not in cells or (x, y - 1) not in cells: v += 1.0
            if (x + 1, y) not in cells or (x, y + 1) not in cells: v -= 1.3
        cv.put(x, y, ramp[int(round(max(1, min(top - 1 if ramp is V else top, v))))])

def rect(x0, y0, x1, y1, cut=True):
    out = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    return [p for p in out if not (cut and p in {(x0, y0), (x1, y0), (x0, y1), (x1, y1)})]
def disc(cx, cy, r): return [(x, y) for x in range(int(cx - r) - 1, int(cx + r) + 2) for y in range(int(cy - r) - 1, int(cy + r) + 2) if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r]
def ell(cx, cy, rx, ry): return [(x, y) for x in range(int(cx - rx) - 1, int(cx + rx) + 2) for y in range(int(cy - ry) - 1, int(cy + ry) + 2) if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1]
def poly(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; out = []
    for y in range(int(min(ys)), int(max(ys)) + 1):
        for x in range(int(min(xs)), int(max(xs)) + 1):
            px, py, ins, j = x + 0.5, y + 0.5, False, len(pts) - 1
            for i in range(len(pts)):
                xi, yi = pts[i]; xj, yj = pts[j]
                if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi: ins = not ins
                j = i
            if ins: out.append((x, y))
    return out
def line(cv, a, b, c, w=1):
    n = max(abs(b[0] - a[0]), abs(b[1] - a[1]), 1)
    for k in range(n + 1):
        x = a[0] + (b[0] - a[0]) * k / n; y = a[1] + (b[1] - a[1]) * k / n
        for dx in range(w):
            cv.put(x + dx, y, c)
def outline(cv, cells, c=V[1]):
    cells = set(cells)
    for (x, y) in cells:
        for d in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + d[0], y + d[1])
            if q not in cells and cv.get(*q) is None: cv.put(*q, c)
def sparkle(cv, x, y, big=False, col=None):
    cv.put(x, y, WHITE)
    for d in ((1, 0), (-1, 0), (0, 1), (0, -1)): cv.put(x + d[0], y + d[1], col or V[8])
    if big:
        for d in ((2, 0), (-2, 0), (0, 2), (0, -2)): cv.put(x + d[0], y + d[1], V[6])
def stars(cv, pts):
    for x, y in pts: cv.put(x, y, V[5] if (x + y) % 3 else V[7])

def mascot(cv, cx, cy, r=9, glasses=False, crown=False, run=False, arm_up=None, hold=None):
    """Минти: круглое фиолетовое тельце, большие глаза, щёчки, ножки."""
    # ножки
    if run:
        feet = [ell(cx - 5, cy + r + 1, 3, 1.6), ell(cx + 4, cy + r - 1, 3, 1.6)]
    else:
        feet = [ell(cx - 4, cy + r + 1, 2.8, 1.6), ell(cx + 4, cy + r + 1, 2.8, 1.6)]
    for f in feet: shade(cv, f, V, 3, band=False)
    body = disc(cx, cy, r)
    outline(cv, body, V[2])
    shade(cv, body, V, 6, seed=3)
    # глаза
    for ex in (() if glasses else (cx - 4, cx + 2)):
        for (x, y) in ell(ex + 0.5, cy - 2, 2.1, 2.8): cv.put(x, y, WHITE)
        cv.put(ex + 1, cy - 1, BLACK); cv.put(ex + 1, cy - 2, BLACK); cv.put(ex + (0 if ex < cx else 1), cy - 1, BLACK)
        cv.put(ex, cy - 3, WHITE)
    if glasses:
        for x in range(cx - 7, cx + 6):
            for y in range(cy - 4, cy):
                if not (y == cy - 1 and x in (cx - 1, cx)): cv.put(x, y, BLACK)
        cv.put(cx - 5, cy - 3, V[8]); cv.put(cx - 4, cy - 3, V[7]); cv.put(cx + 3, cy - 3, V[8])
        line(cv, (cx - 8, cy - 3), (cx - 9, cy - 3), BLACK)
    # щёчки и улыбка
    cv.put(cx - 6, cy + 1, PINK); cv.put(cx - 5, cy + 1, PINK); cv.put(cx + 4, cy + 1, PINK); cv.put(cx + 5, cy + 1, PINK)
    for x, y in [(cx - 2, cy + 2), (cx - 1, cy + 3), (cx, cy + 3), (cx + 1, cy + 2)]: cv.put(x, y, V[1])
    cv.put(cx - 1, cy + 4, PINK); cv.put(cx, cy + 4, PINK)
    # ручки
    if arm_up == "right":
        line(cv, (cx + r - 1, cy), (cx + r + 3, cy - 5), V[5], 2); cv.put(cx + r + 4, cy - 6, V[7]); cv.put(cx + r + 3, cy - 6, V[7])
        line(cv, (cx - r, cy + 2), (cx - r - 2, cy + 4), V[4], 2)
    elif run:
        line(cv, (cx + r - 1, cy + 1), (cx + r + 3, cy - 1), V[5], 2)
        line(cv, (cx - r, cy + 1), (cx - r - 3, cy + 3), V[4], 2)
    else:
        line(cv, (cx - r, cy + 2), (cx - r - 2, cy + 4), V[4], 2)
        line(cv, (cx + r - 1, cy + 2), (cx + r + 1, cy + 4), V[5], 2)
    if crown:
        pts = [(cx - 4, cy - r + 1), (cx - 4, cy - r - 3), (cx - 2, cy - r - 1), (cx, cy - r - 4), (cx + 2, cy - r - 1), (cx + 4, cy - r - 3), (cx + 4, cy - r + 1)]
        cr = poly(pts); shade(cv, cr, Y, 3, band=False)
        cv.put(cx, cy - r - 1, PINK)

def planet(cv, cx, cy, r):
    p = disc(cx, cy, r)
    shade(cv, p, V, 4, seed=5)
    for (x, y) in p:
        if (x * 3 + y * 5) % 17 == 0: cv.put(x, y, V[3])
    # кольцо
    for t in range(0, 360, 2):
        a = math.radians(t); x = cx + math.cos(a) * r * 1.6; y = cy + math.sin(a) * r * 0.35
        if not (math.sin(a) < 0 and (int(x), int(y)) in set(p)): cv.put(x, y, V[7] if math.cos(a) < 0 else V[5])

def speed_lines(cv, rows):
    for y, x0, ln in rows:
        for x in range(x0, x0 + ln):
            k = (x - x0) / ln
            cv.put(x, y, V[3] if k < 0.35 else V[5] if k < 0.7 else V[8])

# ---------- 2 · торговля ----------
def trade():
    cv = C()
    stars(cv, [(58, 4), (66, 12), (74, 3), (88, 9), (46, 30), (115, 30), (52, 45), (80, 20)])
    specs = [(62, 40, 49, 4, 0, True), (72, 33, 46, 3, 3, True), (82, 37, 44, 3, 2, False), (92, 30, 43, 4, 3, True), (103, 27, 49, 0, 0, True)]
    for i, (x, top, bot, wt, wb, up) in enumerate(specs):
        ramp = G if up else V
        for y in range(top - wt, min(GH, bot + wb + 1)): cv.put(x + 3, y, (G[2] if up else V[4]))
        shade(cv, rect(x, top, x + 6, bot), ramp, 3 if up else 4, seed=i * 2)
    # Минти в очках стоит на самой высокой свече, лапка вверх
    MASCOTS['trade'] = dict(cx=106, cy=17, r=8, glasses=True, arm_up='right')
    sparkle(cv, 96, 8, True, Y[3]); sparkle(cv, 118, 30, False, G[3]); sparkle(cv, 70, 22); sparkle(cv, 117, 3)
    return cv

# ---------- 3 · скорость ----------
def fast():
    cv = C()
    stars(cv, [(60, 5), (72, 2), (86, 7), (110, 3), (116, 26), (50, 44), (70, 47)])
    # большая молния за краем справа — жёлтый акцент
    bolt = poly([(108, -2), (96, 22), (104, 22), (97, 48), (121, 16), (112, 16), (119, -2)])
    shade(cv, bolt, Y, 3, seed=1)
    # след скорости
    speed_lines(cv, [(18, 56, 13), (23, 52, 17), (28, 55, 14), (33, 53, 15), (38, 58, 11)])
    # Минти бежит, в лапке маленькая молния
    MASCOTS['fast'] = dict(cx=80, cy=27, r=10, run=True)
    b2 = poly([(94, 14), (89, 22), (92, 22), (89, 29), (96, 20), (93, 20), (96, 14)])
    shade(cv, b2, Y, 3, band=False)
    # пыль из-под ног
    for x, y in [(66, 39), (64, 40), (62, 39), (60, 41)]: cv.put(x, y, V[4])
    sparkle(cv, 90, 5, True, Y[3]); sparkle(cv, 64, 14); sparkle(cv, 118, 42, False, Y[3])
    return cv

# ---------- 4 · магазин ----------
def shop():
    cv = C()
    stars(cv, [(56, 4), (64, 10), (78, 3), (70, 18), (50, 46), (60, 40)])
    # лавка справа, уходит за край
    shade(cv, rect(92, 22, 121, 49, cut=False), V, 4, seed=2)
    for (x, y) in rect(95, 27, 108, 38): cv.put(x, y, V[1] if (x + y) % 8 else V[3])
    # на витрине — карты кошелька (скины)
    for i, (cx, col) in enumerate([(97, G), (101, Y), (105, V)]):
        shade(cv, rect(cx, 31 - i, cx + 3, 36 - i), col, 3, band=False)
    shade(cv, rect(111, 30, 119, 49, cut=False), V, 3, band=False)
    cv.put(113, 40, Y[3])
    # навес: белые и фиолетовые полосы, фестоны
    for x in range(88, GW):
        stripe = ((x - 88) // 4) % 2 == 0
        for y in range(13, 20):
            v = (V[9] if y < 15 else V[8]) if stripe else (V[7] if y < 15 else V[6])
            if y == 19: v = V[7] if stripe else V[5]
            cv.put(x, y, v)
        if ((x - 88) % 4) in (1, 2): cv.put(x, 20, V[8] if stripe else V[5])
    shade(cv, rect(87, 10, 121, 12, cut=False), V, 4, band=False)
    # вывеска-звезда
    star = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5; rr = 4.6 if i % 2 == 0 else 2.0
        star.append((104 + math.cos(a) * rr, 5 + math.sin(a) * rr))
    shade(cv, poly(star), Y, 3, band=False)
    # Минти в короне держит карту
    MASCOTS['shop'] = dict(cx=74, cy=34, r=9, crown=True)
    card = rect(81, 30, 89, 36)
    shade(cv, card, G, 3, band=False)
    for x in range(82, 89): cv.put(x, 32, G[0])
    cv.put(83, 34, Y[3]); cv.put(84, 34, Y[3])
    sparkle(cv, 88, 26, True, Y[3]); sparkle(cv, 62, 20); sparkle(cv, 84, 6)
    return cv

MASCOTS = {}
trade().save("banner-mx-trade.webp")
fast().save("banner-mx-fast.webp")
shop().save("banner-mx-shop.webp")

# ---------- маскот в мелком пикселе: кадры для анимации ----------
# Пиксель маскота втрое мельче пикселя фона (4px против 12px).
F = 3
def mascot_frame(p, frame):
    r = p["r"]; R = r * F
    x0, y0 = p["cx"] - r - 6, p["cy"] - r - 7
    w, h = 2 * r + 13, 2 * r + 11
    cw, ch = w * F, h * F
    cx, cy = (p["cx"] - x0) * F + 1, (p["cy"] - y0) * F + 1
    px = {}
    def put(x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < cw and 0 <= y < ch: px[(x, y)] = c
    def ellc(ex, ey, rx, ry): return [(x, y) for x in range(int(ex - rx) - 1, int(ex + rx) + 2) for y in range(int(ey - ry) - 1, int(ey + ry) + 2) if ((x + 0.5 - ex) / rx) ** 2 + ((y + 0.5 - ey) / ry) ** 2 <= 1]
    def thick(a, b, t, c):
        n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]), 1)) * 2
        for k in range(n + 1):
            x = a[0] + (b[0] - a[0]) * k / n; y = a[1] + (b[1] - a[1]) * k / n
            for q in ellc(x, y, t, t): put(*q, c)
    def toned(cells, ex, ey, rx, ry, ramp, hi):
        # плоские ступени света слева сверху + светлая кромка, тёмный край — как у горы
        cells = set(cells)
        for (x, y) in cells:
            nx, ny = (x + 0.5 - ex) / rx, (y + 0.5 - ey) / ry
            d = -0.6 * nx - 0.8 * ny
            c = ramp[hi] if d > 0.55 else ramp[hi - 1] if d > 0.1 else ramp[hi - 2] if d > -0.4 else ramp[hi - 3]
            if ((x + y * 0.6) % 31) < 1.4 and d > 0.0: c = ramp[min(hi + 1, len(ramp) - 1)]
            put(x, y, c)
        for (x, y) in cells:
            for dd in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dd[0], y + dd[1])
                if q not in cells and q not in px: put(*q, V[1])
    sq = {0: 0, 1: 0.05, 2: 0.09, 3: -0.035}.get(frame, 0)
    blink = {4: "half", 5: "closed"}.get(frame)
    rx, ry = R * (1 + sq), R * (1 - sq)
    by = cy + R * sq  # тельце оседает, ножки стоят на месте
    # ножки
    fy = cy + R - 0.5
    feet = [(cx - 0.62 * R, fy + 1.5), (cx + 0.5 * R, fy - 2.5)] if p.get("run") else [(cx - 0.45 * R, fy), (cx + 0.45 * R, fy)]
    for fx, fy2 in feet:
        cells = ellc(fx, fy2, 0.34 * R, 0.19 * R); toned(cells, fx, fy2, 0.34 * R, 0.19 * R, V, 5)
    # ручки (под телом)
    arm = V[5]
    if p.get("arm_up") == "right":
        thick((cx + 0.8 * rx, by - 0.05 * R), (cx + 1.25 * R, by - 0.75 * R), 1.7, arm); 
        for q in ellc(cx + 1.3 * R, by - 0.82 * R, 2.6, 2.6): put(*q, V[7])
        thick((cx - 0.9 * rx, by + 0.25 * R), (cx - 1.2 * R, by + 0.5 * R), 1.7, V[4])
    elif p.get("run"):
        thick((cx + 0.85 * rx, by + 0.1 * R), (cx + 1.3 * R, by - 0.12 * R), 1.7, arm)
        thick((cx - 0.9 * rx, by + 0.1 * R), (cx - 1.3 * R, by + 0.35 * R), 1.7, V[4])
    else:
        thick((cx - 0.9 * rx, by + 0.25 * R), (cx - 1.2 * R, by + 0.52 * R), 1.7, V[4])
        thick((cx + 0.85 * rx, by + 0.25 * R), (cx + 1.15 * R, by + 0.5 * R), 1.7, arm)
    body = ellc(cx, by, rx, ry)
    toned(body, cx, by, rx, ry, V, 7)
    for q in ellc(cx - 0.42 * rx, by - 0.5 * ry, 0.16 * R, 0.1 * R): put(*q, V[8])
    put(cx - 0.5 * rx, by - 0.55 * ry, V[9]); put(cx - 0.47 * rx, by - 0.55 * ry, V[9])
    ey = by - 0.2 * R
    eyes = [(cx - 0.36 * R, ey), (cx + 0.3 * R, ey)]
    if p.get("glasses"):
        # очки: тёмные стёкла, мост, блик бежит по стёклам на кадрах 4–5
        for ex, _ in eyes:
            for q in ellc(ex, ey, 0.3 * R, 0.22 * R): put(*q, "#140726")
        thick((eyes[0][0] + 0.25 * R, ey - 0.05 * R), (eyes[1][0] - 0.25 * R, ey - 0.05 * R), 0.9, BLACK)
        thick((eyes[0][0] - 0.3 * R, ey - 0.05 * R), (cx - 0.95 * rx, ey - 0.12 * R), 0.9, BLACK)
        for ex, _ in eyes:
            cells = set(ellc(ex, ey, 0.3 * R, 0.22 * R))
            for (x, y) in list(cells):
                if any((x + d0, y + d1) not in cells for d0, d1 in ((1, 0), (-1, 0), (0, 1), (0, -1))): put(x, y, BLACK)
            off = {4: 0.0, 5: 0.25}.get(frame, -0.2)
            for k in range(-4, 5):
                gx = ex + (off * R) + k * 0.35; gy = ey - k
                if (int(gx), int(gy)) in cells: put(gx, gy, V[8] if frame in (4, 5) else V[5])
                if (int(gx + 2), int(gy)) in cells and frame in (4, 5): put(gx + 2, gy, V[9])
    else:
        for i, (ex, _) in enumerate(eyes):
            erx, ery = 0.19 * R, 0.28 * R
            if blink == "closed":
                for t in range(-12, 13):
                    xx = ex + t * erx / 12; yy = ey + 0.12 * R - (1 - (t / 12) ** 2) * 2.2
                    put(xx, yy, V[1]); put(xx, yy + 1, V[1])
                continue
            cells = ellc(ex, ey, erx, ery)
            for q in cells: put(*q, WHITE)
            for q in ellc(ex + 0.05 * R, ey + 0.06 * R, 0.1 * R, 0.16 * R): put(*q, BLACK)
            for q in ellc(ex - 0.01 * R, ey - 0.05 * R, 1.3, 1.3): put(*q, WHITE)
            put(ex + 0.11 * R, ey + 0.16 * R, WHITE)
            cs = set(cells)
            for (x, y) in cs:
                for d0, d1 in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if (x + d0, y + d1) not in cs and px.get((x + d0, y + d1)) != WHITE: put(x + d0, y + d1, V[1])
            if blink == "half":
                for (x, y) in cells:
                    if y < ey + 0.02 * R: put(x, y, V[6])
                for x in range(int(ex - erx), int(ex + erx) + 1): put(x, ey + 0.02 * R, V[1])
    # щёчки и улыбка
    for chx in (cx - 0.6 * R, cx + 0.55 * R):
        for q in ellc(chx, by + 0.14 * R, 0.13 * R, 0.065 * R): put(*q, PINK)
    # улыбка — сплошная дуга, язычок снизу
    for q in ellc(cx - 0.04 * R, by + 0.36 * R, 0.07 * R, 0.05 * R): put(*q, PINK)
    for t in range(-8, 9):
        xx = cx - 0.04 * R + t * 0.022 * R; yy = by + 0.26 * R + (1 - (t / 8) ** 2) * 0.09 * R
        put(xx, yy, V[1]); put(xx, yy + 1, V[1])
    if p.get("crown"):
        top = by - ry
        pts = [(cx - 0.45 * R, top + 1.5), (cx - 0.45 * R, top - 0.42 * R), (cx - 0.22 * R, top - 0.18 * R), (cx, top - 0.5 * R), (cx + 0.22 * R, top - 0.18 * R), (cx + 0.45 * R, top - 0.42 * R), (cx + 0.45 * R, top + 1.5)]
        cells = poly(pts)
        ys = [y for _, y in cells]; y0c, y1c = min(ys), max(ys)
        for (x, y) in cells: put(x, y, Y[3] if (y - y0c) < (y1c - y0c) * 0.45 else Y[2])
        for (x, y) in cells:
            if (x + 1, y) not in set(cells) or (x, y + 1) not in set(cells): put(x, y, Y[1])
        for jx in (cx - 0.25 * R, cx, cx + 0.25 * R): put(jx, top - 0.06 * R, PINK); put(jx + 1, top - 0.06 * R, PINK)
    return px, (x0, y0, w, h, cw, ch)

import json
S2 = 4
boxes = {}
for name, p in MASCOTS.items():
    frames = []
    for f in range(6):
        px, box = mascot_frame(p, f)
        frames.append(px)
    x0, y0, w, h, cw, ch = box
    sheet = Image.new("RGBA", (cw * S2 * 6, ch * S2), (0, 0, 0, 0))
    for i, px in enumerate(frames):
        for (x, y), c in px.items():
            sheet.paste(tuple(int(c[k:k+2], 16) for k in (1, 3, 5)) + (255,), (i * cw * S2 + x * S2, y * S2, i * cw * S2 + (x + 1) * S2, (y + 1) * S2))
    sheet.save(f"mintie-{name}.webp", lossless=True, method=6)
    boxes[name] = dict(x0=x0, y0=y0, w=w, h=h)
print(json.dumps(boxes))
