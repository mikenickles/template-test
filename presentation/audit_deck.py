#!/usr/bin/env python3
"""Automated QA audit for a pptx deck — reads the OOXML directly and prints a PASS/FAIL summary.

    python3 audit_deck.py ai-agents-v1.pptx

Checks
  1. Slide count (10) and canvas size (13.333" x 7.5")
  2. Words per slide (hard cap 60; content slides 2-9 targeted at 30-50 -> WARN outside band)
  3. Font sizes: global minimum >= 12pt; body/stat roles >= 16pt; titles 28-36pt
     (roles come from objectName prefixes written by build_deck.js; placeholders by <p:ph> type)
  4. Geometry: out-of-slide shapes, 0.5" safe-area violations (footer band exempt),
     overlapping text boxes, arrows/arcs that pass through a text box
  5. Text fit: simulated word-wrap with metric-compatible fonts (Carlito = Calibri,
     Caladea = Cambria) -> overflowing boxes, words broken mid-word, single-word orphans (WARN)
  6. Backgrounds: dark on slides 1 & 10, light on 2-9
  7. WCAG contrast of every text run against the fill beneath it (AA: 4.5:1, 3:1 for large text)
  8. Layout variety: geometric similarity of consecutive slides
  9. Native chart (slide 6) and table (slide 8) integrity; title position consistency (2-9)
"""
import math
import re
import sys
from itertools import combinations

from lxml import etree
from PIL import ImageFont
from pptx import Presentation

EMU = 914400.0
NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
FONT_DIR = "/usr/share/fonts/truetype/crosextra/"
FONT_FILES = {  # metric-compatible stand-ins used by LibreOffice
    ("Calibri", False, False): "Carlito-Regular.ttf", ("Calibri", True, False): "Carlito-Bold.ttf",
    ("Calibri", False, True): "Carlito-Italic.ttf", ("Calibri", True, True): "Carlito-BoldItalic.ttf",
    ("Cambria", False, False): "Caladea-Regular.ttf", ("Cambria", True, False): "Caladea-Bold.ttf",
    ("Cambria", False, True): "Caladea-Italic.ttf", ("Cambria", True, True): "Caladea-BoldItalic.ttf",
}
_font_cache = {}

EXPECT_SLIDES, EXPECT_W, EXPECT_H = 10, 13.333, 7.5
DARK_SLIDES = {1, 10}
SAFE = 0.5            # safe-area margin, inches
FOOTER_BAND = 6.8     # shapes starting below this y are footer furniture
WORD_CAP, WORD_LO, WORD_HI = 60, 30, 50


# ----------------------------------------------------------------------------- helpers
def q(tag):
    pre, t = tag.split(":")
    return "{%s}%s" % (NS[pre], t)


def luminance(hexc):
    def ch(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hexc[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def words_in(text):
    return [t for t in text.split() if re.search(r"[A-Za-z0-9]", t)]


def font(face, bold, italic, size_pt):
    key = (face, bold, italic, size_pt)
    if key not in _font_cache:
        fname = FONT_FILES.get((face, bold, italic), FONT_FILES[("Calibri", bold, italic)])
        _font_cache[key] = ImageFont.truetype(FONT_DIR + fname, int(round(size_pt * 10)))
    return _font_cache[key]


def text_width_in(s, face, bold, italic, size_pt, spc_pt=0.0):
    f = font(face, bold, italic, size_pt)
    return (f.getlength(s) / 10.0 + spc_pt * len(s)) / 72.0


class Theme:
    def __init__(self, prs):
        part = prs.slide_master.part.part_related_by(
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme")
        root = etree.fromstring(part.blob)
        self.colors = {}
        for slot in root.find(".//a:clrScheme", NS):
            name = etree.QName(slot).localname
            clr = slot[0]
            self.colors[name] = clr.get("val") if etree.QName(clr).localname == "srgbClr" else clr.get("lastClr", "000000")
        alias = {"tx1": "dk1", "bg1": "lt1", "tx2": "dk2", "bg2": "lt2"}
        for k, v in alias.items():
            self.colors[k] = self.colors[v]
        self.major = root.find(".//a:majorFont/a:latin", NS).get("typeface")
        self.minor = root.find(".//a:minorFont/a:latin", NS).get("typeface")

    def color_of(self, el):
        """Resolve the first srgbClr/schemeClr under a fill element."""
        if el is None:
            return None
        for child in el.iter():
            ln = etree.QName(child).localname
            if ln == "srgbClr":
                return child.get("val").upper()
            if ln == "schemeClr":
                return self.colors.get(child.get("val"), "000000").upper()
        return None


def xfrm_box(el):
    off = el.find(".//a:off", NS)
    ext = el.find(".//a:ext", NS)
    if off is None or ext is None:
        return None
    return (int(off.get("x")) / EMU, int(off.get("y")) / EMU, int(ext.get("cx")) / EMU, int(ext.get("cy")) / EMU)


def overlap_area(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    dx = min(ax + aw, bx + bw) - max(ax, bx)
    dy = min(ay + ah, by + bh) - max(ay, by)
    return dx * dy if dx > 0 and dy > 0 else 0.0


def inside(pt, box, shrink=0.0):
    x, y = pt
    bx, by, bw, bh = box
    return bx + shrink < x < bx + bw - shrink and by + shrink < y < by + bh - shrink


# ----------------------------------------------------------------------------- per-shape extraction
class TextItem:
    """A run of text with its resolved style and the box it must fit in."""
    def __init__(self, **kw):
        self.__dict__.update(kw)


def role_of(sp):
    ph = sp.find(".//p:nvPr/p:ph", NS)
    if ph is not None:
        t = ph.get("type", "body")
        if t in ("title", "ctrTitle"):
            return "title"
        if t == "sldNum":
            return "sldnum"
        return "kicker" if ph.get("idx") == "102" else "body-ph"
    name = sp.find(".//p:cNvPr", NS).get("name", "")
    return name.split("-")[0] if "-" in name else name


def run_style(r, lst_defrpr, theme, is_title):
    rpr = r.find("a:rPr", NS)
    def attr(k):
        if rpr is not None and rpr.get(k) is not None:
            return rpr.get(k)
        if lst_defrpr is not None and lst_defrpr.get(k) is not None:
            return lst_defrpr.get(k)
        return None
    sz = attr("sz")
    size = int(sz) / 100.0 if sz else 18.0
    bold = attr("b") == "1"
    italic = attr("i") == "1"
    spc = int(attr("spc")) / 100.0 if attr("spc") else 0.0
    face = None
    for src in (rpr, lst_defrpr):
        if src is not None and src.find("a:latin", NS) is not None:
            face = src.find("a:latin", NS).get("typeface")
            break
    if face is None:
        face = theme.major if is_title else theme.minor
    elif face.startswith("+mj"):
        face = theme.major
    elif face.startswith("+mn"):
        face = theme.minor
    color = None
    for src in (rpr, lst_defrpr):
        if src is not None and src.find("a:solidFill", NS) is not None:
            color = theme.color_of(src.find("a:solidFill", NS))
            break
    return size, bold, italic, spc, face, color


def para_texts(txBody, theme, is_title, box, insets, anchor, line_mult_default=1.0):
    """Yield (paragraph_text, style, box, insets) for each paragraph of a text body."""
    lst = txBody.find("a:lstStyle/a:lvl1pPr/a:defRPr", NS)
    out = []
    for p in txBody.findall("a:p", NS):
        runs = p.findall("a:r", NS)
        if not runs:
            continue
        txt = "".join((r.find("a:t", NS).text or "") for r in runs)
        if not txt.strip():
            continue
        styles = [run_style(r, lst, theme, is_title) for r in runs]
        dominant = max(styles, key=lambda s: s[0])
        lnspc = p.find("a:pPr/a:lnSpc/a:spcPct", NS)
        mult = int(lnspc.get("val")) / 100000.0 if lnspc is not None else line_mult_default
        out.append((txt, styles, dominant, mult))
    return out


def wrap_lines(txt, face, bold, italic, size, spc, width_in):
    """Greedy word wrap. Returns (lines, broken_word)."""
    lines, cur, broken = [], "", False
    for word in txt.split(" "):
        trial = (cur + " " + word) if cur else word
        if text_width_in(trial, face, bold, italic, size, spc) <= width_in or not cur:
            if not cur and text_width_in(word, face, bold, italic, size, spc) > width_in:
                broken = True
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines, broken


# ----------------------------------------------------------------------------- audit
def audit(path):
    prs = Presentation(path)
    theme = Theme(prs)
    SW, SH = prs.slide_width / EMU, prs.slide_height / EMU
    results, warns = [], []
    rows = []
    all_sizes, chart_sizes = [], []
    role_fail, oob, safe_viol, overflow, broken_words, orphans = [], [], [], [], [], []
    text_overlaps, arrow_hits, contrast_fail, bg_fail = [], [], [], []
    title_boxes, signatures = {}, {}
    min_contrast = (99, None)
    word_counts, chart_words = {}, {}
    chart_ok = table_ok = False
    table_notes = []

    for sidx, slide in enumerate(prs.slides, start=1):
        root = slide._element
        layout_name = slide.slide_layout.name
        # ---- background
        bg_hex = None
        for src in (slide._element, slide.slide_layout._element, prs.slide_master._element):
            bg = src.find(".//p:cSld/p:bg", NS)
            if bg is not None:
                bg_hex = theme.color_of(bg)
                break
        bg_hex = bg_hex or "FFFFFF"
        lum = luminance(bg_hex)
        if sidx in DARK_SLIDES and lum > 0.2:
            bg_fail.append(f"slide {sidx}: expected dark, got #{bg_hex}")
        if sidx not in DARK_SLIDES and lum < 0.8:
            bg_fail.append(f"slide {sidx}: expected light, got #{bg_hex}")

        tree = root.find(".//p:cSld/p:spTree", NS)
        shapes = [el for el in tree.iter() if etree.QName(el).localname in ("sp", "pic", "graphicFrame", "cxnSp")]
        filled = []    # (z, box, hex) for contrast lookups
        text_boxes = []  # (name, box)
        arrows = []
        nwords, slide_sizes = 0, []
        sig = set()

        for z, sp in enumerate(shapes):
            kind = etree.QName(sp).localname
            box = xfrm_box(sp.find("p:spPr", NS) if kind in ("sp", "pic", "cxnSp") else sp.find("p:xfrm", NS))
            if box is None:
                continue
            name = sp.find(".//p:cNvPr", NS).get("name", "")
            role = role_of(sp)
            x, y, w, h = box
            # ---- bounds
            if x < -0.01 or y < -0.01 or x + w > SW + 0.01 or y + h > SH + 0.01:
                oob.append(f"slide {sidx}: {name} at ({x:.2f},{y:.2f},{w:.2f},{h:.2f})")
            if role not in ("sldnum",) and y < FOOTER_BAND:
                if x < SAFE - 0.01 or y < SAFE - 0.01 or x + w > SW - SAFE + 0.01 or y + h > SH - SAFE + 0.01:
                    safe_viol.append(f"slide {sidx}: {name} ({role}) box ({x:.2f},{y:.2f},{x + w:.2f},{y + h:.2f})")
            if not role.startswith("deco") and role not in ("sldnum",):
                sig.add((kind, role.split("-")[0], round(x * 2) / 2, round(y * 2) / 2, round(w * 2) / 2, round(h * 2) / 2))

            # ---- fills (for contrast)
            spPr = sp.find("p:spPr", NS)
            if spPr is not None and spPr.find("a:solidFill", NS) is not None:
                filled.append((z, box, theme.color_of(spPr.find("a:solidFill", NS))))

            # ---- arrows
            geom = spPr.find("a:prstGeom", NS) if spPr is not None else None
            prst = geom.get("prst") if geom is not None else None
            outline_only = spPr is not None and spPr.find("a:solidFill", NS) is None and spPr.find("a:ln/a:solidFill", NS) is not None
            if (role == "arrow" and prst in ("line", "arc")) or (outline_only and prst in ("ellipse", "arc")):
                xf = spPr.find("a:xfrm", NS)
                fh, fv = xf.get("flipH") == "1", xf.get("flipV") == "1"
                pts = []
                if prst == "ellipse":
                    cx_, cy_ = x + w / 2, y + h / 2
                    pts = [(cx_ + w / 2 * math.cos(2 * math.pi * t / 160), cy_ + h / 2 * math.sin(2 * math.pi * t / 160)) for t in range(160)]
                elif prst == "line":
                    x0, x1 = (x + w, x) if fh else (x, x + w)
                    y0, y1 = (y + h, y) if fv else (y, y + h)
                    pts = [(x0 + (x1 - x0) * t / 80, y0 + (y1 - y0) * t / 80) for t in range(81)]
                else:
                    adj = {g.get("name"): int(g.get("fmla").split()[1]) / 60000.0 for g in geom.findall(".//a:gd", NS)}
                    a0, a1 = adj.get("adj1", 270), adj.get("adj2", 0)
                    sweep = (a1 - a0) % 360
                    cx_, cy_ = x + w / 2, y + h / 2
                    for t in range(81):
                        ang = math.radians(a0 + sweep * t / 80)
                        pts.append((cx_ + w / 2 * math.cos(ang), cy_ + h / 2 * math.sin(ang)))
                arrows.append((name, pts))

            # ---- text bodies
            txBody = sp.find("p:txBody", NS)
            if txBody is not None and role != "sldnum":
                bodyPr = txBody.find("a:bodyPr", NS)
                ins = [int(bodyPr.get(k)) / EMU if bodyPr is not None and bodyPr.get(k) is not None else d
                       for k, d in (("lIns", 0.1), ("tIns", 0.05), ("rIns", 0.1), ("bIns", 0.05))]
                paras = para_texts(txBody, theme, role == "title", box, ins, None)
                if paras:
                    knockout = spPr is not None and spPr.find("a:solidFill", NS) is not None
                    text_boxes.append((name, box, role + ("|knockout" if knockout else "")))
                total_h = 0.0
                for txt, styles, dom, mult in paras:
                    nwords += len(words_in(txt))
                    size, bold, italic, spc, face, color = dom
                    for st in styles:
                        all_sizes.append(st[0])
                        slide_sizes.append(st[0])
                        sz = st[0]
                        if role == "title" and not (28 <= sz <= 36):
                            role_fail.append(f"slide {sidx}: title '{txt[:30]}' is {sz}pt (needs 28-36)")
                        if (role.startswith("body") or role.startswith("stat")) and sz < 16:
                            role_fail.append(f"slide {sidx}: body text '{txt[:30]}' is {sz}pt (<16)")
                        if sz < 12:
                            role_fail.append(f"slide {sidx}: '{txt[:30]}' is {sz}pt (<12)")
                    inner_w = w - ins[0] - ins[2]
                    lines, broken = wrap_lines(txt, face, bold, italic, size, spc, inner_w)
                    if broken:
                        broken_words.append(f"slide {sidx}: '{txt[:40]}' — a word is wider than its box")
                    if len(lines) > 1 and len(words_in(lines[-1])) == 1 and len(lines[-1]) <= 12:
                        orphans.append(f"slide {sidx}: '{txt[:40]}…' leaves '{lines[-1]}' alone on the last line")
                    total_h += len(lines) * size * 1.2 * mult / 72.0
                    # contrast against the topmost fill beneath the box centre
                    if color:
                        cpt = (x + w / 2, y + h / 2)
                        under = [f for f in filled if f[0] < z and inside(cpt, f[1])]
                        bgc = under[-1][2] if under else bg_hex
                        cr = contrast(color, bgc)
                        large = size >= 18 or (size >= 14 and bold)  # WCAG "large scale" text
                        need = 3.0 if large else 4.5
                        if cr < min_contrast[0]:
                            min_contrast = (cr, f"slide {sidx}: '{txt[:24]}' #{color} on #{bgc}")
                        if cr < need:
                            contrast_fail.append(f"slide {sidx}: '{txt[:30]}' #{color} on #{bgc} = {cr:.2f}:1 (needs {need})")
                if paras and total_h > (h - ins[1] - ins[3]) + 0.06:
                    overflow.append(f"slide {sidx}: {name} '{paras[0][0][:32]}' needs {total_h:.2f}\" of {h - ins[1] - ins[3]:.2f}\"")
                if role == "title":
                    algn = txBody.find("a:p/a:pPr", NS)
                    title_boxes[sidx] = (round(x, 3), round(y, 3), round(w, 3), round(h, 3), algn.get("algn") if algn is not None else None)

            # ---- tables
            tbl = sp.find(".//a:tbl", NS)
            if tbl is not None:
                col_w = [int(g.get("w")) / EMU for g in tbl.findall("a:tblGrid/a:gridCol", NS)]
                trs = tbl.findall("a:tr", NS)
                ty = y
                for tr in trs:
                    rh = int(tr.get("h")) / EMU
                    tx = x
                    for ci, tc in enumerate(tr.findall("a:tc", NS)):
                        tcPr = tc.find("a:tcPr", NS)
                        mar = [int(tcPr.get(k)) / EMU if tcPr is not None and tcPr.get(k) else d
                               for k, d in (("marL", 0.1), ("marT", 0.05), ("marR", 0.1), ("marB", 0.05))]
                        cell_fill = theme.color_of(tcPr.find("a:solidFill", NS)) if tcPr is not None and tcPr.find("a:solidFill", NS) is not None else bg_hex
                        for txt, styles, dom, mult in para_texts(tc.find("a:txBody", NS), theme, False, None, None, None):
                            nwords += len(words_in(txt))
                            size, bold, italic, spc, face, color = dom
                            for st in styles:
                                all_sizes.append(st[0]); slide_sizes.append(st[0])
                                if st[0] < 16:
                                    role_fail.append(f"slide {sidx}: table text '{txt[:30]}' is {st[0]}pt (<16)")
                            lines, broken = wrap_lines(txt, face, bold, italic, size, spc, col_w[ci] - mar[0] - mar[2])
                            if broken:
                                broken_words.append(f"slide {sidx}: table cell '{txt}' breaks mid-word")
                            if len(lines) > 1:
                                table_notes.append(f"'{txt}' wraps to {len(lines)} lines")
                            if len(lines) > 1 and len(words_in(lines[-1])) == 1:
                                orphans.append(f"slide {sidx}: table cell '{txt}' leaves '{lines[-1]}' alone")
                            if len(lines) * size * 1.2 / 72.0 > rh - mar[1] - mar[3] + 0.06:
                                overflow.append(f"slide {sidx}: table cell '{txt}' overflows its row")
                            if color:
                                cr = contrast(color, cell_fill)
                                need = 3.0 if size >= 18 or (size >= 14 and bold) else 4.5
                                if cr < min_contrast[0]:
                                    min_contrast = (cr, f"slide {sidx}: table '{txt[:20]}' #{color} on #{cell_fill}")
                                if cr < need:
                                    contrast_fail.append(f"slide {sidx}: table '{txt}' {cr:.2f}:1")
                        tx += col_w[ci]
                    ty += rh
                if sidx == 8 and len(trs) == 5 and len(col_w) == 4:
                    table_ok = True
                text_boxes.append((name, box, "table"))

            # ---- charts
            gd = sp.find(".//a:graphicData", NS)
            if gd is not None and gd.get("uri", "").endswith("/chart"):
                rid = gd.find("c:chart", NS).get(q("r:id"))
                cpart = slide.part.related_part(rid)
                croot = etree.fromstring(cpart.blob)
                ctext = [t.text or "" for t in croot.iter(q("a:t"))]
                ctext += [v.text or "" for v in croot.iter(q("c:v")) if not re.fullmatch(r"[\d.]+", v.text or "")]
                # category labels repeat once per series in the cache; count each visible string once
                chart_words[sidx] = len(words_in(" ".join(dict.fromkeys(t.strip() for t in ctext if t.strip()))))
                for el in croot.iter():
                    if etree.QName(el).localname in ("defRPr", "rPr") and el.get("sz"):
                        chart_sizes.append(int(el.get("sz")) / 100.0)
                bars = croot.findall(".//c:barChart", NS)
                if sidx == 6 and bars:
                    nser = len(bars[0].findall("c:ser", NS))
                    ncat = len(bars[0].find("c:ser/c:cat", NS).findall(".//c:pt", NS))
                    chart_ok = nser == 3 and ncat == 3
                text_boxes.append((name, box, "chart"))

        # ---- slide-level geometry checks
        for (n1, b1, r1), (n2, b2, r2) in combinations(text_boxes, 2):
            if overlap_area(b1, b2) > 0.005:
                text_overlaps.append(f"slide {sidx}: '{n1}' overlaps '{n2}'")
        for aname, pts in arrows:
            for tname, tbox, trole in text_boxes:
                if trole in ("chart",) or trole.endswith("|knockout"):
                    continue  # charts own their gridlines; knockout labels mask the line by design
                if any(inside(pt, tbox, shrink=0.02) for pt in pts):
                    arrow_hits.append(f"slide {sidx}: {aname} passes through text '{tname}'")
                    break

        word_counts[sidx] = nwords
        signatures[sidx] = sig
        rows.append((sidx, layout_name, nwords, chart_words.get(sidx, 0),
                     min(slide_sizes) if slide_sizes else 0, max(slide_sizes) if slide_sizes else 0, len(shapes)))

    # ---- layout-level text (footer) sizes
    for layout in prs.slide_layouts:
        for el in layout._element.iter(q("a:rPr")):
            if el.get("sz"):
                all_sizes.append(int(el.get("sz")) / 100.0)

    # ---- layout variety
    similar = []
    for i in range(1, len(prs.slides)):
        a, b = signatures[i], signatures[i + 1]
        if a or b:
            j = len(a & b) / max(1, len(a | b))
            if j >= 0.6:
                similar.append(f"slides {i}-{i + 1}: geometric similarity {j:.2f}")
    # ---- title consistency on content slides
    content_titles = {k: v for k, v in title_boxes.items() if 2 <= k <= 9}
    title_positions = {v[:4] for v in content_titles.values()}
    title_aligns = {v[4] for v in content_titles.values()}

    # ------------------------------------------------------------------ report
    print(f"\nDECK AUDIT — {path}\n")
    print(f"{'Slide':<6}{'Layout':<14}{'Words':>6}{'(+chart)':>10}{'Min pt':>8}{'Max pt':>8}{'Shapes':>8}")
    for s, lay, nw, cw, mn, mx, ns in rows:
        print(f"{s:<6}{lay:<14}{nw:>6}{('+' + str(cw)) if cw else '':>10}{mn:>8.0f}{mx:>8.0f}{ns:>8}")
    print()

    def check(label, ok, detail="", items=None, warn=False):
        tag = "PASS" if ok else ("WARN" if warn else "FAIL")
        results.append((tag, label))
        print(f"[{tag}] {label}{(' — ' + detail) if detail else ''}")
        for it in (items or [])[:12]:
            print(f"        · {it}")

    n = len(prs.slides)
    check("Slide count", n == EXPECT_SLIDES, f"{n} slides (expected {EXPECT_SLIDES})")
    check("Canvas 16:9 widescreen", abs(SW - EXPECT_W) < 0.01 and abs(SH - EXPECT_H) < 0.01, f'{SW:.3f}" x {SH:.3f}"')
    totals = {k: v + chart_words.get(k, 0) for k, v in word_counts.items()}  # chart text counts too
    over = [f"slide {k}: {v} words" for k, v in totals.items() if v > WORD_CAP]
    check(f"Word count <= {WORD_CAP} per slide (incl. chart text)", not over, f"max {max(totals.values())} words", over)
    band = [f"slide {k}: {v} words" for k, v in totals.items() if 2 <= k <= 9 and not (WORD_LO <= v <= WORD_HI)]
    check(f"Content slides in {WORD_LO}-{WORD_HI} word target", not band, "", band, warn=True)
    gmin = min(all_sizes + chart_sizes)
    check("Minimum font size >= 12pt (slides, layouts, chart)", gmin >= 12, f"smallest found {gmin:g}pt")
    check("Role sizes: titles 28-36pt, body/stat >= 16pt, tables >= 16pt", not role_fail, "", role_fail)
    check("Content-slide titles share one position and left alignment",
          len(title_positions) == 1 and title_aligns == {"l"},
          f"{len(content_titles)} titles, positions={len(title_positions)}, align={sorted(a or 'inherit' for a in title_aligns)}")
    check("Out-of-bounds shapes", not oob, f"{len(oob)} found", oob)
    check(f'Safe-area margins ({SAFE}") respected', not safe_viol, f"{len(safe_viol)} found", safe_viol)
    check("Text fits its box (simulated wrap)", not overflow, f"{len(overflow)} overflowing", overflow)
    check("No words broken mid-word", not broken_words, "", broken_words)
    check("Overlapping text boxes", not text_overlaps, f"{len(text_overlaps)} found", text_overlaps)
    check("Arrows, arcs and rings clear of text", not arrow_hits, f"{len(arrow_hits)} found", arrow_hits)
    check("Backgrounds: dark on 1 & 10, light on 2-9", not bg_fail, "", bg_fail)
    check("WCAG AA text contrast", not contrast_fail, f"lowest {min_contrast[0]:.2f}:1 ({min_contrast[1]})", contrast_fail)
    check("Layout variety (no consecutive near-duplicates)", not similar, "", similar)
    check("Slide 6 native chart (bar, 3 series x 3 tiers)", chart_ok)
    check("Slide 8 native table (header + 4 rows x 4 cols)", table_ok, "; ".join(table_notes) if table_notes else "every cell on one line")
    check("No single-word orphan lines", not orphans, "", orphans, warn=True)

    fails = sum(1 for t, _ in results if t == "FAIL")
    wcount = sum(1 for t, _ in results if t == "WARN")
    print(f"\nSUMMARY: {'PASS' if not fails else 'FAIL'} — {len(results) - fails - wcount} pass, {wcount} warn, {fails} fail")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(audit(sys.argv[1] if len(sys.argv) > 1 else "ai-agents-v1.pptx"))
