"""Pack Timberbot into one self-contained HTML file: no server, no network, just double-click it.

    python3 tools/build_single.py            # writes dist/timberbot.html (+ dist/timberbot.artifact.html)

Needs Python 3 with Pillow, and Node.js (esbuild is fetched once through npx).
The game code is bundled with esbuild; every texture and model is embedded as base64.
To stay under the 16 MB limit for a published page, the robot's 2048 px maps are shipped
at 1024 px and the large ground textures are re-encoded a little smaller.
"""
import base64
import io
import json
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
TEX = os.path.join(ROOT, 'assets', 'textures')
MOD = os.path.join(ROOT, 'assets', 'models')
DIST = os.path.join(ROOT, 'dist')
ESBUILD = 'esbuild@0.24.2'


def bundle_js():
    with tempfile.TemporaryDirectory() as tmp:
        cfg = os.path.join(ROOT, 'tools', 'tsconfig.bundle.json')
        out = os.path.join(tmp, 'game.js')
        cmd = ['npx', '--yes', ESBUILD, 'src/main.js', '--bundle', '--format=iife', '--minify', '--target=es2020',
               f'--tsconfig={cfg}', f'--outfile={out}', '--log-level=error']
        subprocess.run(cmd, cwd=ROOT, check=True)
        with open(out, encoding='utf-8') as f:
            return f.read()


def texture_bytes(path, name):
    raw = open(path, 'rb').read()
    if name.startswith('robot_'):
        im = Image.open(path)
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=88, method=6)
        return buf.getvalue()
    if name.startswith('ground_'):
        buf = io.BytesIO()
        Image.open(path).save(buf, 'WEBP', quality=80, method=6)
        return min(raw, buf.getvalue(), key=len)
    return raw


def embedded_assets():
    textures, models = {}, {}
    for fn in sorted(os.listdir(TEX)):
        if fn.endswith('.webp'):
            name = fn[:-5]
            textures[name] = 'data:image/webp;base64,' + base64.b64encode(texture_bytes(os.path.join(TEX, fn), name)).decode()
    for fn in sorted(os.listdir(MOD)):
        if fn.endswith('.glb'):
            models[fn[:-4]] = base64.b64encode(open(os.path.join(MOD, fn), 'rb').read()).decode()
    vegetation = json.load(open(os.path.join(MOD, 'vegetation.json')))
    return {'textures': textures, 'models': models, 'vegetation': vegetation}


def safe_script(js):
    return js.replace('</script', '<\\/script')


def main():
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    css = open(os.path.join(ROOT, 'style.css'), encoding='utf-8').read()
    js = bundle_js()
    data = json.dumps(embedded_assets(), separators=(',', ':'))
    html = html.replace('<link rel="stylesheet" href="./style.css">', '<style>\n' + css + '</style>')
    html = re.sub(r'<script type="importmap">.*?</script>\n?', '', html, flags=re.S)
    scripts = '<script>window.__TB_ASSETS=' + data + ';</script>\n<script>' + safe_script(js) + '</script>'
    html = html.replace('<script type="module" src="./src/main.js"></script>', scripts)
    assert 'src="./src/main.js"' not in html and '__TB_ASSETS' in html
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, 'timberbot.html')
    open(out, 'w', encoding='utf-8').write(html)
    # Published-page variant: the host supplies the document skeleton, so keep only head/body content.
    frag = re.sub(r'<!doctype html>\s*|</?html[^>]*>\s*|</?head>\s*|</?body>\s*', '', html, flags=re.I)
    frag = re.sub(r'<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*', '', frag)
    open(os.path.join(DIST, 'timberbot.artifact.html'), 'w', encoding='utf-8').write(frag)
    print(f'wrote {out}  {os.path.getsize(out) / 1048576:.2f} MB  (code {len(js) / 1024:.0f} KB, assets {len(data) / 1048576:.2f} MB)')


if __name__ == '__main__':
    sys.exit(main())
