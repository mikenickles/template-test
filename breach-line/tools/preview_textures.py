#!/usr/bin/env python3
"""
Build a contact sheet of the Breach Line procedural textures and FX sprites.

    python3 tools/preview_textures.py                    # contact sheet
    python3 tools/preview_textures.py --detail rust      # full-res seam crop + lit render
    python3 tools/preview_textures.py --lit              # lit 2x2 renders of every material
    python3 tools/preview_textures.py --fx               # FX sprites enlarged

For every material the sheet shows the albedo tiled 2x2 (the tile seams run through the
middle of the block, so any seam is visible), the normal map (also 2x2) and the roughness map.
The FX sprites are drawn over a checkerboard. Output goes to the session scratchpad.
"""

import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX_DIR = os.path.join(ROOT, "assets", "textures")
FX_DIR = os.path.join(ROOT, "assets", "fx")
OUT_DIR = "/tmp/claude-0/-home-user-template-test/309cde2f-69bc-5863-9ba2-cdacdbaa7bda/scratchpad"
SHEET = os.path.join(OUT_DIR, "texture_sheet.png")

MATERIALS = [
    ("concrete_floor", 4.0), ("concrete_wall", 4.0), ("brick_red", 3.0), ("brick_dark", 3.0),
    ("asphalt", 5.0), ("metal_corrugated", 2.0), ("metal_tread", 1.5), ("metal_painted", 2.0),
    ("rust", 2.0), ("wood_crate", 1.2), ("plaster_wall", 3.0), ("tiles_floor", 2.0),
    ("gravel", 3.0), ("hazard_stripes", 1.0), ("dirt_ground", 4.0), ("roof_tar", 4.0),
]
FX = ["muzzle_flash_front.png", "muzzle_flash_side.png", "bullet_hole.png",
      "bullet_hole_metal.png", "smoke_puff.png", "spark.png", "blood_splat.png", "scorch.png"]

BG = (24, 24, 26)
FG = (225, 225, 225)


def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/TTF/DejaVuSans.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def load(name, kind):
    ext = "png" if kind == "normal" else "jpg"
    return Image.open(os.path.join(TEX_DIR, name, f"{name}_{kind}.{ext}"))


def tile2(img, cell):
    im = img.resize((cell, cell), Image.LANCZOS)
    out = Image.new(im.mode, (cell * 2, cell * 2))
    for y in range(2):
        for x in range(2):
            out.paste(im, (x * cell, y * cell))
    return out


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def lit(alb, nrm, rough, light=(-0.55, 0.55, 0.63)):
    """Cheap preview shading: Lambert + Blinn-Phong, grazing light from the upper left.
    Normal map decoded in OpenGL convention (+G = up in the image)."""
    a = srgb_to_lin(np.asarray(alb, np.float32) / 255.0)
    n = np.asarray(nrm, np.float32) / 255.0 * 2 - 1
    r = np.asarray(rough.resize(alb.size, Image.BILINEAR), np.float32) / 255.0
    L = np.array(light, np.float32)
    L /= np.linalg.norm(L)
    H = L + np.array([0, 0, 1], np.float32)
    H /= np.linalg.norm(H)
    ndl = np.clip((n * L).sum(-1), 0, 1)
    ndh = np.clip((n * H).sum(-1), 0, 1)
    shin = 2.0 / np.maximum(r ** 4, 1e-3) - 2.0
    spec = (1 - r) ** 2 * ndh ** np.minimum(shin, 2000) * 0.6
    col = a * (0.12 + 1.15 * ndl[..., None]) + (spec * ndl)[..., None] * 0.5
    return Image.fromarray((lin_to_srgb(col) * 255).astype(np.uint8))


def checker(w, h, s=8):
    yy, xx = np.mgrid[0:h, 0:w]
    c = ((xx // s + yy // s) % 2).astype(np.uint8)
    arr = np.where(c[..., None] == 1, np.array([150, 150, 155]), np.array([95, 95, 100]))
    return Image.fromarray(arr.astype(np.uint8)).convert("RGBA")


def contact_sheet():
    cell = 256
    cols = 4
    label_h = 30
    side = cell                                   # side column: normal 2x2, rough + lit
    block_w = cell * 2 + side + 16
    block_h = cell * 2 + label_h + 8
    rows = math.ceil(len(MATERIALS) / cols)
    fx_h = 300
    W = cols * block_w + 20
    H = rows * block_h + fx_h + 30
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    f = font(17)
    small = font(12)
    for i, (name, tile) in enumerate(MATERIALS):
        bx = 10 + (i % cols) * block_w
        by = 10 + (i // cols) * block_h
        d.text((bx, by + 4), f"{name}  ({tile:g} m tile, shown 2x2 = {2 * tile:g} m)",
               fill=FG, font=f)
        alb = load(name, "albedo").convert("RGB")
        sheet.paste(tile2(alb, cell), (bx, by + label_h))
        nrm = load(name, "normal").convert("RGB")
        sx = bx + 2 * cell + 4
        sheet.paste(tile2(nrm, side // 2), (sx, by + label_h))
        rgh = load(name, "rough").convert("L")
        sheet.paste(rgh.convert("RGB").resize((side // 2 - 2, side // 2 - 2), Image.LANCZOS),
                    (sx, by + label_h + side + 4))
        lt = lit(alb, nrm, rgh)
        sheet.paste(lt.resize((side // 2 - 2, side // 2 - 2), Image.LANCZOS),
                    (sx + side // 2 + 2, by + label_h + side + 4))
        ty = by + label_h + side + side // 2 + 6
        d.text((sx, ty), "normal 2x2 (above)", fill=(160, 160, 160), font=small)
        d.text((sx, ty + 14), "roughness | lit preview", fill=(160, 160, 160), font=small)
    fy = 10 + rows * block_h + 6
    d.text((10, fy), "FX sprites (over checkerboard; 64 px spark shown 3x)", fill=FG, font=f)
    x = 10
    for fx in FX:
        im = Image.open(os.path.join(FX_DIR, fx)).convert("RGBA")
        sc = 3 if im.width == 64 else 1
        im = im.resize((im.width * sc, im.height * sc), Image.LANCZOS)
        bg = checker(im.width, im.height)
        bg.alpha_composite(im)
        sheet.paste(bg.convert("RGB"), (x, fy + 28))
        d.text((x, fy + 28 + im.height + 2), fx.replace(".png", ""), fill=(180, 180, 180),
               font=small)
        x += im.width + 14
    os.makedirs(OUT_DIR, exist_ok=True)
    sheet.save(SHEET)
    print("wrote", SHEET, sheet.size)


def detail(name, crop=720):
    alb = load(name, "albedo").convert("RGB")
    nrm = load(name, "normal").convert("RGB")
    rgh = load(name, "rough").convert("L")
    lt = lit(alb, nrm, rgh)
    n = alb.width

    def seam_crop(im):
        big = Image.new(im.mode, (n * 2, n * 2))
        for y in range(2):
            for x in range(2):
                big.paste(im, (x * n, y * n))
        o = n - crop // 2
        return big.crop((o, o, o + crop, o + crop))

    out = Image.new("RGB", (crop * 2 + 8, crop), BG)
    out.paste(seam_crop(alb), (0, 0))
    out.paste(seam_crop(lt), (crop + 8, 0))
    p = os.path.join(OUT_DIR, f"detail_{name}.png")
    out.save(p)
    print("wrote", p)


def lit_sheet(names):
    cell = 384
    cols = 4
    rows = math.ceil(len(names) / cols)
    sheet = Image.new("RGB", (cols * (cell + 6), rows * (cell + 22)), BG)
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        alb = load(name, "albedo").convert("RGB")
        lt = lit(alb, load(name, "normal").convert("RGB"), load(name, "rough").convert("L"))
        x = (i % cols) * (cell + 6)
        y = (i // cols) * (cell + 22)
        sheet.paste(tile2(lt, cell // 2), (x, y + 20))
        d.text((x + 2, y + 2), name, fill=FG, font=font(14))
    p = os.path.join(OUT_DIR, "lit_sheet.png")
    sheet.save(p)
    print("wrote", p)


def fx_zoom():
    """Each FX sprite enlarged (nearest 2-4x) over a checkerboard and over dark grey."""
    tiles = []
    for fx in FX:
        im = Image.open(os.path.join(FX_DIR, fx)).convert("RGBA")
        sc = max(1, 256 // im.height)
        im = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
        a = checker(im.width, im.height, 16)
        a.alpha_composite(im)
        b = Image.new("RGBA", im.size, (55, 55, 58, 255))
        b.alpha_composite(im)
        pair = Image.new("RGB", (im.width * 2 + 6, im.height), BG)
        pair.paste(a.convert("RGB"), (0, 0))
        pair.paste(b.convert("RGB"), (im.width + 6, 0))
        tiles.append(pair)
    W = 1600
    x = y = rowh = 0
    pos = []
    for t in tiles:
        if x + t.width > W:
            x, y, rowh = 0, y + rowh + 8, 0
        pos.append((x, y))
        x += t.width + 12
        rowh = max(rowh, t.height)
    sheet = Image.new("RGB", (W, y + rowh), BG)
    for t, p in zip(tiles, pos):
        sheet.paste(t, p)
    path = os.path.join(OUT_DIR, "fx_zoom.png")
    sheet.save(path)
    print("wrote", path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--detail", default="", help="comma separated material names")
    ap.add_argument("--lit", action="store_true")
    ap.add_argument("--crop", type=int, default=720)
    ap.add_argument("--fx", action="store_true")
    args = ap.parse_args()
    if args.detail:
        for nm in args.detail.split(","):
            detail(nm, args.crop)
    elif args.fx:
        fx_zoom()
    elif args.lit:
        lit_sheet([m[0] for m in MATERIALS])
    else:
        contact_sheet()
    return 0


if __name__ == "__main__":
    sys.exit(main())
