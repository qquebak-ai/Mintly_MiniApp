# Минти v3: аксолотль в квадратном пиксельном стиле — голова-брусок,
# перистые розовые жабры, хвост вбок, четыре лапки, глаза-квадраты, листик мяты.
# пиксель, 3 тона + контур. Единица рисунка — полпикселя фона баннера.
import json
from PIL import Image
L, M, D, O = "#8FF7CF", "#3FD9A0", "#1E9E73", "#0B4A37"   # свет, тон, тень, контур
EYE = "#06100C"; LEAF, LEAF2 = "#2EE87A", "#12A150"
Y = ["#A87400", "#E8B400", "#FFD84A"]; WH = "#FFFFFF"

def sprite(cw, ch, ground, st, variant):
    px = {}
    def put(x, y, c):
        if 0 <= x < cw and 0 <= y < ch: px[(x, y)] = c
    def rect(x0, y0, x1, y1, c):
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1): put(x, y, c)
    ox = cw // 2 - 18
    dy = st.get("dy", 0); bob = st.get("bob", 0); crouch = st.get("crouch", 0)
    legs = st.get("legs", [0, 0, 0, 0])
    leg_len = 3 - min(crouch, 2)
    by1 = ground - leg_len - 1 + dy + bob       # низ туловища
    by0 = by1 - 14 + crouch                      # верх головы
    hb = by0 + 9                                 # низ головы
    GP, GL = "#FF8FC8", "#FFC4E4"                # жабры — розовый акцент аксолотля
    # хвост: по умолчанию спрятан за телом, в анимациях выезжает (0–3)
    wag = st.get("wag", 0); tl = [0, 2, 4, 8][st.get("tail", 0)]
    if tl:
        rect(ox + 26, by1 - 3, ox + 25 + tl, by1 - 1, M); rect(ox + 26, by1 - 1, ox + 25 + tl, by1 - 1, D)
        rect(ox + 27, by1 - 4, ox + 24 + tl, by1 - 4, L)
        if tl >= 8:
            rect(ox + 32, by1 - 3 + wag, ox + 34, by1 - 2 + wag, M); put(ox + 35, by1 - 3 + wag, L)
    # лапки
    for i, lx in enumerate((10, 13, 21, 24)):
        if st.get("wave") and i == 3: continue
        rect(ox + lx, by1 + 1, ox + lx + 1, ground - legs[i] + (dy if dy < 0 else 0), D)
    # туловище (уже головы) и голова (широкий брусок)
    rect(ox + 10, hb + 1, ox + 25, by1, M); rect(ox + 10, by1, ox + 25, by1, D); rect(ox + 25, hb + 1, ox + 25, by1, D)
    rect(ox + 7, by0, ox + 28, hb, M)
    rect(ox + 8, by0, ox + 27, by0, L); rect(ox + 7, by0 + 1, ox + 7, hb - 1, L)
    rect(ox + 8, hb, ox + 28, hb, D); rect(ox + 28, by0 + 1, ox + 28, hb, D)
    put(ox + 10, by0 + 2, L); put(ox + 11, by0 + 3, L)
    # перистые жабры: по три ветки с каждой стороны головы, розовые
    fl = st.get("gill", 0)
    for k, gy in enumerate((by0 + 1, by0 + 4, by0 + 7)):
        up = 1 - k   # верхние загнуты вверх, нижние вниз
        for side in (-1, 1):
            base = ox + (6 if side < 0 else 29)
            tip = -2 * up + (fl if k != 1 else 0)
            pts = [(0, 0), (1, 0), (2, -up), (3, -up), (4, tip), (5, tip - up)]
            for i, (dx0, dy0) in enumerate(pts):
                put(base + side * dx0, gy + dy0, GL if i >= 4 else GP)
                if i <= 3: put(base + side * dx0, gy + dy0 + 1, "#E0609F")   # толщина ветки
            put(base + side * 3, gy - up - 1, GL)                              # пёрышко
    # «привет»: передняя лапка поднята сбоку
    if st.get("wave"):
        h = st["wave"]
        rect(ox + 25, hb + 1 - h, ox + 28, hb + 4, O); rect(ox + 26, hb + 2 - h, ox + 27, hb + 3, D); rect(ox + 26, hb + 2 - h, ox + 27, hb + 2 - h, L)
    # глаза
    eyes_y = by0 + 3
    if variant == "glasses":
        # Шлем в духе Vision Pro: цельное изогнутое чёрное стекло с
        # полуовальным низом, алюминиевый обод, серая мягкая маска по краю,
        # вязаный ремешок по бокам головы, колёсико сверху справа и
        # светящиеся глаза Минти на стекле.
        x0, x1, y0, y1 = ox + 8, ox + 27, eyes_y - 2, eyes_y + 4
        w = x1 - x0
        cells = []
        for x in range(x0, x1 + 1):
            t = (x - x0) / w
            bottom = y1 - int(round(3.2 * (1 - (1 - (2 * t - 1) ** 2) ** 0.5)))
            top = y0 + (1 if t < 0.03 or t > 0.97 else 0)
            for y in range(top, bottom + 1): cells.append((x, y))
        cs = set(cells)
        edge = {c for c in cells if any((c[0] + a2, c[1] + b2) not in cs for a2, b2 in ((1, 0), (-1, 0), (0, 1), (0, -1)))}
        # вязаный ремешок: рубчики уходят за голову
        for bx in (ox + 5, ox + 6, ox + 7, ox + 28, ox + 29, ox + 30):
            for y in range(eyes_y - 1, eyes_y + 3):
                put(bx, y, "#9A9DA5" if (bx + y) % 2 else "#7D8088")
        # мягкая маска — серая кайма, выглядывает из-под обода
        for (x, y) in edge:
            for a2, b2 in ((0, 1), (-1, 0), (1, 0)):
                q = (x + a2, y + b2)
                if q not in cs: put(*q, "#5E6068")
        # стекло: глубокий чёрный с отливом сверху
        for (x, y) in cells:
            k = (y - y0) / (y1 - y0)
            put(x, y, "#1C2033" if k < 0.25 else "#0E1120" if k < 0.7 else "#06070F")
        # глаза на стекле (EyeSight): мятное свечение, моргают вместе с Минти
        blink = st.get("blink")
        for ex in (x0 + 4, x1 - 6):
            if blink:
                rect(ex, eyes_y + 1, ex + 2, eyes_y + 1, "#7CF5E0")
            else:
                for gx in range(ex - 1, ex + 4):
                    for gy in range(eyes_y - 1, eyes_y + 3):
                        if (gx, gy) in cs: put(gx, gy, "#18343A")
                rect(ex, eyes_y, ex + 2, eyes_y + 1, "#7CF5E0"); put(ex, eyes_y, "#D8FFF7")
        # блик изогнутого стекла: дуга сверху + бегущая полоса
        for x in range(x0 + 3, x1 - 2): put(x, y0 + 1, "#3A4263")
        g = st.get("glint")
        if g is not None:
            bx = x0 + 3 + g * 6
            for d in range(0, 5):
                for q in ((bx + d, y1 - 1 - d), (bx + d + 1, y1 - 1 - d)):
                    if q in cs and q not in edge: put(*q, "#DDE6FF")
        # алюминиевый обод
        for (x, y) in edge: put(x, y, "#C3C8D2" if y > y0 else "#EEF1F6")
        # колёсико и кнопка сверху
        rect(x1 - 3, y0 - 1, x1 - 2, y0 - 1, "#DDE1E8"); put(x0 + 3, y0 - 1, "#C3C8D2")
    else:
        h = 0 if st.get("blink") else 2
        for ex in (10, 23):
            rect(ox + ex, eyes_y + (1 if h == 0 else 0), ox + ex + 2, eyes_y + (1 if h == 0 else h), EYE)
    # макушка: листик мяты или корона
    top = by0 - 1
    if variant == "crown":
        for x in range(ox + 12, ox + 24): put(x, top, Y[1])
        for x in range(ox + 12, ox + 24): put(x, top - 1, Y[2])
        for tx in (12, 17, 18, 23):
            put(ox + tx, top - 2, Y[2]); put(ox + tx, top - 3, Y[2] if tx in (17, 18) else Y[1])
        put(ox + 17, top - 4, Y[2]); put(ox + 18, top - 4, Y[2])
        for x in range(ox + 12, ox + 24): put(x, top, Y[0]) if x % 2 else None
    else:
        sway = st.get("leaf", 0)
        rect(ox + 17, top - 2, ox + 17, top, LEAF2)
        rect(ox + 18 + sway, top - 4, ox + 21 + sway, top - 3, LEAF); put(ox + 22 + sway, top - 4, LEAF)
        rect(ox + 18 + sway, top - 2, ox + 20 + sway, top - 2, LEAF2); put(ox + 19 + sway, top - 4, "#A8FFCB")
    # контур по силуэту — на чёрном фоне тело не растворяется
    cells = set(px)
    for (x, y) in list(cells):
        for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + a, y + b) not in cells: put(x + a, y + b, O)
    # тень на земле
    sw = 12 if dy > -4 else 8
    for x in range(cw // 2 - sw, cw // 2 + sw):
        if (x, ground + 1) not in px: put(x, ground + 1, "#12301F")
    return px

def save(frames, cw, ch, S, path):
    im = Image.new("RGBA", (cw * S * len(frames), ch * S), (0, 0, 0, 0))
    for i, px in enumerate(frames):
        for (x, y), c in px.items():
            im.paste(tuple(int(c[k:k+2], 16) for k in (1, 3, 5)) + (255,), (i * cw * S + x * S, y * S, i * cw * S + (x + 1) * S, (y + 1) * S))
    im.save(path, lossless=True, method=6)

# ---- баннеры: неподвижный кадр, ноги ровно на опоре фона ----
BW, BH = 40, 36                        # полупиксели = 20×18 пикселей фона
banner = {"trade": (106, 27, "glasses", {"wave": 5}), "fast": (80, 39, "plain", {"legs": [2, 0, 0, 2], "bob": -1, "wag": 1}), "shop": (73, 45, "crown", {})}
boxes = {}
for name, (cx, ground, variant, st) in banner.items():
    save([sprite(BW, BH, BH - 2, st, variant)], BW, BH, 6, f"mintie-{name}.webp")
    boxes[name] = dict(x0=cx - BW // 4, y0=ground - (BH - 2) // 2 - 1, w=BW // 2, h=BH // 2)
print(json.dumps(boxes))

# ---- экран: 56×56 полупикселей в клетке 112px — ровно 2px на полупиксель ----
PW = PH = 56; G = 50
ANIMS = {
    # хвост во всех анимациях выезжает из-за тела и прячется обратно
    "idle": [{}, {"bob": 1, "gill": 1, "tail": 1}, {"bob": 1, "gill": 1, "tail": 2}, {"tail": 1}, {"blink": True, "glint": 1}, {"blink": True, "glint": 2}],
    "jump": [{}, {"crouch": 2, "tail": 1}, {"dy": -5, "legs": [1, 1, 1, 1], "gill": -1, "tail": 2}, {"dy": -10, "legs": [2, 2, 2, 2], "gill": -1, "wag": 1, "tail": 3}, {"dy": -5, "gill": 1, "tail": 2}, {"crouch": 1, "gill": 1, "tail": 1}],
    "wave": [{"wave": 3, "tail": 1}, {"wave": 5, "gill": 1, "tail": 2}, {"wave": 7, "leaf": 1, "gill": 1, "tail": 3, "wag": -1}, {"wave": 5, "tail": 2}],
    "run": [{"legs": [2, 0, 0, 2], "bob": -1, "tail": 1}, {"legs": [0, 0, 0, 0], "tail": 2}, {"legs": [0, 2, 2, 0], "bob": -1, "tail": 3, "wag": 1}, {"legs": [0, 0, 0, 0], "leaf": 1, "tail": 2}],
}
for variant in ("glasses", "plain", "crown"):
    for a, frames in ANIMS.items():
        save([sprite(PW, PH, G, st, variant) for st in frames], PW, PH, 4, f"mintie/mintie-{variant}-{a}.webp")
