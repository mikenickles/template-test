# Draws the launcher icons and splash screens (no image files are checked in; run by build-apk.sh).
import sys, os
from PIL import Image, ImageDraw, ImageFont
RES = os.path.join(os.path.dirname(__file__), 'android/app/src/main/res')
GREEN, DARK, BG, WOOD = (47, 168, 74), (24, 92, 40), (214, 222, 232), (94, 69, 53)

def soldier(d, cx, cy, s, col=GREEN, dark=DARK):
    # a plastic army man, rifle at the ready, standing on his base; s = height in px
    u = s / 100.0
    P = lambda x, y: (cx + x * u, cy + y * u)
    d.ellipse([*P(-30, 40), *P(30, 52)], fill=dark)                      # base
    d.polygon([P(-12, 42), P(-4, 42), P(-2, 10), P(-14, 10)], fill=col)  # back leg
    d.polygon([P(4, 42), P(13, 42), P(10, 10), P(-1, 10)], fill=col)     # front leg
    d.polygon([P(-16, 12), P(14, 12), P(12, -22), P(-14, -22)], fill=col)  # torso
    d.ellipse([*P(-9, -40), *P(9, -22)], fill=col)                       # head
    d.chord([*P(-14, -50), *P(14, -26)], 180, 360, fill=dark)            # helmet
    d.rectangle([*P(-16, -39), *P(16, -36)], fill=dark)                  # brim
    d.line([P(-6, -12), P(38, -18)], fill=dark, width=max(2, int(6 * u)))  # rifle
    d.polygon([P(-10, -16), P(18, -8), P(20, -2), P(-12, -6)], fill=col)   # arms
    d.ellipse([*P(16, -10), *P(24, -2)], fill=col)                       # hand

def icon(size, round_=False, fg_only=False):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if not fg_only:
        if round_: d.ellipse([0, 0, size - 1, size - 1], fill=WOOD)
        else: d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 5, fill=WOOD)
    soldier(d, size * 0.47, size * 0.47, size * (0.42 if fg_only else 0.62))
    return im

dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for k, m in dens.items():
    dd = os.path.join(RES, 'mipmap-' + k)
    icon(int(48 * m)).save(os.path.join(dd, 'ic_launcher.png'))
    icon(int(48 * m), round_=True).save(os.path.join(dd, 'ic_launcher_round.png'))
    icon(int(108 * m), fg_only=True).save(os.path.join(dd, 'ic_launcher_foreground.png'))

def splash(w, h):
    im = Image.new('RGB', (w, h), BG); d = ImageDraw.Draw(im)
    s = min(w, h) * 0.45
    soldier(d, w / 2, h / 2 - s * 0.12, s)
    try: f = ImageFont.truetype('DejaVuSans-Bold.ttf', int(s * 0.16))
    except OSError: f = ImageFont.load_default()
    t = 'BEDROOM BATTALION'; tw = d.textlength(t, font=f)
    d.text(((w - tw) / 2, h / 2 + s * 0.5), t, fill=DARK, font=f)
    return im

for p in os.listdir(RES):
    fp = os.path.join(RES, p, 'splash.png')
    if os.path.exists(fp):
        w, h = Image.open(fp).size
        splash(w, h).save(fp)
