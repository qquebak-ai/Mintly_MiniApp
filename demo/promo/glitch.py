# Ищет кадры-«мигания»: кадр заметно отличается от обоих соседей, а соседи похожи
# между собой. Так выглядит недорисованный кадр, а не настоящее движение.
import sys
from PIL import Image, ImageChops
import numpy as np
N = int(sys.argv[1]) if len(sys.argv) > 1 else 1650
def load(f): return np.asarray(Image.open(f'frames/f{f:04d}.jpg').reduce(8).convert('L')).astype(np.int16)
prev, cur = load(0), load(1)
bad = []
for f in range(1, N - 1):
    nxt = load(f + 1)
    a = np.abs(cur - prev); c = np.abs(cur - nxt); n = np.abs(nxt - prev)
    # локально: блоки 16×16, где кадр выбивается из обоих соседей
    h, w = a.shape; k = 16
    blk = lambda x: x[:h // k * k, :w // k * k].reshape(h // k, k, w // k, k).mean(axis=(1, 3))
    A, C, Nn = blk(a), blk(c), blk(n)
    m = ((A > 6) & (C > 6) & (Nn < 0.35 * np.minimum(A, C))).sum()
    if m >= 1: bad.append(f); print(f, round(f / 30, 2), int(m), flush=True)
    prev, cur = cur, nxt
print("BAD", ",".join(map(str, bad)))
