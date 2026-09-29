# Минти v4: аксолотль в квадратном пиксельном стиле — скруглённые бруски,
# брюшко и пятнышки, пальчики, жабры, прячущийся хвост; анимации 12 кадров/с.
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
    sq = st.get("sq", 0)                         # >0 сплющен, <0 вытянут — резиновое тело
    wx = max(-1, min(2, sq))                     # сплющился — стал шире
    by0 = by1 - 14 + crouch + sq                 # верх головы
    hb = by0 + 9 - (sq + 1) // 2                 # низ головы
    GP, GL = "#FF8FC8", "#FFC4E4"                # жабры — розовый акцент аксолотля
    # хвост: по умолчанию спрятан за телом, в анимациях выезжает (0–3)
    wag = st.get("wag", 0); tl = st.get("tl", [0, 2, 4, 8][st.get("tail", 0)])
    if tl:
        rect(ox + 26, by1 - 3, ox + 25 + tl, by1 - 1, M); rect(ox + 26, by1 - 1, ox + 25 + tl, by1 - 1, D)
        rect(ox + 27, by1 - 4, ox + 24 + tl, by1 - 4, L)
        if tl >= 8:
            rect(ox + 32, by1 - 3 + wag, ox + 34, by1 - 2 + wag, M); put(ox + 35, by1 - 3 + wag, L)
    # лапки с пальчиками
    for i, lx in enumerate((10, 13, 21, 24)):
        if st.get("wave") and i == 3: continue
        bot = ground - legs[i] + (dy if dy < 0 else 0)
        rect(ox + lx, by1 + 1, ox + lx + 1, bot, D)
        for tx in (-1, 1, 2): put(ox + lx + tx, bot, D)
        put(ox + lx - 1, bot, M); put(ox + lx + 2, bot, M)
    def rrect(x0, y0, x1, y1):
        # брусок со срезанными углами: свет сверху-слева, тень снизу-справа
        rect(x0, y0, x1, y1, M)
        rect(x0 + 1, y0, x1 - 1, y0, L); rect(x0, y0 + 1, x0, y1 - 1, L)
        rect(x0 + 1, y1, x1 - 1, y1, D); rect(x1, y0 + 1, x1, y1 - 1, D)
        for q in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)): px.pop(q, None)
    # туловище (уже головы) и голова (широкий брусок), углы скруглены
    rrect(ox + 10 - wx, hb, ox + 25 + wx, by1)
    rect(ox + 13, hb + 2, ox + 22, by1 - 1, "#A9F8DA")          # светлое брюшко
    rect(ox + 14, by1 - 1, ox + 21, by1 - 1, "#8FEBC6")
    rrect(ox + 7 - wx, by0, ox + 28 + wx, hb)
    put(ox + 10 - wx, by0 + 2, L); put(ox + 11 - wx, by0 + 3, L)
    # пятнышки на макушке и боках
    for q in ((20, 1), (21, 1), (21, 2), (14, 7), (15, 7)): put(ox + q[0], by0 + q[1], D)
    put(ox + 11 - wx, hb + 2, D); put(ox + 24 + wx, hb + 3, D)
    # перистые жабры: по три ветки с каждой стороны головы, розовые
    fl = st.get("gill", 0)
    for k, gy in enumerate((by0 + 1, by0 + 4, by0 + 7)):
        up = 1 - k   # верхние загнуты вверх, нижние вниз
        for side in (-1, 1):
            base = ox + (6 - wx if side < 0 else 29 + wx)
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
        # форма по фото Vision Pro: вытянутая капсула со скруглёнными
        # торцами и выемкой под нос снизу посередине
        x0, x1, y0, y1 = ox + 7, ox + 28, eyes_y - 3, eyes_y + 4
        mid = (x0 + x1) / 2
        cells = []
        for x in range(x0, x1 + 1):
            e = min(x - x0, x1 - x)                        # расстояние до торца
            rnd = [3, 1, 1, 0][e] if e < 4 else 0            # скругление торцов
            top = y0 + ([2, 1, 0, 0][e] if e < 4 else 0)
            bottom = y1 - rnd
            d = abs(x + 0.5 - mid - 0.5)
            if d < 3.5: bottom -= [3, 3, 2, 1][int(d)]      # выемка под нос
            for y in range(top, bottom + 1): cells.append((x, y))
        cs = set(cells)
        edge = {c for c in cells if any((c[0] + a2, c[1] + b2) not in cs for a2, b2 in ((1, 0), (-1, 0), (0, 1), (0, -1)))}
        # вязаный ремешок: рубчики уходят за голову
        for bx in (ox + 5, ox + 6, ox + 29, ox + 30):
            for y in range(eyes_y - 1, eyes_y + 3):
                put(bx, y, "#9A9DA5" if (bx + y) % 2 else "#7D8088")
        # мягкая маска — серая кайма, выглядывает из-под обода
        for (x, y) in edge:
            for a2, b2 in ((0, 1), (-1, 0), (1, 0)):
                q = (x + a2, y + b2)
                if q not in cs: put(*q, "#5E6068")
        # стекло: глубокий чёрный, чуть светлее к краям
        for (x, y) in cells:
            e = min(x - x0, x1 - x)
            put(x, y, "#161926" if e < 3 else "#0A0B12")
        # широкий блик по верху стекла, как на фото
        for x in range(x0 + 4, x1 - 3):
            put(x, y0 + 1, "#4E5670" if abs(x - mid) > 5 else "#6C7592")
        # камеры снизу по бокам от выемки
        for cx2 in (x0 + 4, x0 + 6, x1 - 6, x1 - 4):
            if (cx2, y1 - 1) in cs: put(cx2, y1 - 1, "#2C3244")
            if (cx2, y1 - 2) in cs: put(cx2, y1 - 2, "#1A1E2B")
        # глаза на стекле (EyeSight): мятное свечение, моргают вместе с Минти
        blink = st.get("blink")
        for ex in (x0 + 4 + st.get("look", 0), x1 - 6 + st.get("look", 0)):
            if blink:
                rect(ex, eyes_y + 1, ex + 2, eyes_y + 1, "#7CF5E0")
            else:
                for gx in range(ex - 1, ex + 4):
                    for gy in range(eyes_y - 1, eyes_y + 3):
                        if (gx, gy) in cs: put(gx, gy, "#18343A")
                rect(ex, eyes_y, ex + 2, eyes_y + 1, "#7CF5E0"); put(ex, eyes_y, "#D8FFF7")
        g = st.get("glint")
        if g is not None:
            bx = x0 + 3 + g * 6
            for d in range(0, 5):
                for q in ((bx + d, y1 - 1 - d), (bx + d + 1, y1 - 1 - d)):
                    if q in cs and q not in edge: put(*q, "#DDE6FF")
        # прозрачный алюминиево-стеклянный обод: светлый сверху, серый снизу
        for (x, y) in edge: put(x, y, "#D5DAE4" if y <= y0 + 1 else "#8C94A6")
        # кнопка сверху слева, как на фото
        rect(x0 + 1, y0 - 1, x0 + 2, y0, "#B9BFCC")
    else:
        h = 0 if st.get("blink") else 2
        for ex in (10, 23):
            lk = st.get("look", 0)
            rect(ox + ex + lk, eyes_y + (1 if h == 0 else 0), ox + ex + 2 + lk, eyes_y + (1 if h == 0 else h), EYE)
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
def seq(n, fn): return [fn(i) for i in range(n)]
def ping(i, a, b, lo, hi):  # плавно lo→hi→lo на отрезке кадров [a, b)
    if i < a or i >= b: return lo
    k = (i - a) / max(1, b - a - 1); return round(lo + (hi - lo) * (1 - abs(2 * k - 1)))

def idle(i):  # 36 кадров = 3 с: вдох-выдох, взгляд в стороны, моргание, хвост выглядывает
    st = {"sq": 1 if 4 <= i < 10 else (-1 if 10 <= i < 12 else 0), "gill": 1 if 4 <= i < 12 else 0}
    if 14 <= i < 19: st["look"] = 1
    elif 20 <= i < 25: st["look"] = -1
    if i in (27, 28): st["blink"] = True; st["glint"] = 1 if i == 27 else 2
    st["tl"] = [0, 0, 1, 2, 3, 4, 4, 3, 2, 1, 0][i - 26] if 26 <= i < 37 and i - 26 < 11 else 0
    if 30 <= i < 34: st["wag"] = 1 if i % 2 else 0
    return st
def jump(i):  # 18 кадров: замах, толчок, полёт, зависание, падение, шлёп, отскок
    dys = [0, 0, 0, 0, -3, -7, -10, -12, -13, -13, -12, -9, -5, 0, 0, 0, 0, 0]
    sqs = [0, 1, 2, 2, -2, -1, -1, 0, 0, 0, 0, -1, -1, 2, 1, -1, 0, 0]
    st = {"dy": dys[i], "sq": sqs[i]}
    if 4 <= i < 13: st["legs"] = [2, 2, 2, 2]; st["gill"] = -1 if i < 9 else 1
    st["tl"] = [0, 0, 0, 1, 2, 4, 6, 8, 8, 8, 8, 6, 4, 2, 1, 0, 0, 0][i]
    if 7 <= i < 11: st["wag"] = 1 if i % 2 else -1
    if 8 <= i < 11: st["blink"] = True  # зажмурился от удовольствия
    return st
def wave(i):  # 16 кадров: лапка поднимается, машет, опускается
    hs = [1, 3, 5, 7, 6, 7, 5, 7, 6, 7, 5, 7, 5, 3, 1, 0]
    st = {"wave": hs[i] or None, "gill": 1 if i % 4 < 2 else 0, "look": 1 if 3 <= i < 13 else 0, "sq": 1 if i in (0, 15) else 0}
    st["tl"] = [0, 1, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 2, 1, 0][i]
    if 4 <= i < 12: st["wag"] = 1 if i % 2 else 0; st["leaf"] = 1 if i % 4 < 2 else 0
    return {k: v for k, v in st.items() if v is not None}
def run(i):  # 12 кадров: две полные смены шага, хвост виляет, жабры по ветру
    ph = i % 6
    legs = [[2, 0, 0, 2], [1, 0, 0, 1], [0, 0, 0, 0], [0, 2, 2, 0], [0, 1, 1, 0], [0, 0, 0, 0]][ph]
    return {"legs": legs, "bob": -1 if ph in (0, 3) else 0, "sq": -1 if ph in (0, 3) else (1 if ph in (2, 5) else 0),
            "tl": 6 + (1 if ph < 3 else 0), "wag": 1 if ph < 3 else -1, "gill": -1, "look": 1, "leaf": 1 if ph < 3 else 0}
ANIMS = {"idle": seq(36, idle), "jump": seq(18, jump), "wave": seq(16, wave), "run": seq(12, run)}
for variant in ("glasses", "plain", "crown"):
    for a, frames in ANIMS.items():
        save([sprite(PW, PH, G, st, variant) for st in frames], PW, PH, 4, f"mintie/mintie-{variant}-{a}.webp")
