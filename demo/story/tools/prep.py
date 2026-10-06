# Подготовка гравюр: перевод в чернила на прозрачной бумаге — тёмные линии
# остаются, фон музейного листа становится белым (при multiply на пергаменте
# исчезает). Монеты вырезаются кругом с альфой, металл сохраняет цвет.
import sys
from PIL import Image, ImageOps, ImageFilter, ImageDraw
import numpy as np
SRC, OUT = sys.argv[1], sys.argv[2]

def ink(name, crop=None, maxh=1600, gamma=1.0):
    im = Image.open(f"{SRC}/{name}.jpg").convert("L")
    if crop: im = im.crop(crop)
    a = np.asarray(im).astype(np.float32)
    # белая точка — светлая бумага (90-й перцентиль), чёрная — 1-й перцентиль
    lo, hi = np.percentile(a, 1), np.percentile(a, 90)
    a = np.clip((a - lo) / (hi - lo), 0, 1) ** gamma
    im = Image.fromarray((a * 255).astype(np.uint8))
    if im.height > maxh: im = im.resize((round(im.width * maxh / im.height), maxh), Image.LANCZOS)
    im.save(f"{OUT}/{name}.jpg", quality=90); print(name, im.size)

def coin(name, which, out):
    im = Image.open(f"{SRC}/{name}.jpg").convert("RGB")
    a = np.asarray(im).astype(np.int16)
    # фон — ровный серый: всё, что заметно отличается от него, считаем монетой
    bg = np.median(a[:20, :20].reshape(-1, 3), axis=0)
    m = (np.abs(a - bg).sum(2) > 40)
    W = a.shape[1]; half = m[:, :W // 2] if which == 0 else m[:, W // 2:]
    ys, xs = np.nonzero(half); off = 0 if which == 0 else W // 2
    x0, x1, y0, y1 = xs.min() + off, xs.max() + off, ys.min(), ys.max()
    cx, cy, r = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) / 2 + 4
    c = im.crop((int(cx - r), int(cy - r), int(cx + r), int(cy + r))).resize((900, 900), Image.LANCZOS)
    mask = Image.fromarray((m[int(cy - r):int(cy + r), int(cx - r):int(cx + r)] * 255).astype(np.uint8)).resize((900, 900), Image.LANCZOS)
    mask = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(1.5))
    c.putalpha(mask); c.save(f"{OUT}/{out}.png"); print(out, c.size)

ink("thales", gamma=1.05)
ink("market", gamma=1.1)
ink("goldweigher", gamma=0.9)
ink("astro1", maxh=1455, gamma=1.1)
ink("press_nova", gamma=1.0)
ink("press_robert", gamma=1.25)
coin("coin1", 0, "coin_dog"); coin("coin1", 1, "coin_punch")
coin("coin2", 0, "coin_head"); coin("coin2", 1, "coin_rev")

# ——— чернила с альфой: цвет постоянный (тёплая сепия), прозрачность = темнота ———
# так гравюра лежит прямо на пергаменте и при наплывах не даёт белых прямоугольников
INK = (34, 26, 18)
def alpha_ink(name, maxh):
    im = Image.open(f"{OUT}/{name}.jpg").convert("L")
    if im.height > maxh: im = im.resize((round(im.width * maxh / im.height), maxh), Image.LANCZOS)
    a = 1 - np.asarray(im).astype(np.float32) / 255
    a = np.clip((a - 0.04) / 0.96, 0, 1) ** 0.9
    rgba = np.zeros((im.height, im.width, 4), np.uint8); rgba[..., :3] = INK; rgba[..., 3] = (a * 255).astype(np.uint8)
    Image.fromarray(rgba).save(f"{OUT}/{name}.png", optimize=True); print("ink", name, im.size)
for n in ["thales", "market", "goldweigher", "astro1", "press_nova", "press_robert"]: alpha_ink(n, 1100)

# ——— пергамент: тёплый тон, крупные пятна, мелкое зерно, волокна, виньетка ———
rs = np.random.RandomState(7); W, H = 1920, 1080
def smooth(scale):
    g = rs.rand(H // scale + 2, W // scale + 2).astype(np.float32)
    return np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255
blot = 0.55 * smooth(240) + 0.3 * smooth(90) + 0.15 * smooth(30)
grain = rs.rand(H, W).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W]; d = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
vig = np.clip(d, 0, 1.25) ** 2.2
base = np.array([238, 230, 212], np.float32); edge = np.array([196, 180, 150], np.float32)
img = base[None, None] * (1 - vig[..., None] * 0.55) + edge[None, None] * (vig[..., None] * 0.55)
img *= (0.955 + 0.06 * blot)[..., None]; img += (grain[..., None] - 0.5) * 7
p = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)); dr = ImageDraw.Draw(p, "RGBA")
for _ in range(260):  # волокна бумаги
    x, y = rs.randint(0, W), rs.randint(0, H); L = rs.randint(20, 90); ang = rs.rand() * np.pi
    dr.line([(x, y), (x + L * np.cos(ang), y + L * np.sin(ang))], fill=(120, 100, 70, rs.randint(10, 26)), width=1)
p.filter(ImageFilter.GaussianBlur(0.4)).save(f"{OUT}/paper.jpg", quality=92); print("paper")
