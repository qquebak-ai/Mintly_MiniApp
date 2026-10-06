# Бумага под гравюру: светлый холодно-тёплый тон, зерно, лёгкие пятна и виньетка.
# Делаем крупнее кадра (1.5×), потому что камера наезжает на рисунок до 2×.
import sys
import numpy as np
from PIL import Image, ImageFilter
rs = np.random.RandomState(4); W, H = 1620, 2880
def smooth(s):
    g = rs.rand(H // s + 2, W // s + 2).astype(np.float32)
    return np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255
blot = 0.6 * smooth(260) + 0.4 * smooth(70)
yy, xx = np.mgrid[0:H, 0:W]
d = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
vig = np.clip(d, 0, 1.3) ** 2.2
base = np.array([234, 231, 222], np.float32); edge = np.array([206, 200, 186], np.float32)
img = base * (1 - vig[..., None] * 0.55) + edge * (vig[..., None] * 0.55)
img *= (0.965 + 0.045 * blot)[..., None]
img += (rs.rand(H, W, 1).astype(np.float32) - 0.5) * 10
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.4)).save(sys.argv[1], quality=90)
print("paper", W, H)
