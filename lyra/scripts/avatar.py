"""Builds Lyra's avatar assets from design/avatar-source.png (the artwork).

Run: python3 scripts/avatar.py
- web/src/assets/avatar.webp: the round avatar used inside the app
- android launcher icons (legacy, round, adaptive foreground) and splash screens
"""
from pathlib import Path
from PIL import Image, ImageDraw

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
    avatar(288).save(ROOT / "web" / "src" / "assets" / "avatar.webp", quality=88, method=6)
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
