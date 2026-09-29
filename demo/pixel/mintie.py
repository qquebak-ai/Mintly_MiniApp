# Минти для экрана-витрины: три варианта (очки, обычный, корона) и четыре
# покадровые анимации (дыхание с морганием, прыжок, привет лапкой, бег).
# Пиксель такой же мелкий, как у маскота на баннерах.
import math, json
from PIL import Image
V = ["#0A0014", "#1F0237", "#2E0556", "#45097F", "#5E10B0", "#7A1CD8", "#9636F0", "#B45CFF", "#D29AFF", "#F1E4FF"]
Y = ["#5A3A00", "#A87400", "#E8B400", "#FFD84A", "#FFF4B8"]
PINK = "#FF6AD5"; BLACK = "#07000F"; WHITE = "#FFFFFF"
R = 27; CW = CH = 112; S2 = 4

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

def draw(variant, st):
    px = {}
    def put(x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < CW and 0 <= y < CH: px[(x, y)] = c
    def ellc(ex, ey, rx, ry): return [(x, y) for x in range(int(ex - rx) - 1, int(ex + rx) + 2) for y in range(int(ey - ry) - 1, int(ey + ry) + 2) if ((x + 0.5 - ex) / rx) ** 2 + ((y + 0.5 - ey) / ry) ** 2 <= 1]
    def thick(a, b, t, c):
        n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]), 1)) * 2
        for k in range(n + 1):
            for q in ellc(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, t, t): put(*q, c)
    def toned(cells, ex, ey, rx, ry, hi):
        cells = set(cells)
        for (x, y) in cells:
            d = -0.6 * (x + 0.5 - ex) / rx - 0.8 * (y + 0.5 - ey) / ry
            c = V[hi] if d > 0.55 else V[hi - 1] if d > 0.1 else V[hi - 2] if d > -0.4 else V[hi - 3]
            if ((x + y * 0.6) % 31) < 1.4 and d > 0.0: c = V[min(hi + 1, 9)]
            put(x, y, c)
        for (x, y) in cells:
            for dd in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dd[0], y + dd[1])
                if q not in cells and q not in px: put(*q, V[1])
    sq, dy = st.get("sq", 0), st.get("dy", 0)
    rx, ry = R * (1 + sq), R * (1 - sq)
    cx = CW / 2
    ground = CH - 6
    by = ground - 0.35 * R - ry + dy
    # тень на земле — меньше, когда Минти в воздухе
    sh = max(0.35, 1 + dy / (1.2 * R))
    for q in ellc(cx, ground + 1.5, 0.75 * R * sh, 0.08 * R): put(*q, V[2])
    # ножки
    for fx, fdy in st.get("feet", [(-0.45, 0), (0.45, 0)]):
        fy = min(ground - 0.12 * R, by + ry + 0.05 * R + fdy)
        c = ellc(cx + fx * R, fy, 0.34 * R, 0.19 * R); toned(c, cx + fx * R, fy, 0.34 * R, 0.19 * R, 5)
    # ручки: угол от горизонтали (градусы), правая и левая
    def arm(side, ang, col):
        sx = cx + side * 0.93 * rx; sy = by + 0.1 * R
        a = math.radians(ang); ex = sx + side * math.cos(a) * 0.55 * R; ey = sy - math.sin(a) * 0.55 * R
        # тёмный контур — лапка читается и поверх тельца того же цвета
        thick((sx, sy), (ex, ey), 2.8, V[2])
        for q in ellc(ex, ey, 3.7, 3.7): put(*q, V[2])
        thick((sx, sy), (ex, ey), 1.8, col)
        for q in ellc(ex, ey, 2.7, 2.7): put(*q, V[7] if side > 0 else V[6])
    body = ellc(cx, by, rx, ry)
    toned(body, cx, by, rx, ry, 7)
    # лапки поверх края тельца — поднятая лапка иначе пряталась за ним
    arm(-1, st.get("armL", -35), V[4])
    arm(1, st.get("armR", -35), V[5])
    for q in ellc(cx - 0.42 * rx, by - 0.5 * ry, 0.16 * R, 0.1 * R): put(*q, V[8])
    put(cx - 0.5 * rx, by - 0.55 * ry, V[9]); put(cx - 0.47 * rx, by - 0.55 * ry, V[9])
    ey = by - 0.2 * R
    eyes = [(cx - 0.34 * R, ey), (cx + 0.3 * R, ey)]
    blink = st.get("blink")
    if variant == "glasses":
        for ex, _ in eyes:
            for q in ellc(ex, ey, 0.3 * R, 0.22 * R): put(*q, "#140726")
        thick((eyes[0][0] + 0.25 * R, ey - 0.05 * R), (eyes[1][0] - 0.25 * R, ey - 0.05 * R), 0.9, BLACK)
        thick((eyes[0][0] - 0.3 * R, ey - 0.05 * R), (cx - 0.95 * rx, ey - 0.12 * R), 0.9, BLACK)
        thick((eyes[1][0] + 0.3 * R, ey - 0.05 * R), (cx + 0.95 * rx, ey - 0.12 * R), 0.9, BLACK)
        g = st.get("glint")
        for ex, _ in eyes:
            cells = set(ellc(ex, ey, 0.3 * R, 0.22 * R))
            for (x, y) in list(cells):
                if any((x + a, y + b) not in cells for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))): put(x, y, BLACK)
            off = -0.2 if g is None else g
            for k in range(-4, 5):
                gx = ex + off * R + k * 0.35; gy = ey - k
                if (int(gx), int(gy)) in cells: put(gx, gy, V[8] if g is not None else V[5])
                if g is not None and (int(gx + 2), int(gy)) in cells: put(gx + 2, gy, V[9])
    else:
        for ex, _ in eyes:
            erx, ery = 0.19 * R, 0.28 * R
            if blink == "closed" or st.get("happy"):
                for t in range(-12, 13):
                    xx = ex + t * erx / 12; yy = ey + 0.12 * R - (1 - (t / 12) ** 2) * 2.4
                    put(xx, yy, V[1]); put(xx, yy + 1, V[1])
                continue
            cells = ellc(ex, ey, erx, ery)
            for q in cells: put(*q, WHITE)
            lx = st.get("look", 0.05)
            for q in ellc(ex + lx * R, ey + 0.06 * R, 0.1 * R, 0.16 * R): put(*q, BLACK)
            for q in ellc(ex + (lx - 0.06) * R, ey - 0.05 * R, 1.3, 1.3): put(*q, WHITE)
            cs = set(cells)
            for (x, y) in cs:
                for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if (x + a, y + b) not in cs and px.get((x + a, y + b)) != WHITE: put(x + a, y + b, V[1])
            if blink == "half":
                for (x, y) in cells:
                    if y < ey + 0.02 * R: put(x, y, V[6])
                for x in range(int(ex - erx), int(ex + erx) + 1): put(x, ey + 0.02 * R, V[1])
    for chx in (cx - 0.6 * R, cx + 0.55 * R):
        for q in ellc(chx, by + 0.14 * R, 0.13 * R, 0.065 * R): put(*q, PINK)
    if st.get("mouth") == "open":
        m = ellc(cx - 0.03 * R, by + 0.32 * R, 0.13 * R, 0.1 * R)
        for q in m: put(*q, "#3A0A2A")
        for q in ellc(cx - 0.03 * R, by + 0.37 * R, 0.08 * R, 0.05 * R): put(*q, PINK)
        ms = set(m)
        for (x, y) in ms:
            for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if (x + a, y + b) not in ms: put(x + a, y + b, V[1])
    else:
        for q in ellc(cx - 0.04 * R, by + 0.36 * R, 0.07 * R, 0.05 * R): put(*q, PINK)
        for t in range(-8, 9):
            xx = cx - 0.04 * R + t * 0.022 * R; yy = by + 0.26 * R + (1 - (t / 8) ** 2) * 0.09 * R
            put(xx, yy, V[1]); put(xx, yy + 1, V[1])
    if variant == "crown":
        top = by - ry
        pts = [(cx - 0.45 * R, top + 1.5), (cx - 0.45 * R, top - 0.42 * R), (cx - 0.22 * R, top - 0.18 * R), (cx, top - 0.5 * R), (cx + 0.22 * R, top - 0.18 * R), (cx + 0.45 * R, top - 0.42 * R), (cx + 0.45 * R, top + 1.5)]
        cells = poly(pts); cs = set(cells)
        ys = [y for _, y in cells]; y0, y1 = min(ys), max(ys)
        for (x, y) in cells: put(x, y, Y[3] if (y - y0) < (y1 - y0) * 0.45 else Y[2])
        for (x, y) in cells:
            if (x + 1, y) not in cs or (x, y + 1) not in cs: put(x, y, Y[1])
        for jx in (cx - 0.25 * R, cx, cx + 0.25 * R): put(jx, top - 0.06 * R, PINK); put(jx + 1, top - 0.06 * R, PINK)
    return px

ANIMS = {
    # дыхание и моргание: тот же набор кадров, что на баннере
    "idle": [{}, {"sq": 0.05}, {"sq": 0.09}, {"sq": -0.035}, {"blink": "half", "glint": 0.0}, {"blink": "closed", "glint": 0.25}],
    # прыжок: присел — толчок — вершина — падение — приземлился
    "jump": [{}, {"sq": 0.14, "armR": -60, "armL": -60}, {"sq": -0.1, "dy": -8, "armR": 40, "armL": 40, "feet": [(-0.3, 4), (0.3, 4)]},
             {"sq": -0.04, "dy": -22, "armR": 70, "armL": 70, "mouth": "open", "happy": True, "feet": [(-0.35, 2), (0.35, 2)]},
             {"sq": -0.06, "dy": -10, "armR": 30, "armL": 30, "feet": [(-0.35, 3), (0.35, 3)]}, {"sq": 0.12, "armR": -55, "armL": -55}],
    # привет: правая лапка машет из стороны в сторону
    "wave": [{"armR": 35, "mouth": "open"}, {"armR": 60, "mouth": "open"}, {"armR": 85, "mouth": "open", "happy": True}, {"armR": 60, "mouth": "open"}],
    # бег на месте: ножки меняются, тельце подпрыгивает, лапки в противофазе
    "run": [{"feet": [(-0.62, 0), (0.5, -5)], "armR": 20, "armL": -70, "look": 0.09},
            {"dy": -3, "sq": -0.03, "feet": [(-0.2, -2), (0.2, -3)], "armR": -20, "armL": -30, "look": 0.09},
            {"feet": [(-0.5, -5), (0.62, 0)], "armR": -70, "armL": 20, "look": 0.09},
            {"dy": -3, "sq": -0.03, "feet": [(-0.2, -3), (0.2, -2)], "armR": -30, "armL": -20, "look": 0.09}],
}
out = {}
for variant in ("glasses", "plain", "crown"):
    for name, frames in ANIMS.items():
        sheet = Image.new("RGBA", (CW * S2 * len(frames), CH * S2), (0, 0, 0, 0))
        for i, st in enumerate(frames):
            for (x, y), c in draw(variant, st).items():
                sheet.paste(tuple(int(c[k:k+2], 16) for k in (1, 3, 5)) + (255,), (i * CW * S2 + x * S2, y * S2, i * CW * S2 + (x + 1) * S2, (y + 1) * S2))
        fn = f"mintie-{variant}-{name}.webp"
        sheet.save(fn, lossless=True, method=6)
        out[f"{variant}-{name}"] = len(frames)
print(json.dumps(out))
