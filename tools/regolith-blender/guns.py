# REGOLITH guns, modelled per the armory concept board. Local frame: forward -z, up +y, origin near the grip.
import math
from lib import *
D, T, P, K, M = 0x4b4a55, 0xcdb48f, 0x45434b, 0x1d1b20, 0x8a8c90   # receiver, tan furniture, polymer, black, bare metal

class Gun(Model):
    def __init__(self, name):
        super().__init__(name); self.defaults(mat='gun', bevel=0.004, col=D)
    def rb(self, col, w, h, d, x, y, z, rx=0, ry=0, rz=0, r=0.006, **k):
        k.setdefault('mat', 'gun' if col == D else 'poly'); return self.box(w, h, d, (x, y, z), (rx, ry, rz), col=col, bevel=r, **k)
    def cz(self, col, r, length, x, y, z, r_front=None, seg=14, **k):
        k.setdefault('mat', 'metal' if col == M else 'gun'); return self.cyl(r_front if r_front is not None else r, length, 'z', (x, y, z), r2=r, seg=seg, col=col, **dict(dict(bevel=0), **k))
    def cx(self, col, r, length, x, y, z, seg=12, **k):
        k.setdefault('mat', 'metal' if col == M else 'gun'); return self.cyl(r, length, 'x', (x, y, z), seg=seg, col=col, **dict(dict(bevel=0), **k))
    def cy(self, col, r, length, x, y, z, seg=12, **k):
        k.setdefault('mat', 'metal' if col == M else 'gun'); return self.cyl(r, length, 'y', (x, y, z), seg=seg, col=col, **dict(dict(bevel=0), **k))
    def rail(self, y, z0, z1, w=0.036):
        self.rb(D, w, 0.01, z1 - z0, 0, y, (z0 + z1) / 2, r=0)
        z = z0 + 0.008
        while z < z1 - 0.004: self.rb(D, w + 0.006, 0.007, 0.007, 0, y + 0.007, z, r=0.0015); z += 0.016
    def handguard(self, col, w, h, length, y, zc, vents, vent=(0.015, 0.04), rows=None, r=0.012):
        """hollow shell with real vents cut through both sides (barrel visible inside)"""
        hg = self.rb(col, w, h, length, 0, y, zc, r=r)
        cuts = [self.cutter_box(w - 0.018, h - 0.02, length + 0.02, (0, y, zc))]
        rows = rows or [y + h * 0.2, y - h * 0.2]
        for i in range(vents):
            z = zc + length / 2 - 0.045 - i * (length - 0.09) / max(1, vents - 1)
            for yy in rows: cuts.append(self.cutter_box(w * 2, vent[0], vent[1], (0, yy, z)))
        self.cut(hg, *cuts); return hg
    def muzzle_brake(self, r, length, y, z):
        mb = self.cz(D, r, length, 0, y, z, seg=10, bevel=0.002)
        self.cut(mb, self.cutter_box(r * 3, r * 0.5, length * 0.22, (0, y, z - length * 0.2)), self.cutter_box(r * 3, r * 0.5, length * 0.22, (0, y, z + length * 0.2)), self.cutter_cyl(r * 0.45, length * 2, 'z', (0, y, z)))
    def grip(self, x, y, z, w=0.04, h=0.11, d=0.054, rx=-0.36):
        self.rb(P, w, h, d, x, y, z, rx, r=0.012)
        for i in range(3): self.rb(P, w + 0.003, 0.013, 0.012, x, y + 0.005 - i * 0.026 * math.cos(rx), z - 0.027 * math.cos(rx) + (0.005 - i * 0.026) * math.sin(-rx) * -1 + 0.0, rx, r=0.004)
    def trigger(self, y, z, length=0.075):
        self.rb(P, 0.014, 0.012, length, 0, y, z, r=0.004); self.rb(P, 0.014, 0.035, 0.012, 0, y + 0.014, z - length / 2 + 0.002, r=0.004); self.rb(M, 0.007, 0.024, 0.007, 0, y + 0.014, z - 0.004, r=0.002, mat='metal')
    def reddot(self, y, z, s=1.0):
        self.rb(D, 0.048 * s, 0.02 * s, 0.1 * s, 0, y, z + 0.022 * s)                       # mount
        self.rb(D, 0.052 * s, 0.028 * s, 0.044 * s, 0, y + 0.021 * s, z + 0.062 * s)       # battery box
        frame = self.rb(D, 0.062 * s, 0.078 * s, 0.072 * s, 0, y + 0.047 * s, z, r=0.009)   # hooded window frame
        self.cut(frame, self.cutter_box(0.038 * s, 0.048 * s, 0.2, (0, y + 0.044 * s, z)))
        self.box(0.04 * s, 0.05 * s, 0.003, (0, y + 0.044 * s, z + 0.006), col=0x5e4038, mat='lens', bevel=0)
        self.box(0.005, 0.005, 0.002, (0, y + 0.045 * s, z + 0.003), col=0xff3020, mat='dot', bevel=0)
        for sx in (1, -1): self.cx(D, 0.009 * s, 0.014, sx * 0.036 * s, y + 0.025 * s, z + 0.066 * s, seg=10)
    def stock(self, col, outline, hole, thick=0.044, pad=None):
        self.profile(outline, thick, holes=[hole] if hole else [], col=col, mat='poly', bevel=0.006)
        if pad: self.rb(P, pad[0], pad[1], 0.026, 0, pad[2], pad[3], r=0.008)

def rifle():
    g = Gun('rifle')
    g.rb(D, 0.058, 0.08, 0.3, 0, 0.07, -0.05, r=0.008); g.rb(D, 0.054, 0.07, 0.2, 0, 0.012, -0.02, r=0.008); g.rb(D, 0.05, 0.06, 0.085, 0, -0.024, -0.08, r=0.01)
    g.rail(0.112, -0.2, 0.1)
    g.rb(K, 0.004, 0.026, 0.075, -0.029, 0.078, -0.035, r=0.002); g.rb(D, 0.007, 0.018, 0.056, -0.031, 0.078, -0.035, r=0.003)     # ejection port + cover
    g.rb(D, 0.066, 0.022, 0.026, 0, 0.098, 0.112, r=0.006)                                                                         # charging handle
    g.cz(D, 0.014, 0.036, -0.034, 0.084, 0.07); g.cz(D, 0.018, 0.01, -0.034, 0.084, 0.092)                                          # forward assist
    for z in (-0.06, 0.045):
        g.cx(D, 0.008, 0.064, 0, 0.03, z, seg=10)
        for sx in (1, -1): g.rb(D, 0.006, 0.04, 0.011, sx * 0.03, 0.03, z, r=0.002); g.rb(D, 0.006, 0.011, 0.04, sx * 0.03, 0.03, z, r=0.002)
    g.rb(D, 0.008, 0.028, 0.028, -0.029, -0.002, -0.046, r=0.004); g.rb(D, 0.008, 0.04, 0.016, -0.029, 0.022, -0.012, r=0.003)
    g.rb(D, 0.006, 0.034, 0.09, -0.031, 0.06, -0.12, r=0.003)
    g.grip(0, -0.045, 0.06); g.trigger(-0.03, 0.0)
    for y, z, r in ((-0.075, -0.082, 0.04), (-0.145, -0.096, 0.2)):
        g.rb(P, 0.036, 0.085, 0.072, 0, y, z, r, r=0.01)
        for dz in (-0.016, 0.016): g.rb(P, 0.04, 0.07, 0.009, 0, y, z + dz, r, r=0.003)
    g.rb(P, 0.042, 0.018, 0.08, 0, -0.19, -0.106, 0.2, r=0.006)
    g.cz(D, 0.017, 0.1, 0, 0.07, 0.15)
    g.stock(T, [(0.16, 0.112), (0.33, 0.112), (0.335, -0.03), (0.3, -0.03), (0.17, 0.035)], [(0.205, 0.092), (0.3, 0.092), (0.3, 0.0)], pad=(0.048, 0.15, 0.042, 0.345))
    g.handguard(T, 0.064, 0.078, 0.3, 0.073, -0.355, 4); g.rail(0.114, -0.5, -0.205)
    g.rb(D, 0.068, 0.084, 0.016, 0, 0.073, -0.198, r=0.005)
    g.cz(D, 0.012, 0.36, 0, 0.078, -0.5); g.rb(D, 0.032, 0.032, 0.026, 0, 0.096, -0.515, r=0.005)
    g.hull([(0, 0.112, -0.527), (0, 0.112, -0.503), (0.009, 0.112, -0.515), (-0.009, 0.112, -0.515), (0, 0.16, -0.515), (0.003, 0.16, -0.512), (-0.003, 0.16, -0.512)], col=D, bevel=0)
    g.muzzle_brake(0.021, 0.066, 0.078, -0.692)
    g.reddot(0.129, -0.062)
    g.rb(D, 0.05, 0.02, 0.036, 0, 0.126, 0.074, r=0.006); g.rb(D, 0.03, 0.008, 0.026, 0, 0.139, 0.08, r=0.003)                     # folded flip-up rear sight (clear of the red-dot line)
    g.point('muzzle', (0, 0.078, -0.725)); g.point('grip', (0, -0.04, 0.06)); g.point('fore', (0, 0.034, -0.3)); g.points['scale'] = 0.86
    return g


def smg():
    g = Gun('smg')
    g.rb(D, 0.052, 0.08, 0.27, 0, 0.058, -0.06, r=0.008); g.rb(D, 0.046, 0.04, 0.12, 0, 0.012, -0.03, r=0.008); g.rail(0.1, -0.2, 0.06)
    g.rb(K, 0.004, 0.02, 0.06, -0.027, 0.07, -0.05, r=0.002); g.cx(D, 0.008, 0.06, 0, 0.03, 0.03, seg=10); g.rb(D, 0.007, 0.03, 0.07, -0.028, 0.045, -0.13, r=0.003)
    g.grip(0, -0.03, 0.05, w=0.036, h=0.1, d=0.046, rx=-0.3); g.trigger(-0.012, 0.0, 0.062)
    g.rb(P, 0.034, 0.2, 0.05, 0, -0.085, -0.09, 0.08, r=0.008); g.rb(P, 0.04, 0.018, 0.058, 0, -0.19, -0.098, 0.08, r=0.005); g.rb(D, 0.042, 0.04, 0.062, 0, 0.0, -0.088, r=0.008)
    g.stock(D, [(0.07, 0.092), (0.272, 0.092), (0.282, -0.004), (0.248, -0.004), (0.08, 0.03)], [(0.115, 0.072), (0.24, 0.072), (0.24, 0.016), (0.125, 0.044)], thick=0.036, pad=(0.044, 0.108, 0.044, 0.29))
    g.handguard(D, 0.054, 0.064, 0.14, 0.055, -0.26, 3, vent=(0.012, 0.022), rows=[0.055]); g.rail(0.094, -0.33, -0.2, 0.03)
    g.cz(D, 0.011, 0.2, 0, 0.058, -0.3); g.muzzle_brake(0.019, 0.07, 0.058, -0.425)
    g.reddot(0.112, -0.05, 0.8)
    g.point('muzzle', (0, 0.058, -0.46)); g.point('grip', (0, -0.03, 0.05)); g.point('fore', (0, 0.022, -0.25)); g.points['scale'] = 0.9
    return g

def shotgun():
    g = Gun('shotgun')
    g.rb(D, 0.052, 0.08, 0.26, 0, 0.04, -0.04, r=0.01); g.rb(K, 0.004, 0.022, 0.09, -0.027, 0.05, -0.06, r=0.002); g.rail(0.085, -0.15, 0.06, 0.03)
    g.grip(0, -0.03, 0.1, w=0.042, h=0.1, d=0.06, rx=-0.4); g.trigger(-0.016, 0.02, 0.07)
    g.stock(T, [(0.09, 0.075), (0.335, 0.085), (0.342, -0.045), (0.31, -0.045), (0.13, 0.0)], [(0.17, 0.056), (0.3, 0.064), (0.3, 0.0), (0.2, 0.024)], thick=0.046, pad=(0.05, 0.14, 0.02, 0.352))
    g.cz(D, 0.015, 0.56, 0, 0.062, -0.44); g.cz(D, 0.014, 0.46, 0, 0.034, -0.39); g.cz(D, 0.017, 0.02, 0, 0.034, -0.62)
    pump = g.rb(T, 0.06, 0.056, 0.26, 0, 0.036, -0.36, r=0.014)
    g.cut(pump, *[g.cutter_box(0.2, 0.006, 0.01, (0, yy, -0.25 - i * 0.022)) for i in range(11) for yy in (0.066, 0.006)], *[g.cutter_box(0.006, 0.03, 0.01, (sx * 0.031, 0.036, -0.25 - i * 0.022)) for i in range(11) for sx in (1, -1)])
    g.rb(D, 0.03, 0.05, 0.02, 0, 0.05, -0.665, r=0.004); g.rb(D, 0.006, 0.022, 0.008, 0, 0.088, -0.7, r=0.002)
    g.point('muzzle', (0, 0.062, -0.73)); g.point('grip', (0, -0.03, 0.085)); g.point('fore', (0, 0.008, -0.36)); g.points['scale'] = 0.88
    return g

def sniper():
    g = Gun('sniper')
    g.handguard(T, 0.052, 0.062, 0.44, 0.04, -0.13, 4, vent=(0.012, 0.034), rows=[0.046])
    g.cz(D, 0.023, 0.22, 0, 0.088, -0.02); g.cx(M, 0.006, 0.05, 0.04, 0.082, 0.05); g.sphere(0.013, (0.068, 0.078, 0.05), col=M, mat='metal', smooth=True, sub=2)
    g.grip(0, -0.035, 0.1, w=0.038, h=0.1, d=0.048, rx=-0.3); g.trigger(-0.012, 0.045, 0.06)
    g.stock(T, [(0.08, 0.088), (0.41, 0.088), (0.415, -0.045), (0.385, -0.045), (0.1, 0.008)], [(0.14, 0.064), (0.385, 0.064), (0.385, -0.02), (0.16, 0.024)], thick=0.042, pad=(0.046, 0.15, 0.022, 0.425))
    g.rb(P, 0.044, 0.03, 0.12, 0, 0.1, 0.27, r=0.01)                                           # cheek rest
    g.rb(P, 0.04, 0.085, 0.085, 0, -0.022, -0.06, r=0.008)                                     # magazine
    g.cz(D, 0.013, 0.62, 0, 0.076, -0.62); g.muzzle_brake(0.022, 0.09, 0.076, -0.955)
    g.cz(D, 0.019, 0.26, 0, 0.165, -0.04); g.cz(D, 0.03, 0.08, 0, 0.165, -0.21, r_front=0.032); g.cz(D, 0.028, 0.06, 0, 0.165, 0.12); g.cy(D, 0.013, 0.03, 0, 0.19, -0.04); g.cx(D, 0.012, 0.03, 0.026, 0.165, -0.04)
    g.cyl(0.027, 0.004, 'z', (0, 0.165, -0.248), seg=14, col=0x5e4038, mat='lens', bevel=0)
    for z in (-0.1, 0.03): g.rb(D, 0.03, 0.05, 0.022, 0, 0.128, z, r=0.004); g.cz(D, 0.024, 0.022, 0, 0.165, z)
    g.rail(0.108, -0.14, 0.07, 0.03)
    g.point('muzzle', (0, 0.076, -1.0)); g.point('grip', (0, -0.04, 0.095)); g.point('fore', (0, 0.009, -0.24)); g.points['scale'] = 0.84
    return g

def lmg():
    g = Gun('lmg')
    g.rb(D, 0.068, 0.1, 0.34, 0, 0.05, -0.05, r=0.01); g.rb(D, 0.062, 0.03, 0.22, 0, 0.112, -0.05, r=0.008); [g.rb(D, 0.008, 0.042, 0.02, sx * 0.013, 0.121, 0.09, r=0.003) for sx in (1, -1)]  # rear sight notch
    g.rb(K, 0.004, 0.03, 0.1, -0.035, 0.06, -0.06, r=0.002); g.rb(D, 0.008, 0.02, 0.07, -0.036, 0.085, 0.05, r=0.003); g.cx(D, 0.009, 0.08, 0, 0.02, 0.06, seg=10)
    for z in (-0.21, -0.31): g.rb(D, 0.018, 0.07, 0.022, -0.036, 0.13, z, r=0.005)
    g.rb(D, 0.024, 0.02, 0.14, -0.036, 0.17, -0.26, r=0.007)                                   # carry handle (offset so the sight line is clear)
    g.stock(T, [(0.11, 0.098), (0.31, 0.098), (0.316, -0.045), (0.282, -0.045), (0.13, 0.025)], [(0.165, 0.078), (0.282, 0.078), (0.282, -0.012)], thick=0.048, pad=(0.052, 0.15, 0.026, 0.326))
    g.grip(0, -0.04, 0.085, w=0.038, h=0.1, d=0.05, rx=-0.3); g.trigger(-0.022, 0.03, 0.062)
    g.rb(T, 0.1, 0.15, 0.14, 0, -0.082, -0.08, r=0.016, mat='poly'); g.rb(D, 0.104, 0.01, 0.144, 0, -0.012, -0.08, r=0.003); g.rb(D, 0.036, 0.03, 0.01, 0, -0.06, -0.152, r=0.003)
    for sx in (1, -1): g.rb(T, 0.006, 0.09, 0.09, sx * 0.05, -0.085, -0.08, r=0.003, mat='poly')
    g.handguard(T, 0.066, 0.07, 0.28, 0.056, -0.36, 5, vent=(0.014, 0.03), rows=[0.06]); g.rail(0.094, -0.48, -0.24)
    g.cz(D, 0.017, 0.5, 0, 0.06, -0.55); g.muzzle_brake(0.022, 0.07, 0.06, -0.8); g.cz(D, 0.008, 0.26, 0, 0.03, -0.6); g.rb(D, 0.03, 0.05, 0.02, 0, 0.045, -0.72, r=0.004)
    g.hull([(0, 0.07, -0.73), (0, 0.07, -0.71), (0.008, 0.07, -0.72), (-0.008, 0.07, -0.72), (0, 0.128, -0.72), (0.002, 0.128, -0.72)], col=D, bevel=0)  # front post up to the sight line
    g.point('muzzle', (0, 0.06, -0.84)); g.point('grip', (0, -0.04, 0.085)); g.point('fore', (0, 0.021, -0.34)); g.points['scale'] = 0.84
    return g

def handgun(name, frame):
    g = Gun(name); fm = 'gun' if frame == D else 'poly'
    g.rb(frame, 0.031, 0.04, 0.17, 0, -0.004, -0.06, r=0.006, mat=fm); g.rb(frame, 0.034, 0.09, 0.054, 0, -0.054, 0.0, -0.2, r=0.01, mat=fm); g.rb(P, 0.038, 0.058, 0.036, 0, -0.056, 0.006, -0.2, r=0.006)
    tg = g.rb(frame, 0.012, 0.04, 0.062, 0, -0.03, -0.05, r=0.004, mat=fm); g.cut(tg, g.cutter_box(0.1, 0.024, 0.044, (0, -0.028, -0.05)))
    g.rb(M, 0.005, 0.018, 0.006, 0, -0.024, -0.04, r=0.002, mat='metal')
    sl = g.rb(D, 0.031, 0.038, 0.195, 0, 0.033, -0.066, r=0.006)
    g.cut(sl, *[g.cutter_box(0.1, 0.03, 0.0035, (0, 0.033, 0.005 + i * 0.007)) for i in range(5)])
    g.rb(D, 0.006, 0.008, 0.008, 0, 0.055, -0.152, r=0.002); g.rb(D, 0.018, 0.008, 0.008, 0, 0.055, 0.02, r=0.002); g.cz(M, 0.007, 0.012, 0, 0.033, -0.164, seg=10); g.rb(frame, 0.026, 0.012, 0.05, 0, -0.016, -0.12, r=0.003, mat=fm)
    g.point('muzzle', (0, 0.032, -0.17)); g.point('grip', (0, -0.06, 0.005)); g.point('fore', (0, -0.07, -0.01)); g.points['scale'] = 1.12 if name == 'magnum' else 1.0
    return g
def pistol(): return handgun('pistol', T)
def magnum(): return handgun('magnum', D)

GUNS = [rifle, smg, shotgun, sniper, lmg, pistol, magnum]
