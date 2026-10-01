# Логотипы мем-токенов для промо — пиксельные, в той же манере, что и Минти:
# в приложении логотипы рисуют сами люди, а 3D-монеты выглядели игрушечно.
from PIL import Image, ImageDraw
import math, os
OUT = os.path.join(os.path.dirname(__file__), "tok")
SPR = {
 "mcat": (["................",
           "..KK........KK..",
           ".KWWK......KWWK.",
           ".KWPWK....KWPWK.",
           ".KWPPWKKKKWPPWK.",
           ".KWWWWWWWWWWWWK.",
           "KWWWWWWWWWWWWWWK",
           "KWWYYBWWWWYYBWWK",
           "KWWYYBWWWWYYBWWK",
           "KWWWWWWPPWWWWWWK",
           "KWPPWWKWWKWWPPWK",
           ".KWWWWWKKWWWWWK.",
           "..KWWWWWWWWWWK..",
           "...KKKKKKKKKK..."],
          {"K": "#1B1035", "W": "#F7F1FF", "P": "#FF8FC8", "Y": "#FFD43B", "B": "#1B1035"}, ("#5B2BD6", "#2A0E7A")),
 "frog": (["................",
           "..KKKK....KKKK..",
           ".KWWWWK..KWWWWK.",
           ".KWBBWK..KWBBWK.",
           ".KWBBWKKKKWBBWK.",
           "KGKWWKGGGGKWWKGK",
           "KGGKKGGGGGGKKGGK",
           "KGGGGGGGGGGGGGGK",
           "KGDGGGGGGGGGGDGK",
           "KGGRRRRRRRRRRGGK",
           "KGGGRRRRRRRRGGGK",
           ".KGGGGGGGGGGGGK.",
           "..KKGGGGGGGGKK..",
           "....KKKKKKKK...."],
          {"K": "#0B2A17", "W": "#FFFFFF", "B": "#0B2A17", "G": "#3DDC6B", "D": "#22A94B", "R": "#E8455A"}, ("#14C8B4", "#06655E")),
 "pup":  (["................",
           ".KK..........KK.",
           ".KOK........KOK.",
           ".KOOK......KOOK.",
           ".KOOOKKKKKKOOOK.",
           "KOOOOOOOOOOOOOOK",
           "KOOOOOOOOOOOOOOK",
           "KOOCBOOOOOOBCOOK",
           "KOCCCCOOOOCCCCOK",
           "KOCCCCCKKCCCCCOK",
           "KCCCCCCKKCCCCCCK",
           ".KCCCCCPPCCCCCK.",
           "..KCCCCPPCCCCK..",
           "...KKKKKKKKKK..."],
          {"K": "#2B1406", "O": "#F59B2E", "C": "#FFF0D9", "B": "#2B1406", "P": "#FF6F8B"}, ("#2D8CFF", "#0B3FA8")),
 "boo":  (["................",
           ".....KKKKKK.....",
           "...KKWWWWWWKK...",
           "..KWWWWWWWWWWK..",
           ".KWWWWWWWWWWWWK.",
           ".KWWBBWWWWBBWWK.",
           ".KWWBBWWWWBBWWK.",
           ".KWPWWWWWWWWPWK.",
           ".KWWWWWKKWWWWWK.",
           ".KWWWWWWWWWWWWK.",
           ".KWWWWWWWWWWWWK.",
           ".KWWWWWWWWWWWWK.",
           ".KWKWWKWWKWWKWK.",
           ".KK.KK.KK.KK.KK."],
          {"K": "#2A1446", "W": "#FFFFFF", "B": "#2A1446", "P": "#FFB3D9"}, ("#B04BFF", "#4A0E8F")),
 "fire": (["........K.......",
           ".......KRK......",
           ".......KRRK.....",
           "......KRRRK..K..",
           ".....KRRORRK.KRK",
           "....KRRROORRKRRK",
           "....KRROOOORRRRK",
           "...KRROOYOOORRRK",
           "...KRROYYYOORRK.",
           "...KROOYWYYOORK.",
           "...KROYYWWYOORK.",
           "...KROYWWWYYORK.",
           "....KROYWWYYORK.",
           ".....KRROOORRK..",
           "......KKKKKKK..."],
          {"K": "#3A0A05", "R": "#F0322B", "O": "#FF8A1F", "Y": "#FFD43B", "W": "#FFF8D6"}, ("#FFE27A", "#F2A00C")),
}
def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
S = 640
for name, (rows, pal, (c0, c1)) in SPR.items():
    im = Image.new("RGBA", (S, S))
    px = im.load()
    a, b = hexc(c0), hexc(c1)
    for y in range(S):
        for x in range(S):
            # радиальный свет сверху-слева, как у кнопок приложения
            d = min(1, math.hypot(x - S * 0.3, y - S * 0.25) / (S * 0.95))
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * d) for i in range(3)) + (255,)
    rows = [r.ljust(16, ".")[:16] for r in rows]
    cell = 26
    w, h = 16 * cell, len(rows) * cell
    ox, oy = (S - w) // 2, (S - h) // 2 + 10
    d = ImageDraw.Draw(im)
    # мягкая тень под фигуркой — тот же силуэт, сдвинутый вниз
    sh = Image.new("RGBA", (S, S)); sd = ImageDraw.Draw(sh)
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch != ".": sd.rectangle([ox + i * cell, oy + j * cell + 18, ox + (i + 1) * cell - 1, oy + (j + 1) * cell + 17], fill=(0, 0, 0, 70))
    im = Image.alpha_composite(im, sh); d = ImageDraw.Draw(im)
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch != ".": d.rectangle([ox + i * cell, oy + j * cell, ox + (i + 1) * cell - 1, oy + (j + 1) * cell - 1], fill=hexc(pal[ch]))
    im.convert("RGB").save(os.path.join(OUT, name + ".png"))
print("ok")
