# Cove's avatar, launcher icons, splash screens and desktop icon, all from one square picture
# (design/cove-avatar-source.png). Run: python3 scripts/cove-icons.py
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
src = Image.open(root / "design/cove-avatar-source.png").convert("RGB")
res = root / "android/app/src/main/res"
CREAM = (250, 246, 240)

def round_img(size, ring=0, ring_color=(255, 255, 255)):
    im = src.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    if ring:
        big = Image.new("RGBA", (size + 2 * ring, size + 2 * ring), (0, 0, 0, 0))
        m = Image.new("L", ((size + 2 * ring) * 4,) * 2, 0)
        ImageDraw.Draw(m).ellipse((0, 0, (size + 2 * ring) * 4 - 1, (size + 2 * ring) * 4 - 1), fill=255)
        big.paste(Image.new("RGBA", big.size, ring_color + (255,)), (0, 0), m.resize(big.size, Image.LANCZOS))
        big.alpha_composite(out, (ring, ring))
        out = big
    return out

def rounded_square(size, radius_frac=0.23):
    im = src.resize((size, size), Image.LANCZOS).convert("RGBA")
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius_frac), fill=255)
    im.putalpha(m.resize((size, size), Image.LANCZOS))
    return im

# the app's own avatar (web)
round_img(512).save(root / "web/src/assets/avatar-cove.webp", quality=92)

# launcher icons: legacy square + round, and the adaptive foreground (108dp canvas, art fills it)
for name, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    d = res / f"mipmap-{name}"
    rounded_square(px).save(d / "ic_launcher.webp", quality=95)
    round_img(px).save(d / "ic_launcher_round.webp", quality=95)
    fg = int(px * 108 / 48)
    src.resize((fg, fg), Image.LANCZOS).save(d / "ic_launcher_foreground.webp", quality=95)

# splash screens: cream, the round avatar in the middle
for f in res.glob("drawable*/splash.webp"):
    w, h = Image.open(f).size
    canvas = Image.new("RGB", (w, h), CREAM)
    a = round_img(int(min(w, h) * 0.32), ring=max(4, int(min(w, h) * 0.012)))
    canvas.paste(a, ((w - a.width) // 2, (h - a.height) // 2), a)
    canvas.save(f, quality=90)

# desktop window/taskbar icon
rounded_square(512).save(root / "desktop/icon.png")
rounded_square(256).save(root / "desktop/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
# the browser extension's icon
round_img(128).save(root / "web/public/browser-extension/icon.png")
print("icons done")
