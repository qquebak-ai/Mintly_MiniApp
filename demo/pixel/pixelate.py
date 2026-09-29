# Объёмная заготовка → пиксель-арт в палитре первого баннера.
import sys
from PIL import Image
RAMP = ["#12001F", "#1F0237", "#2E0556", "#45097F", "#5E10B0", "#7A1CD8", "#9636F0", "#B45CFF", "#D29AFF", "#F1E4FF"]
RAMP = [tuple(int(h[i:i+2], 16) for i in (1, 3, 5)) for h in RAMP]
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
src, out, gw, gh = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
SC = 12
im = Image.open(src).convert("RGBA")
small = im.resize((gw, gh), Image.BOX)
a = small.split()[3]
res = Image.new("RGBA", (gw, gh), (0, 0, 0, 0))
P = small.load(); R = res.load()
solid = lambda x, y: 0 <= x < gw and 0 <= y < gh and P[x, y][3] > 110
for y in range(gh):
    for x in range(gw):
        r, g, b, al = P[x, y]
        if al <= 110: continue
        L = (r + g + b) / 3 / 255 / (al / 255)
        # Ровные ступени без сетки-дизеринга: мультяшная светотень, как у горы.
        v = 1.5 + L * 6.6
        if L > 0.45 and ((x + y * 0.6) % 9) < 1: v += 1  # косые блики по граням
        # край силуэта: слева/сверху — светлая кайма, справа/снизу — тень
        if not solid(x - 1, y) or not solid(x, y - 1): v += 1.0
        if not solid(x + 1, y) or not solid(x, y + 1): v -= 1.4
        R[x, y] = RAMP[max(1, min(9, int(v)))] + (255,)
# искры в пустых местах, кроме левого верхнего угла (там заголовок)
for sx, sy, big in [tuple(map(int, s.split(":"))) for s in sys.argv[5:]]:
    pts = [(0, 0, 9), (1, 0, 7), (-1, 0, 7), (0, 1, 7), (0, -1, 7)] + ([(2, 0, 5), (-2, 0, 5), (0, 2, 5), (0, -2, 5)] if big else [])
    for dx, dy, c in pts:
        if 0 <= sx + dx < gw and 0 <= sy + dy < gh and R[sx + dx, sy + dy][3] == 0: R[sx + dx, sy + dy] = RAMP[c] + (255,)
res.resize((gw * SC, gh * SC), Image.NEAREST).save(out, quality=92, method=6)
