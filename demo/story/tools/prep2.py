# Картинки для истории Эдисона. Гравюры — в «чернила» с альфой; фотографии —
# в штриховую гравюру (линии растра толще там, где темнее), чтобы фото и
# настоящие гравюры смотрелись одним стилем. Плюс газетная бумага 1870-х.
import sys
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
Image.MAX_IMAGE_PIXELS = None
SRC, OUT = sys.argv[1], sys.argv[2]
INK = (24, 27, 36)  # сине-чёрная типографская краска

def load(name, crop):
    im = Image.open(f"{SRC}/{name}.jpg").convert("L")
    return im.crop(crop) if crop else im

def levels(a, lo_p=1, hi_p=92, gamma=1.0):
    lo, hi = np.percentile(a, lo_p), np.percentile(a, hi_p)
    return np.clip((a - lo) / max(1, hi - lo), 0, 1) ** gamma

def save_alpha(alpha, name):
    h, w = alpha.shape
    rgba = np.zeros((h, w, 4), np.uint8); rgba[..., :3] = INK; rgba[..., 3] = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(rgba).save(f"{OUT}/{name}.png", optimize=True); print(name, (w, h))

def ink(name, crop=None, h=1100, gamma=1.0, hi_p=92):
    im = load(name, crop); im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    a = levels(np.asarray(im).astype(np.float32), hi_p=hi_p, gamma=gamma)
    save_alpha(np.clip((1 - a - 0.04) / 0.96, 0, 1) ** 0.9, name)

def engrave(name, crop=None, h=1100, period=5.2, gamma=1.0):
    # штриховой растр: горизонтальные линии с лёгкой волной; толщина линии = темнота
    im = load(name, crop); im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=2))
    a = levels(np.asarray(im).astype(np.float32), lo_p=0.5, hi_p=97, gamma=gamma)
    d = 1 - a
    yy, xx = np.mgrid[0:im.height, 0:im.width].astype(np.float32)
    phase = (yy + 1.6 * np.sin(xx / 41.0) + 3.0 * d) / period
    v = np.abs(np.sin(np.pi * phase))           # 0 в центре линии, 1 между линиями
    alpha = np.clip((d * 1.08 - v) / 0.22 + 0.5, 0, 1)
    alpha = np.maximum(alpha, np.clip((d - 0.82) * 4, 0, 1))  # глубокие тени заливаем
    # овальная виньетка, как у гравированных портретов в газетах: края растворяются в бумаге
    ex = (xx - im.width / 2) / (im.width * 0.5); ey = (yy - im.height * 0.47) / (im.height * 0.53)
    r = np.sqrt(ex ** 2 + ey ** 2); mask = np.clip((1.0 - r) / 0.16, 0, 1) ** 1.2
    save_alpha(alpha * 0.96 * mask, name)

engrave("edison78", crop=(40, 70, 990, 1500), gamma=1.05)
engrave("edphono", crop=(30, 20, 1130, 1520), gamma=1.0)
ink("goldroom", crop=(40, 10, 1520, 1050), h=1000, gamma=1.0)
ink("tickers", crop=(200, 8, 858, 1016), h=1100, gamma=1.15, hi_p=88)

# ——— газетная бумага: холодный светлый тон, мелкое зерно, сгибы, лёгкая желтизна по краям ———
rs = np.random.RandomState(21); W, H = 1920, 1080
def smooth(s):
    g = rs.rand(H // s + 2, W // s + 2).astype(np.float32)
    return np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255
blot = 0.6 * smooth(200) + 0.4 * smooth(60)
yy, xx = np.mgrid[0:H, 0:W]
d = np.sqrt(((xx - W / 2) / (W * 0.7)) ** 2 + ((yy - H / 2) / (H * 0.7)) ** 2)
vig = np.clip(d, 0, 1.3) ** 2.4
base = np.array([236, 234, 226], np.float32); edge = np.array([214, 206, 186], np.float32)
img = base * (1 - vig[..., None] * 0.6) + edge * (vig[..., None] * 0.6)
img *= (0.965 + 0.045 * blot)[..., None]
img += (rs.rand(H, W, 1).astype(np.float32) - 0.5) * 9
# сгибы газеты: светлая и тёмная полоска рядом
for x0, k in ((W * 0.5, 1.0), (W * 0.25, 0.5), (W * 0.75, 0.5)):
    dx = xx - x0
    img += (np.exp(-(dx / 3.0) ** 2) * 10 - np.exp(-((dx - 5) / 6.0) ** 2) * 7)[..., None] * k
p = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.35))
p.save(f"{OUT}/newsprint.jpg", quality=92); print("newsprint")
