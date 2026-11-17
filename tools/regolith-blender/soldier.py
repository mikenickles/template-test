# REGOLITH soldiers (team concept sheets) + first-person forearms and gloves.
# Soldier faces -z, +x is the character's right; skinned to the game's procedural rig (bones have identity rest rotation).
import math
from lib import *
PAL = {
  'blue': dict(suit=0x48464b, suit2=0x3a383d, armor=0xcab697, armorD=0xa8946f, band=0x2f62d6, helmet=0xcab697, side=0xcab697, boots=0xb09474, bootD=0x8f7558, sole=0xa65a36, strap=0x4d4440, pouch=0x9c7c58, pack=0xc4b08f, glove=0x3b393f, ear=0x8d8a8e, holster=0x2a282c),
  'red': dict(suit=0x48444a, suit2=0x3a373c, armor=0x6c6059, armorD=0x584e48, band=0xd23f32, helmet=0x4a454b, side=0x7a6c63, boots=0x554c48, bootD=0x453d3a, sole=0xa65a36, strap=0x3a3639, pouch=0x786a60, pack=0x5f5652, glove=0x3b393f, ear=0x3f3b40, holster=0x2a282c),
}
SX, SH_Y, EL_Y, HX, HP_Y, KN_Y = 0.24, 1.45, 1.16, 0.105, 0.91, 0.48

def soldier(team):
    oly = team == 'blue'; C = PAL[team]; m = Model('soldier_' + team)
    m.bones = [dict(name='hips', parent=None, pos=[0, 0.95, 0]), dict(name='torso', parent='hips', pos=[0, 0.06, 0]), dict(name='head', parent='torso', pos=[0, 0.46, 0])]
    for s, sx in (('L', -1), ('R', 1)):
        m.bones += [dict(name='sh' + s, parent='torso', pos=[sx * SX, 0.44, 0]), dict(name='el' + s, parent='sh' + s, pos=[0, -0.29, 0]),
                    dict(name='hp' + s, parent='hips', pos=[sx * HX, -0.04, 0]), dict(name='kn' + s, parent='hp' + s, pos=[0, -0.43, 0])]
    soft = dict(mat='soft', smooth=True, bevel=0); hard = dict(mat='hard', smooth=False)
    # ---- torso + pelvis (one skin, blended at the waist)
    m.rings_y([(0.80, 0.12, 0.10), (0.86, 0.175, 0.12), (0.93, 0.19, 0.128), (1.0, 0.178, 0.12), (1.07, 0.168, 0.114), (1.17, 0.19, 0.128), (1.29, 0.222, 0.142), (1.39, 0.225, 0.14), (1.45, 0.19, 0.12), (1.49, 0.09, 0.085)],
              seg=16, col=C['suit'], w=blend('hips', 'torso', 1, 1.03, 0.1), **soft)
    m.rings_y([(0.982, 0.197, 0.135), (1.04, 0.192, 0.131)], seg=16, col=C['strap'], bone='hips', mat='hard', smooth=True, bevel=0.004)
    m.box(0.06, 0.046, 0.02, (0, 1.011, -0.136), col=0x777470, bone='hips', bevel=0.005, **hard)
    for x, z, ry in ((-0.11, -0.118, 0.5), (0.11, -0.118, -0.5), (-0.2, 0.0, math.pi / 2), (0.2, 0.0, -math.pi / 2), (-0.09, 0.128, math.pi - 0.4), (0.09, 0.128, math.pi + 0.4)):
        m.box(0.078, 0.092, 0.05, (x, 0.995, z), (0, ry, 0), col=C['pouch'], bone='hips', bevel=0.012, **hard)
        m.box(0.082, 0.034, 0.056, (x, 1.03, z), (0, ry, 0), col=C['armorD'] if oly else C['armorD'], bone='hips', bevel=0.008, **hard)
    # ---- chest / back plates, collar
    m.hull([(0.155, 1.445, -0.118), (0.178, 1.385, -0.158), (0.162, 1.29, -0.166), (0.115, 1.2, -0.148), (0, 1.405, -0.172), (0, 1.27, -0.182), (0, 1.172, -0.152),
            (0.15, 1.445, -0.085), (0.168, 1.385, -0.095), (0.152, 1.29, -0.095), (0.105, 1.2, -0.095)], mirror=True, col=C['armor'], bone='torso', bevel=0.008, **hard)
    m.box(0.08, 0.02, 0.012, (0, 1.4, -0.176), col=C['band'], bone='torso', bevel=0.003, **hard)
    m.hull([(0.15, 1.445, 0.1), (0.172, 1.36, 0.142), (0.152, 1.24, 0.142), (0.1, 1.17, 0.125), (0.14, 1.44, 0.07), (0.15, 1.24, 0.08), (0.1, 1.17, 0.08)], mirror=True, col=C['armor'], bone='torso', bevel=0.008, **hard)
    for sx in (-1, 1): m.box(0.09, 0.032, 0.27, (sx * 0.118, 1.47, 0.0), (0, 0, -sx * 0.14), col=C['armor'], bone='torso', bevel=0.01, **hard)
    m.rings_y([(1.465, 0.105, 0.098), (1.512, 0.088, 0.088)], seg=14, col=C['suit2'], bone='torso', mat='hard', smooth=True, bevel=0.004)
    if oly: m.rings_y([(1.506, 0.09, 0.09), (1.522, 0.086, 0.086)], seg=14, col=C['band'], bone='torso', mat='hard', smooth=True, bevel=0)
    m.cyl(0.058, 0.09, 'y', (0, 1.53, 0), col=C['suit2'], bone='torso', seg=12, **dict(soft))
    # ---- backpack
    m.box(0.26, 0.33, 0.13, (0, 1.305, 0.212), col=C['pack'], bone='torso', bevel=0.03, seg=2, **hard)
    m.box(0.2, 0.05, 0.1, (0, 1.488, 0.205), col=C['pack'], bone='torso', bevel=0.014, **hard)
    for sx in (-1, 1): m.cyl(0.036, 0.2, 'y', (sx * 0.15, 1.3, 0.2), col=C['armorD'], bone='torso', seg=10, mat='hard')
    gy, py, vy = (1.37, 1.235, 1.43) if oly else (1.305, 1.4, 1.22)
    m.box(0.12, 0.022, 0.012, (0, gy, 0.279), col=0xffffff, bone='torso', mat='glow', bevel=0)
    m.box(0.14 if oly else 0.16, 0.09 if oly else 0.1, 0.012, (0, py, 0.279), col=C['band'], bone='torso', bevel=0.003, **hard)
    for i in range(3): m.box(0.13, 0.01, 0.012, (0, vy + (i - 1) * 0.02, 0.279), col=0x2a2a2e, bone='torso', bevel=0, **hard)
    # ---- helmet
    hc = (0, 1.622, -0.005)
    m.sphere(1, hc, (0.137, 0.141, 0.16), clips=[((0, -0.092, 0), (0, -1, 0))], col=C['helmet'], bone='head', **hard)
    m.sphere(1, hc, (0.1415, 0.1445, 0.167), sub=3, clips=[((0, 0, -0.04), (0, 0, 1)), ((0, 0.06, 0), (0, 1, 0)), ((0, -0.085, 0), (0, -1, 0)), ((0.108, 0, 0), (1, 0, 0)), ((-0.108, 0, 0), (-1, 0, 0))], col=0x0b0b0d, bone='head', mat='visor', smooth=True)
    sw = 0.02 if oly else 0.036
    m.sphere(1, hc, (0.142, 0.146, 0.1655), sub=3, clips=[((sw, 0, 0), (1, 0, 0)), ((-sw, 0, 0), (-1, 0, 0)), ((0, 0.066, 0), (0, -1, 0))], col=C['band'], bone='head', **hard)
    if not oly:
        for sx in (-1, 1): m.sphere(1, hc, (0.141, 0.1445, 0.164), clips=[((sx * 0.08, 0, 0), (-sx, 0, 0)), ((0, 0.07, 0), (0, 1, 0)), ((0, -0.07, 0), (0, -1, 0)), ((0, 0, -0.03), (0, 0, -1))], col=C['side'], bone='head', **hard)
    m.hull([(0.095, -0.075, -0.126), (0.075, -0.145, -0.107), (0.1, -0.075, -0.01), (0.088, -0.137, -0.01), (0, -0.088, -0.16), (0, -0.152, -0.135)], hc, mirror=True, col=C['helmet'], bone='head', bevel=0.006, **hard)
    for sx in (-1, 1):
        m.cyl(0.046, 0.03, 'x', (sx * 0.137, hc[1] - 0.012, 0.012), col=C['ear'], bone='head', seg=12, mat='hard'); m.cyl(0.028, 0.042, 'x', (sx * 0.137, hc[1] - 0.012, 0.012), col=0x242226, bone='head', seg=12, mat='hard')
    # ---- arms
    for s, sx in (('L', -1), ('R', 1)):
        cx = sx * SX; sh, el = 'sh' + s, 'el' + s
        m.rings_y([(1.49, 0.05, 0.05, cx), (1.46, 0.078, 0.08, cx), (1.4, 0.08, 0.083, cx), (1.3, 0.075, 0.078, cx), (1.2, 0.066, 0.068, cx), (1.16, 0.064, 0.066, cx), (1.12, 0.064, 0.066, cx), (1.03, 0.06, 0.062, cx), (0.93, 0.05, 0.052, cx), (0.905, 0.046, 0.048, cx)],
                  seg=12, col=C['suit'], w=blend(el, sh, 1, EL_Y, 0.09), **soft)
        P = lambda dx, dy, dz: (cx + sx * dx, SH_Y + dy, dz)
        pts = []
        for dz in (-1, 1): pts += [P(-0.05, 0.058, dz * 0.07), P(0.04, 0.068, dz * 0.088), P(0.118, 0.03, dz * 0.082), P(0.122, -0.075, dz * 0.066), P(0.02, -0.08, dz * 0.098), P(-0.045, 0.0, dz * 0.102)]
        m.hull(pts, col=C['armor'], bone=sh, bevel=0.01, **hard)
        m.rings_y([(1.335, 0.084, 0.087, cx), (1.285, 0.082, 0.085, cx)], seg=12, col=C['band'], bone=sh, mat='hard', smooth=True, bevel=0.003)
        m.rings_y([(1.118, 0.06, 0.06, cx), (1.1, 0.08, 0.08, cx), (0.972, 0.07, 0.07, cx), (0.955, 0.054, 0.054, cx)], seg=8, col=C['armor'], bone=el, **hard)
        m.box(0.03, 0.1, 0.07, (cx + sx * 0.068, 1.04, 0), col=C['armorD'], bone=el, bevel=0.008, **hard)
        m.rings_y([(0.935, 0.056, 0.058, cx), (0.895, 0.05, 0.052, cx)], seg=12, col=C['glove'], bone=el, **soft)
        m.box(0.05, 0.1, 0.086, (cx, 0.848, -0.004), col=C['glove'], bone=el, bevel=0.018, mat='soft')
        m.box(0.046, 0.055, 0.08, (cx, 0.79, -0.014), (0.25, 0, 0), col=C['glove'], bone=el, bevel=0.016, mat='soft')
        m.box(0.026, 0.05, 0.03, (cx, 0.845, -0.056), (0.3, 0, 0), col=C['glove'], bone=el, bevel=0.01, mat='soft')
        m.box(0.012, 0.06, 0.07, (cx + sx * 0.03, 0.85, -0.004), col=0x2c2a30, bone=el, bevel=0.004, **hard)
    # ---- legs
    for s, sx in (('L', -1), ('R', 1)):
        cx = sx * HX; hp, kn = 'hp' + s, 'kn' + s
        m.rings_y([(y, a * 1.1, b * 1.1, cx) for y, a, b in ((0.95, 0.1, 0.105), (0.9, 0.108, 0.112), (0.8, 0.104, 0.108), (0.66, 0.092, 0.096), (0.55, 0.082, 0.088), (0.48, 0.078, 0.086), (0.42, 0.08, 0.088), (0.33, 0.078, 0.084), (0.2, 0.064, 0.068), (0.16, 0.06, 0.064))],
                  seg=12, col=C['suit'], w=blend(kn, hp, 1, KN_Y, 0.1), **soft)
        if not oly: m.rings_y([(0.725, 0.114, 0.118, cx), (0.675, 0.109, 0.113, cx)], seg=12, col=C['band'], bone=hp, mat='hard', smooth=True, bevel=0.003)
        if sx > 0:
            m.box(0.05, 0.17, 0.09, (cx + 0.118, 0.74, 0.0), col=C['holster'], bone=hp, bevel=0.012, **hard); m.box(0.03, 0.075, 0.046, (cx + 0.12, 0.846, 0.022), (-0.3, 0, 0), col=0x1f1d22, bone=hp, bevel=0.008, **hard)
            m.rings_y([(0.705, 0.118, 0.122, cx), (0.68, 0.117, 0.121, cx)], seg=12, col=C['holster'], bone=hp, mat='hard', smooth=True, bevel=0)
        K = lambda dx, y, z: (cx + dx, y, z - 0.008)
        m.hull([K(0.052, 0.53, -0.086), K(-0.052, 0.53, -0.086), K(0.062, 0.48, -0.1), K(-0.062, 0.48, -0.1), K(0.046, 0.42, -0.09), K(-0.046, 0.42, -0.09), K(0, 0.548, -0.094), K(0, 0.404, -0.094), K(0, 0.48, -0.116),
                K(0.055, 0.525, -0.05), K(-0.055, 0.525, -0.05), K(0.05, 0.425, -0.05), K(-0.05, 0.425, -0.05)], col=C['armor'], bone=kn, bevel=0.006, **hard)
        m.hull([K(0.054, 0.4, -0.086), K(-0.054, 0.4, -0.086), K(0.06, 0.3, -0.096), K(-0.06, 0.3, -0.096), K(0.046, 0.2, -0.08), K(-0.046, 0.2, -0.08), K(0, 0.4, -0.1), K(0, 0.3, -0.11), K(0, 0.19, -0.088),
                K(0.074, 0.385, -0.02), K(-0.074, 0.385, -0.02), K(0.066, 0.22, -0.02), K(-0.066, 0.22, -0.02)], col=C['armor'], bone=kn, bevel=0.006, **hard)
        if oly: m.box(0.014, 0.1, 0.05, (cx + sx * 0.071, 0.275, -0.035), col=C['band'], bone=kn, bevel=0.004, **hard)
        m.hull([K(0.05, 0.03, -0.2), K(-0.05, 0.03, -0.2), K(0.046, 0.096, -0.188), K(-0.046, 0.096, -0.188), K(0.068, 0.03, -0.1), K(-0.068, 0.03, -0.1), K(0.062, 0.112, -0.09), K(-0.062, 0.112, -0.09),
                K(0.062, 0.205, -0.055), K(-0.062, 0.205, -0.055), K(0.062, 0.205, 0.078), K(-0.062, 0.205, 0.078), K(0.06, 0.03, 0.094), K(-0.06, 0.03, 0.094), K(0.056, 0.15, 0.098), K(-0.056, 0.15, 0.098)], col=C['boots'], bone=kn, bevel=0.012, **hard)
        m.rings_y([(0.195, 0.072, 0.078, cx, 0.01), (0.24, 0.07, 0.075, cx, 0.01)], seg=10, col=C['bootD'], bone=kn, mat='hard', smooth=True, bevel=0.004)
        m.box(0.14, 0.036, 0.31, (cx, 0.018, -0.052), col=C['sole'], bone=kn, bevel=0.008, **hard)
    return m

GL, GLD = 0x3b393f, 0x2c2a30
def fparm(team):
    C = dict(PAL[team]); m = Model('fparm_' + team)
    for k in ('armor', 'armorD'): C[k] = int(((C[k] >> 16) & 255) * 0.86) << 16 | int(((C[k] >> 8) & 255) * 0.86) << 8 | int((C[k] & 255) * 0.86)  # sits right under the view-model key light
    m.rings_z([(-0.012, 0.047, 0.044), (0.0, 0.052, 0.048), (0.05, 0.053, 0.049)], seg=12, col=GL, mat='soft', smooth=True)
    spec = [(0.03, 0.05, 0.047)]
    for i in range(12): z = 0.07 + i * 0.05; r = 0.056 + min(z, 0.4) * 0.03 + (0.004 if i % 2 else 0); spec.append((z, r, r * 0.94))
    m.rings_z(spec, seg=12, col=C['suit'], mat='soft', smooth=True)
    m.rings_z([(0.072, 0.06, 0.056), (0.09, 0.082, 0.077), (0.215, 0.086, 0.081), (0.232, 0.068, 0.064)], seg=8, col=C['armor'], mat='hard')
    m.box(0.058, 0.02, 0.09, (0, 0.082, 0.152), col=C['armorD'], mat='hard', bevel=0.006)
    m.rings_z([(0.236, 0.081, 0.076), (0.276, 0.081, 0.076)], seg=8, col=C['band'], mat='hard')
    m.rings_z([(0.47, 0.066, 0.062), (0.49, 0.086, 0.081), (0.6, 0.088, 0.083), (0.62, 0.07, 0.066)], seg=8, col=C['armor'], mat='hard')
    return m

def hand_fore():
    m = Model('hand_fore').defaults(col=GL, mat='soft', smooth=True)
    m.box(0.078, 0.03, 0.098, (-0.006, -0.017, 0.0), bevel=0.012); m.box(0.026, 0.06, 0.094, (-0.043, 0.012, 0.0), (0, 0, 0.15), bevel=0.01)
    for z in (-0.037, -0.0125, 0.0125, 0.037): m.tube([(-0.046, -0.002, z), (-0.051, 0.035, z), (-0.043, 0.074, z), (-0.018, 0.088, z), (0.006, 0.083, z)], [0.0135, 0.0135, 0.013, 0.0125, 0.011], seg=8)
    m.box(0.012, 0.032, 0.094, (-0.06, 0.03, 0.0), col=GLD, mat='hard', smooth=False, bevel=0.004)
    m.tube([(0.02, -0.02, 0.03), (0.042, 0.0, 0.022), (0.045, 0.035, 0.012), (0.036, 0.06, 0.005)], 0.013, seg=8)
    m.tube([(-0.01, -0.022, 0.02), (-0.022, -0.05, 0.07), (-0.03, -0.068, 0.105)], [0.036, 0.042, 0.046], seg=10)
    m.point('wrist', (-0.03, -0.068, 0.105)); return m

def hand_grip():
    m = Model('hand_grip').defaults(col=GL, mat='soft', smooth=True); R = (-0.36, 0, 0)
    m.box(0.06, 0.1, 0.04, (0.008, -0.012, 0.048), R, bevel=0.014); m.box(0.022, 0.095, 0.07, (0.03, -0.012, 0.012), R, bevel=0.01)
    for y in (0.0, -0.026, -0.052): m.tube([(0.03, y, 0.0), (0.026, y, -0.034), (0.0, y, -0.044), (-0.026, y, -0.034), (-0.031, y, -0.004)], 0.013, seg=8, rot=R)
    m.box(0.012, 0.07, 0.03, (-0.036, -0.026, -0.02), R, col=GLD, mat='hard', smooth=False, bevel=0.004)
    m.tube([(0.028, 0.024, 0.01), (0.03, 0.03, -0.03), (0.016, 0.034, -0.055)], 0.0115, seg=8, rot=R)
    m.tube([(-0.012, 0.03, 0.05), (-0.03, 0.036, 0.02), (-0.032, 0.04, -0.015)], 0.013, seg=8, rot=R)
    m.tube([(0.012, -0.01, 0.06), (0.03, -0.035, 0.1), (0.045, -0.055, 0.135)], [0.038, 0.042, 0.046], seg=10)
    m.point('wrist', (0.045, -0.055, 0.135)); return m

def hand_cup():
    m = Model('hand_cup').defaults(col=GL, mat='soft', smooth=True)
    m.box(0.088, 0.036, 0.09, (0, -0.02, 0.0), bevel=0.014)
    for x in (-0.033, -0.011, 0.011, 0.033): m.tube([(x, -0.03, -0.04), (x, 0.0, -0.062), (x, 0.03, -0.05), (x, 0.04, -0.02)], 0.0125, seg=8)
    m.tube([(0.045, -0.02, 0.0), (0.052, 0.01, -0.02), (0.042, 0.035, -0.03)], 0.013, seg=8)
    m.tube([(0, -0.02, 0.03), (0, -0.026, 0.07), (0, -0.03, 0.1)], [0.038, 0.042, 0.046], seg=10)
    m.point('wrist', (0, -0.03, 0.1)); return m
