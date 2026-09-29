# Минти v2: широкий мятный брусок, «ушки» по бокам, четыре ножки,
# глаза — два чёрных квадрата, на макушке листик мяты. Крупный плоский
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
    ox = cw // 2 - 18          # тело 36 полупикселей шириной с ушками
    dy = st.get("dy", 0); bob = st.get("bob", 0); crouch = st.get("crouch", 0)
    legs = st.get("legs", [0, 0, 0, 0])      # подъём каждой ножки
    leg_len = 4 - crouch
    by1 = ground - leg_len - 1 + dy + bob    # низ тела
    by0 = by1 - 13 + crouch                  # верх тела
    # ножки
    for i, lx in enumerate((8, 12, 22, 26)):
        lift = legs[i]
        top = by1 + 1; bot = ground - lift + (dy if dy < 0 else 0)
        rect(ox + lx, top, ox + lx + 1, max(top, bot), D)
    # тело
    rect(ox + 6, by0, ox + 29, by1, M)
    rect(ox + 7, by0, ox + 28, by0, L); rect(ox + 6, by0 + 1, ox + 6, by1 - 1, L)
    rect(ox + 7, by1, ox + 29, by1, D); rect(ox + 29, by0 + 1, ox + 29, by1, D)
    for k in range(3): put(ox + 9 + k * 6, by0 + 2 + k, L)   # косые блики, как на горе
    # ушки: у «привета» правое поднимается
    ey0 = by0 + 4
    rect(ox + 2, ey0, ox + 5, ey0 + 3, M); rect(ox + 2, ey0 + 3, ox + 5, ey0 + 3, D); rect(ox + 2, ey0, ox + 5, ey0, L)
    ry = ey0 - st.get("wave", 0)
    rect(ox + 30, ry, ox + 33, ry + 3, M); rect(ox + 30, ry + 3, ox + 33, ry + 3, D); rect(ox + 30, ry, ox + 33, ry, L)
    if st.get("wave", 0) >= 3: rect(ox + 30, ry + 4, ox + 30, ey0 + 1, M)
    # глаза
    eyes_y = by0 + 4
    if variant == "glasses":
        rect(ox + 9, eyes_y - 1, ox + 26, eyes_y + 2, EYE)
        g = st.get("glint")
        gx = ox + 11 + (0 if g is None else g * 3)
        put(gx, eyes_y, WH if g is not None else "#3A3F4A"); put(gx + 1, eyes_y - 1 + 1, "#3A3F4A")
        put(ox + 20 + (0 if g is None else g * 3), eyes_y, WH if g is not None else "#3A3F4A")
    else:
        h = 0 if st.get("blink") else 2
        for ex in (11, 22):
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
banner = {"trade": (106, 27, "glasses", {"wave": 4}), "fast": (80, 39, "plain", {"legs": [2, 0, 0, 2], "bob": -1}), "shop": (73, 45, "crown", {})}
boxes = {}
for name, (cx, ground, variant, st) in banner.items():
    save([sprite(BW, BH, BH - 2, st, variant)], BW, BH, 6, f"mintie-{name}.webp")
    boxes[name] = dict(x0=cx - BW // 4, y0=ground - (BH - 2) // 2 - 1, w=BW // 2, h=BH // 2)
print(json.dumps(boxes))

# ---- экран: 56×56 полупикселей в клетке 112px — ровно 2px на полупиксель ----
PW = PH = 56; G = 50
ANIMS = {
    "idle": [{}, {"bob": 1}, {"bob": 1}, {}, {"blink": True, "glint": 1}, {"blink": True, "glint": 2}],
    "jump": [{}, {"crouch": 2}, {"dy": -5, "legs": [1, 1, 1, 1]}, {"dy": -10, "legs": [2, 2, 2, 2], "wave": 2}, {"dy": -5}, {"crouch": 1}],
    "wave": [{"wave": 3}, {"wave": 5}, {"wave": 7, "leaf": 1}, {"wave": 5}],
    "run": [{"legs": [2, 0, 0, 2], "bob": -1}, {"legs": [0, 0, 0, 0]}, {"legs": [0, 2, 2, 0], "bob": -1}, {"legs": [0, 0, 0, 0], "leaf": 1}],
}
for variant in ("glasses", "plain", "crown"):
    for a, frames in ANIMS.items():
        save([sprite(PW, PH, G, st, variant) for st in frames], PW, PH, 4, f"mintie/mintie-{variant}-{a}.webp")
