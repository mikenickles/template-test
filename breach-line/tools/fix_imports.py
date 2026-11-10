#!/usr/bin/env python3
"""Writes explicit Godot import settings for generated textures.

Materials are created at runtime, so the editor's automatic "used in 3D" /
"used as normal map" detection never triggers. This script makes every
surface texture VRAM-compressed with mipmaps (normal maps flagged so they
use RG/normal compression) and keeps FX sprites lossless with mipmaps.
Run from breach-line/, then `godot --headless --path . --import`.
"""
import glob
import os

PARAMS_3D = """compress/mode=2
compress/high_quality=false
compress/lossy_quality=0.7
compress/uastc_level=0
compress/rdo_quality_loss=0.0
compress/hdr_compression=1
compress/normal_map={normal}
compress/channel_pack=0
mipmaps/generate=true
mipmaps/limit=-1
roughness/mode=0
roughness/src_normal=""
process/channel_remap/red=0
process/channel_remap/green=1
process/channel_remap/blue=2
process/channel_remap/alpha=3
process/fix_alpha_border=true
process/premult_alpha=false
process/normal_map_invert_y=false
process/hdr_as_srgb=false
process/hdr_clamp_exposure=false
process/size_limit=0
detect_3d/compress_to=0
"""

PARAMS_FX = PARAMS_3D.replace("compress/mode=2", "compress/mode=0").replace("compress/normal_map={normal}", "compress/normal_map=2")


def write(path: str, params: str) -> None:
    imp = path + ".import"
    uid = ""
    if os.path.exists(imp):
        for line in open(imp):
            if line.startswith("uid="):
                uid = line.strip()
    rel = "res://" + os.path.relpath(path, ".").replace(os.sep, "/")
    out = ["[remap]", "", 'importer="texture"', 'type="CompressedTexture2D"']
    if uid:
        out.append(uid)
    out += ["", "[deps]", "", f'source_file="{rel}"', "", "[params]", "", params]
    open(imp, "w").write("\n".join(out))


def main() -> None:
    n = 0
    for p in sorted(glob.glob("assets/textures/*/*.*")):
        if p.endswith(".import"):
            continue
        write(p, PARAMS_3D.format(normal=1 if "_normal." in p else 2))
        n += 1
    for p in sorted(glob.glob("assets/fx/*.png")) + sorted(glob.glob("assets/decals/*.png")):
        write(p, PARAMS_FX)
        n += 1
    print(f"wrote import settings for {n} textures")


if __name__ == "__main__":
    main()
