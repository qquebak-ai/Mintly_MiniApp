# Пиксельные картинки баннеров в стиле первого (гора с флагом):
# фиолетовая лесенка оттенков на прозрачном фоне, свет слева сверху.
from PIL import Image
import math, sys

RAMP = ["#12001F", "#1F0237", "#2E0556", "#45097F", "#5E10B0", "#7A1CD8", "#9636F0", "#B45CFF", "#D29AFF", "#F1E4FF"]
def rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5)) + (255,)

class Canvas:
    def __init__(s, w, h): s.w, s.h, s.px = w, h, {}
    def put(s, x, y, c):
        if 0 <= x < s.w and 0 <= y < s.h: s.px[(x, y)] = c
    def save(s, path, scale=20):
        im = Image.new("RGBA", (s.w * scale, s.h * scale), (0, 0, 0, 0))
        for (x, y), c in s.px.items():
            col = rgb(c) if isinstance(c, str) else rgb(RAMP[max(0, min(9, c))])
            im.paste(col, (x * scale, y * scale, (x + 1) * scale, (y + 1) * scale))
        bb = im.getbbox(); im = im.crop((bb[0] - scale, bb[1] - scale, bb[2] + scale, bb[3] + scale))
        im.save(path, quality=92, method=6)

def shade(cv, cells, base=5, band=True, rim=True, seed=0):
    """Заливка набора клеток: свет слева сверху, светлая кромка слева/сверху,
    тёмная справа/снизу, диагональные блики — как на горе."""
    cells = set(cells)
    xs = [x for x, _ in cells]; ys = [y for _, y in cells]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    for (x, y) in cells:
        nx = (x - x0) / max(1, x1 - x0); ny = (y - y0) / max(1, y1 - y0)
        v = base + 1.6 - 2.6 * nx - 1.4 * ny
        if band and ((x + y * 0.55 + seed) % 7) < 1.4: v += 1.6
        if ((x * 7 + y * 13 + seed) % 11) == 0: v -= 0.7  # лёгкая «дробь», как у горы
        if rim:
            if (x - 1, y) not in cells or (x, y - 1) not in cells: v += 1.3
            if (x + 1, y) not in cells or (x, y + 1) not in cells: v -= 1.6
        cv.put(x, y, int(round(max(1, min(8, v)))))

def poly(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    out = []
    for y in range(int(min(ys)), int(max(ys)) + 1):
        for x in range(int(min(xs)), int(max(xs)) + 1):
            px, py, inside, j = x + 0.5, y + 0.5, False, len(pts) - 1
            for i in range(len(pts)):
                xi, yi = pts[i]; xj, yj = pts[j]
                if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi: inside = not inside
                j = i
            if inside: out.append((x, y))
    return out

def rect(x0, y0, x1, y1, cut=1):
    out = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    if cut: out = [p for p in out if p not in {(x0, y0), (x1, y0), (x0, y1), (x1, y1)}]
    return out

def disc(cx, cy, r):
    return [(x, y) for x in range(int(cx - r) - 1, int(cx + r) + 2) for y in range(int(cy - r) - 1, int(cy + r) + 2) if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r]

def sparkle(cv, x, y, big=False):
    cv.put(x, y, 9)
    for d in ((1, 0), (-1, 0), (0, 1), (0, -1)): cv.put(x + d[0], y + d[1], 7)
    if big:
        for d in ((2, 0), (-2, 0), (0, 2), (0, -2)): cv.put(x + d[0], y + d[1], 5)

# ---------- 2 · торговля: свечи растут, стрелка вверх ----------
def candles():
    cv = Canvas(52, 52)
    for i, (x, top, bot, wt, wb) in enumerate([(4, 34, 45, 4, 3), (15, 26, 40, 4, 3), (26, 30, 38, 3, 3), (37, 12, 32, 5, 4)]):
        dark = i == 2  # одна свеча вниз — график живой, а не лесенка
        for y in range(top - wt, bot + wb + 1): cv.put(x + 3, y, 3 if dark else 6)
        shade(cv, rect(x, top, x + 6, bot), base=3 if dark else 5, seed=i * 3)
    # стрелка тренда — над свечами, не через них
    path = [(1, 25), (12, 17), (21, 20), (33, 6)]
    for (ax, ay), (bx, by) in zip(path, path[1:]):
        n = max(abs(bx - ax), abs(by - ay))
        for k in range(n + 1):
            x = round(ax + (bx - ax) * k / n); y = round(ay + (by - ay) * k / n)
            cv.put(x, y, 9); cv.put(x, y + 1, 6)
    shade(cv, poly([(30.8, 2.6), (37.4, 0.4), (36.2, 7.6)]), base=8, band=False, rim=False)
    sparkle(cv, 46, 6, True); sparkle(cv, 8, 20); sparkle(cv, 47, 40)
    return cv

# ---------- 3 · скорость: монета с молнией и следом ----------
def bolt():
    cv = Canvas(60, 46)
    cx, cy, r = 38, 23, 17
    # ребро монеты — сдвинутый тёмный диск, получается мультяшный объём
    shade(cv, [p for p in disc(cx + 3, cy + 2, r)], base=2, band=False, rim=False)
    face = disc(cx, cy, r)
    shade(cv, face, base=5, seed=2)
    ring = [p for p in face if (p[0] + 0.5 - cx) ** 2 + (p[1] + 0.5 - cy) ** 2 > (r - 2.2) ** 2]
    for (x, y) in ring: cv.put(x, y, 7 if x + y < cx + cy else 4)
    # молния на лице монеты
    b = poly([(40, 9), (30, 25), (37, 25), (33, 38), (46, 19), (39, 19), (43, 9)])
    for (x, y) in b: cv.put(x, y, 9 if (x + y) % 5 else 8)
    for (x, y) in b:
        for d in ((1, 0), (0, 1)):
            q = (x + d[0], y + d[1])
            if q not in b and q in set(face): cv.put(*q, 2)
    # линии скорости слева
    for y, x0, ln in [(12, 4, 12), (18, 0, 16), (24, 6, 13), (30, 2, 15), (36, 8, 10)]:
        for x in range(x0, x0 + ln): cv.put(x, y, 8 if x > x0 + ln * 0.6 else (6 if x > x0 + ln * 0.3 else 4))
    sparkle(cv, 56, 5, True); sparkle(cv, 19, 7); sparkle(cv, 57, 41)
    return cv

# ---------- 4 · магазин: лавка с полосатым навесом ----------
def shop():
    cv = Canvas(52, 50)
    shade(cv, rect(8, 22, 43, 45), base=4, seed=1)                      # стены
    shade(cv, rect(6, 45, 45, 47, cut=0), base=2, band=False)            # порог
    for (x, y) in rect(12, 27, 27, 40): cv.put(x, y, 1 if (x + y) % 9 else 3)  # витрина
    for k in range(4): cv.put(14 + k, 29 + k, 7); cv.put(15 + k, 29 + k, 6)    # блик на стекле
    shade(cv, rect(31, 28, 39, 45, cut=0), base=3, band=False)           # дверь
    cv.put(33, 37, 9)
    # навес: полосы белая/фиолетовая, фестоны снизу
    for x in range(5, 47):
        stripe = ((x - 5) // 5) % 2 == 0
        for y in range(12, 21):
            v = (9 if y < 14 else 8) if stripe else (7 if y < 14 else 6)
            if x == 5 or y == 20: v -= 2
            cv.put(x, y, v)
        if ((x - 5) % 5) in (1, 2, 3): cv.put(x, 21, 8 if stripe else 5)
    shade(cv, rect(4, 9, 47, 11, cut=0), base=4, band=False)             # козырёк
    # вывеска-сердечко облика: звезда над крышей
    star = poly([(26, 0), (28, 4.5), (33, 5), (29, 8), (30.5, 13), (26, 10), (21.5, 13), (23, 8), (19, 5), (24, 4.5)])
    shade(cv, [p for p in star if p[1] < 9], base=7, band=False)
    sparkle(cv, 47, 3, True); sparkle(cv, 6, 3); sparkle(cv, 49, 30)
    return cv

candles().save("banner-px-trade.webp")
bolt().save("banner-px-fast.webp")
shop().save("banner-px-shop.webp")
