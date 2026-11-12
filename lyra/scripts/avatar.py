"""Builds Lyra's avatar assets from design/avatar-source.png (the artwork).

Run: python3 scripts/avatar.py
- web/src/assets/avatar-<accent>.webp: the round avatar used inside the app,
  one per accent color, with the headphone glow recolored (scripts/avatar_tint.py)
- android launcher icons (legacy, round, adaptive foreground) and splash screens
"""
from pathlib import Path
from PIL import Image, ImageDraw

from avatar_tint import GLOW, tint

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design" / "avatar-source.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
INK = (19, 20, 22, 255)

# the artwork's beige circle, inside its white ring
CENTER, RADIUS = 627, 512


def avatar(size: int) -> Image.Image:
    """The circle of artwork, cropped and masked round, at `size` pixels."""
    im = Image.open(SRC).convert("RGBA")
    box = (CENTER - RADIUS, CENTER - RADIUS, CENTER + RADIUS, CENTER + RADIUS)
    big = im.crop(box).resize((size * 4, size * 4), Image.LANCZOS)
    mask = Image.new("L", big.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big.size[0] - 1, big.size[1] - 1), fill=255)
    big.putalpha(mask)
    return big.resize((size, size), Image.LANCZOS)


def on(canvas_size, bg, inner: int):
    w, h = canvas_size
    c = Image.new("RGBA", (w, h), bg)
    a = avatar(inner)
    c.alpha_composite(a, ((w - inner) // 2, (h - inner) // 2))
    return c


def main():
    base = avatar(288)
    for accent in GLOW:
        tint(base, accent).save(ROOT / "web" / "src" / "assets" / f"avatar-{accent}.webp", quality=88, method=6)
    for d in sorted(RES.iterdir()):
        if not d.is_dir():
            continue
        for name in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png", "splash.png"):
            f = d / name
            if not f.exists():
                continue
            w, h = Image.open(f).size
            if name in ("ic_launcher.png", "ic_launcher_round.png"):
                img = on((w, h), (0, 0, 0, 0), w)
            elif name == "ic_launcher_foreground.png":
                # adaptive icons show the middle 72 of 108 units; fill that circle
                img = on((w, h), (0, 0, 0, 0), round(w * 72 / 108))
            else:
                img = on((w, h), INK, round(min(w, h) * 0.32))
            img.save(f, optimize=True)
            print(f"  {d.name}/{name} {w}x{h}")


if __name__ == "__main__":
    main()


def status_icon():
    """White constellation mark for the notification status bar (Android tints it)."""
    from PIL import ImageDraw as D
    stars = [(14, 7.5), (21, 19), (35, 21.5), (31, 39), (16.5, 35.5)]
    path = [0, 1, 2, 3, 4, 1]
    for dens, scale in (("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)):
        px = round(24 * scale)
        k = 4  # draw big, then shrink for smooth edges
        img = Image.new("RGBA", (px * k, px * k), (0, 0, 0, 0))
        d = D.Draw(img)
        f = px * k / 48
        pts = [((x) * f, (y + 1) * f) for x, y in stars]
        d.line([pts[i] for i in path], fill=(255, 255, 255, 255), width=round(2.6 * f), joint="curve")
        for i, (x, y) in enumerate(pts):
            r = (5.2 if i == 0 else 3.2) * f
            d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, 255))
        out = RES / f"drawable-{dens}"
        out.mkdir(exist_ok=True)
        img.resize((px, px), Image.LANCZOS).save(out / "ic_stat_lyra.png", optimize=True)
