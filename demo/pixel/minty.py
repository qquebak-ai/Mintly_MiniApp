# Минти v4: аксолотль в квадратном пиксельном стиле — скруглённые бруски,
# брюшко и пятнышки, пальчики, жабры, прячущийся хвост; анимации 12 кадров/с.
# пиксель, 3 тона + контур. Единица рисунка — полпикселя фона баннера.
import json
from PIL import Image
# Окрасы: тело (свет, тон, тень, контур), брюшко (два тона), жабры (тон, кончик, тень)
SKINS = {
    "mint":      (("#8FF7CF", "#3FD9A0", "#1E9E73", "#0B4A37"), ("#A9F8DA", "#8FEBC6"), ("#FF8FC8", "#FFC4E4", "#E0609F")),
    "leucistic": (("#FFE3EE", "#FFC8DC", "#E79AB8", "#7A3552"), ("#FFF3F8", "#FFE0EC"), ("#FF4F7B", "#FF9DB5", "#C92E57")),
    "albino":    (("#FFFFFF", "#F1ECEA", "#CFC6C2", "#5E5552"), ("#FFFFFF", "#F7F2F0"), ("#FF3355", "#FF8A9C", "#C21F3C")),
    "gold":      (("#FFF1A8", "#FFD24A", "#D99A1A", "#6B4205"), ("#FFF6CC", "#FFE68A"), ("#FF8A5C", "#FFC0A3", "#D65A2E")),
    "wild":      (("#6E8A6A", "#4A6448", "#2F4430", "#121E13"), ("#8FA58A", "#7A9276"), ("#9C5FB5", "#C79AD8", "#6E3A85")),
    "violet":    (("#C9A2FF", "#9B5CF0", "#6A2FC0", "#2A0E57"), ("#DCC6FF", "#C8A9FF"), ("#FF6AD5", "#FFB3EC", "#C93AA6")),
    "ice":       (("#E4FBFF", "#A8E6F5", "#6AB5D1", "#1F4C63"), ("#F2FDFF", "#DDF6FC"), ("#5FD4FF", "#C8F1FF", "#2E97C4")),
    "fire":      (("#FFB27A", "#FF6A2B", "#C23A0E", "#4D1203"), ("#FFD2A8", "#FFBE88"), ("#FFD84A", "#FFF1A8", "#E09A00")),
    "neon":      (("#7DFFF2", "#1CE0D0", "#0A9C92", "#013B38"), ("#C4FFF9", "#9DF7EE"), ("#FF2BD6", "#FF93EC", "#B3009A")),
}
def use_skin(name):
    global L, M, D, O, B1, B2, GP0, GL0, GD0
    (L, M, D, O), (B1, B2), (GP0, GL0, GD0) = SKINS[name]
use_skin("mint")
EYE = "#06100C"; LEAF, LEAF2 = "#2EE87A", "#12A150"
Y = ["#A87400", "#E8B400", "#FFD84A"]; WH = "#FFFFFF"

# Поза по умолчанию — чуть вытянулся, «стоит»: жабры расправлены,
# кончик хвоста выглядывает. Анимации задают отклонения от неё.
ПОЗА = {"sq": -2, "tl": 2, "gill": -1}

def sprite(cw, ch, ground, st, variant):
    st = dict(st)
    st["sq"] = ПОЗА["sq"] + st.get("sq", 0)
    st["gill"] = max(-1, min(1, ПОЗА["gill"] + st.get("gill", 0)))
    st["tl"] = max(ПОЗА["tl"], st.get("tl", [0, 2, 4, 8][st.get("tail", 0)]))
    px = {}
    def put(x, y, c):
        if 0 <= x < cw and 0 <= y < ch: px[(x, y)] = c
    def rect(x0, y0, x1, y1, c):
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1): put(x, y, c)
    ox = cw // 2 - 18 + st.get("sx", 0)       # sx — покачивание вбок
    dy = st.get("dy", 0); bob = st.get("bob", 0); crouch = st.get("crouch", 0)
    legs = st.get("legs", [0, 0, 0, 0])
    leg_len = 0 if st.get("flat") else 3 - min(crouch, 2)   # flat — рухнул на пузо
    sit = st.get("sit")                                       # сидит на краю, лапки свисают
    by1 = ground - leg_len - 1 + dy + bob       # низ туловища
    if sit: by1 = ground + dy + bob
    sq = st.get("sq", 0)                         # >0 сплющен, <0 вытянут — резиновое тело
    # бока раздаются едва-едва: на пиксель и только при сильном сжатии
    rel = sq - ПОЗА["sq"]
    wx = 1 if rel >= 2 else (-1 if rel <= -2 else 0)                     # сплющился — стал шире
    by0 = by1 - 14 + crouch + sq                 # верх головы
    hb = by0 + 9 - (sq + 1) // 2                 # низ головы
    GP, GL = GP0, GL0                            # жабры — акцент окраса
    # хвост: по умолчанию спрятан за телом, в анимациях выезжает (0–3)
    wag = st.get("wag", 0); tl = st.get("tl", [0, 2, 4, 8][st.get("tail", 0)])
    if tl:
        rect(ox + 26, by1 - 3, ox + 25 + tl, by1 - 1, M); rect(ox + 26, by1 - 1, ox + 25 + tl, by1 - 1, D)
        rect(ox + 27, by1 - 4, ox + 24 + tl, by1 - 4, L)
        if tl >= 8:
            rect(ox + 32, by1 - 3 + wag, ox + 34, by1 - 2 + wag, M); put(ox + 35, by1 - 3 + wag, L)
    # лапки с пальчиками
    sp = st.get("splay")          # лапы врастопырку, у каждой свой угол
    for i, lx in enumerate((10, 13, 21, 24)):
        if st.get("wave") and i == 3: continue
        if sit:
            # сидит на краю панели: лапки свисают вниз, чуть болтаются
            sw = st.get("dangle", [0, 0, 0, 0])[i]
            top = by1 + 1; bot = by1 + 4 + sw
            rect(ox + lx, top, ox + lx + 1, bot, D)
            for tx in (-1, 1, 2): put(ox + lx + tx, bot, D)
            put(ox + lx - 1, bot, M); put(ox + lx + 2, bot, M)
            continue
        if st.get("flat"):
            # упал плашмя: лапы торчат в стороны из-под пуза
            side = -1 if i < 2 else 1
            y = by1 - (1 if i in (1, 2) else 0)
            x0 = ox + (9 if side < 0 else 26) + side * (0 if i in (1, 2) else 1)
            for k in range(4): put(x0 + side * k, y, D)
            put(x0 + side * 4, y, M); put(x0 + side * 4, y - 1, M)
            continue
        bot = ground - legs[i] + (dy if dy < 0 else 0)
        if sp:
            d = sp[i]
            n = bot - by1
            for r in range(n):
                x = ox + lx + (d * (r + 1)) // 2
                put(x, by1 + 1 + r, D); put(x + 1, by1 + 1 + r, D)
            xe = ox + lx + (d * n) // 2
            for tx in (-1, 1, 2): put(xe + tx, bot, D)
            put(xe - 1, bot, M); put(xe + 2, bot, M)
            continue
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
    rect(ox + 13, hb + 2, ox + 22, by1 - 1, B1)          # светлое брюшко
    rect(ox + 14, by1 - 1, ox + 21, by1 - 1, B2)
    rrect(ox + 7 - wx, by0, ox + 28 + wx, hb)
    put(ox + 10 - wx, by0 + 2, L); put(ox + 11 - wx, by0 + 3, L)
    # пятнышки на макушке и боках
    for q in ((20, 1), (21, 1), (21, 2), (14, 7), (15, 7)): put(ox + q[0], by0 + q[1], D)
    put(ox + 11 - wx, hb + 2, D); put(ox + 24 + wx, hb + 3, D)
    # жабры аксолотля: по три выступающих дуги с каждой стороны — сверху
    # стебель цвета тела (кожа), под ним бахрома самих жабр цвета окраса
    fl = st.get("gill", 0)
    for k, gy in enumerate((by0 + 1, by0 + 4, by0 + 7)):
        arc = [[0, -1, -2, -2, -3, -4], [0, 0, 0, -1, -1, -1], [0, 1, 1, 2, 3, 3]][k]
        for side in (-1, 1):
            base = ox + (6 - wx if side < 0 else 29 + wx)
            for i, d in enumerate(arc):
                x = base + side * i
                y = gy + d + (fl if i >= 3 and k != 1 else 0)
                put(x, y, L if i < 3 else M)                         # стебель — кожа
                if i >= 1:
                    put(x, y + 1, GP if i < 5 else GL)               # бахрома жабр под кожей
            put(base + side * 6, gy + arc[-1] + (fl if k != 1 else 0) + 1, GL)   # кончик
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
    # тревога: короткие красные палки веером вокруг мордочки, пульсируют
    al = st.get("alarm", 0)
    if al:
        import math
        hcx, hcy = ox + 17.5, by0 + 4
        for ang in (158, 128, 100, 80, 52, 22):
            a = math.radians(ang)
            r0 = 11 + al; ln = 3 + (al % 2)
            for k in range(ln):
                rr = r0 + k
                x = hcx + math.cos(a) * rr * 1.25; y = hcy - math.sin(a) * rr * 0.85
                c = "#FF3B47" if k < ln - 1 else "#FF8A8F"
                put(int(round(x)), int(round(y)), c)
                put(int(round(x)) + (1 if math.cos(a) > 0.3 else -1 if math.cos(a) < -0.3 else 0), int(round(y)), c)
    # сон: пиксельные «z» всплывают над головой справа
    zz = st.get("zzz")
    if zz is not None:
        for n, (zx, zy, big) in enumerate(((ox + 30, by0 - 3, 0), (ox + 33, by0 - 8, 1))):
            yy = zy - (zz + n * 2) % 4
            sz = 3 + big
            for x in range(sz): put(zx + x, yy, "#BFD8FF"); put(zx + x, yy + sz - 1, "#BFD8FF")
            for k in range(1, sz - 1): put(zx + sz - 1 - k, yy + k, "#BFD8FF")
    # звёздочки кружат над головой — оглушён
    sp_ = st.get("stars")
    if sp_ is not None:
        import math
        for k in range(3):
            a = math.radians(sp_ * 30 + k * 120)
            x = int(round(ox + 17.5 + math.cos(a) * 11)); y = int(round(by0 - 5 + math.sin(a) * 2.5))
            front = math.sin(a) > 0
            c, c2 = ("#FFE45C", "#FFF6B8") if front else ("#C9A21C", "#E8C94A")
            put(x, y, c2); put(x - 1, y, c); put(x + 1, y, c); put(x, y - 1, c); put(x, y + 1, c)
    if sit: return px
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
def jump(i):  # 36 кадров = 3 с: замах, полёт с потерей равновесия, шлёп на пузо, звёзды
    if i < 4:
        return [{}, {"sq": 1}, {"sq": 2}, {"sq": 2}][i]
    if i < 15:
        k = i - 4
        dys = [-3, -7, -10, -12, -13, -13, -12, -10, -7, -4, -1][k]
        # в воздухе его болтает, лапы разъезжаются кто куда
        splays = [[-1, 0, 0, 1], [-2, -1, 1, 2], [-3, 1, -1, 3], [-2, 2, 0, 3], [-3, 0, 2, 2], [-1, -2, 2, 3],
                  [-3, 1, -2, 1], [-2, 2, 1, 3], [-3, -1, 2, 2], [-2, 1, -1, 3], [-3, 0, 1, 3]][k]
        if k < 5:  # взлёт как положено: лапы ровные, тело прямое, всё под контролем
            return {"dy": dys, "sq": -1 if k < 3 else 0, "legs": [1, 1, 1, 1], "gill": -1, "tl": [2, 3, 4, 5, 6][k]}
        return {"dy": dys, "sq": 0, "splay": splays,
                "legs": [2, 1, 2, 1] if k % 2 else [1, 2, 1, 2], "gill": 1 if k % 2 else -1,
                "tl": [2, 4, 6, 8, 8, 8, 8, 6, 6, 4, 4][k], "wag": 1 if k % 2 else -1, "look": 1 if k % 3 == 0 else -1}
    if i < 18:  # не успел подставить лапы — шлёп
        return [{"flat": True, "sq": 3, "blink": True, "tl": 3}, {"flat": True, "sq": 2, "blink": True, "tl": 2},
                {"flat": True, "sq": 2, "blink": True, "tl": 2}][i - 15]
    if i < 32:  # лежит оглушённый, над головой кружат звёзды
        return {"flat": True, "sq": 2, "blink": True, "stars": i - 18, "tl": 2, "gill": 1}
    return [{"crouch": 1, "sq": 1}, {"sq": -1}, {}, {"blink": True}][i - 32]
def alarm(i):  # 24 кадра = 2 с: заметил, что кто-то зашёл, — встрепенулся и разволновался
    if i < 4: return {"look": 1 if i >= 2 else 0}
    if i < 7: return {"dy": [-2, -3, -2][i - 4], "sq": -1, "gill": -1, "alarm": [1, 2, 2][i - 4], "tl": 4}
    if i < 17:
        k = i - 7
        return {"gill": -1 if k % 2 else 1, "alarm": 1 + k % 2, "look": 1 if k % 4 < 2 else -1, "tl": 3, "wag": 1 if k % 2 else -1}
    if i < 21: return {"alarm": 1 if i % 2 else 0, "tl": 2, "gill": 0}
    return {"blink": i == 22}
def wake(i):  # 18 кадров: спит, сопит — и вскакивает, когда открыли экран
    if i < 10:
        return {"blink": True, "sq": 1 if i % 4 < 2 else 2, "gill": 1, "zzz": i, "tl": 0}
    return [{"dy": -1, "sq": -2, "gill": -1, "alarm": 1, "tl": 3}, {"dy": -4, "sq": -2, "gill": -1, "alarm": 2, "tl": 5},
            {"dy": -6, "sq": -1, "gill": -1, "alarm": 2, "tl": 6}, {"dy": -6, "gill": -1, "alarm": 1, "tl": 6},
            {"dy": -4, "gill": -1, "alarm": 2, "tl": 5}, {"dy": -1, "sq": 1, "alarm": 1, "tl": 4},
            {"sq": 2, "alarm": 2, "tl": 3}, {"sq": 1, "alarm": 1, "tl": 3}][i - 10]
def walk(i):  # 24 кадра = 2 с: неспешный шаг, лапы по диагонали, как у настоящего зверя
    lift = [0, 1, 2, 2, 1, 0]
    order = [0, 2, 1, 3]                         # левая, правая внутренняя, левая внутренняя, правая
    legs = [0, 0, 0, 0]
    ph, k = divmod(i, 6)
    legs[order[ph]] = lift[k]
    st = {"legs": legs, "bob": -1 if k in (2, 3) else 0, "tl": 3 + (1 if (i // 3) % 2 else 0)}
    st["gill"] = 1 if (i // 6) % 2 else 0
    st["leaf"] = 1 if (i // 4) % 2 else 0
    return st
ANIMS = {"idle": seq(36, idle), "jump": seq(36, jump), "alarm": seq(24, alarm), "wake": seq(18, wake), "walk": seq(24, walk)}
import os
for skin in SKINS:
    use_skin(skin)
    os.makedirs(f"out/{skin}", exist_ok=True)
    for name, (cx, ground, variant, st) in banner.items():
        save([sprite(BW, BH, BH - 2, st, variant)], BW, BH, 6, f"out/{skin}/banner-{name}.webp")
    save([sprite(PW, PH, G, {}, "plain")], PW, PH, 4, f"out/{skin}/preview.webp")
    for variant in ("glasses", "plain", "crown"):
        for a_, frames in ANIMS.items():
            save([sprite(PW, PH, G, st, variant) for st in frames], PW, PH, 4, f"out/{skin}/mintie-{variant}-{a_}.webp")
use_skin("mint")
# ---- иконка приложения: Минти в позе по умолчанию ----
ic = sprite(56, 56, 50, {}, "plain")
im = Image.new("RGBA", (576, 576), (0, 0, 0, 0))
for (x, y), c in ic.items():
    im.paste(tuple(int(c[k:k+2], 16) for k in (1, 3, 5)) + (255,), (8 + x * 10, 8 + (y - 4) * 10, 8 + (x + 1) * 10, 8 + (y - 3) * 10))
im.save("mintie-icon.png")
bg = Image.new("RGBA", (576, 576), (6, 5, 12, 255)); bg.alpha_composite(im); bg.convert("RGB").save("mintie-icon-bg.png")

# ---- панель навигации: сидит на краю, лапки свисают ----
NW, NH, NG = 44, 48, 37
def breath(i):
    sq = [0, 0, 1, 1, 1, 0, -1, -1, 0, 0, 0, 0][i]
    return {"sit": True, "sq": sq, "gill": 1 if sq > 0 else (-1 if sq < 0 else 0),
            "dangle": [[0, 0, 0, 0], [1, 0, 0, 1], [1, 0, 0, 1], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0]][i // 2]}
NAV = {
    "nav-wake": [dict(wake(i), sit=True) for i in range(18)],
    "nav-alarm": [dict(alarm(i), sit=True, dy=max(-2, alarm(i).get("dy", 0))) for i in range(24)],
    "nav-breath": [breath(i) for i in range(12)],
}
for skin in SKINS:
    use_skin(skin)
    for n, frames in NAV.items():
        save([sprite(NW, NH, NG, st, "plain") for st in frames], NW, NH, 4, f"out/{skin}/{n}.webp")
use_skin("mint")
