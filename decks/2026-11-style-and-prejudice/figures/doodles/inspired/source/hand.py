"""A small hand-drawn toolkit: wobbly pen strokes, marker, washes, a single-stroke capital font.
Everything returns SVG strings. One global rng per drawing (call seed()).
"""
import math
import os
import numpy as np

R = np.random.default_rng(1)
BOOST = float(os.environ.get("PEN_BOOST", "1"))  # >1 thickens the thin ink lines (for small sizes on slides)


def seed(n):
    global R
    R = np.random.default_rng(n)


# ---------- geometry -------------------------------------------------------

def cr(points, per=8, closed=False):
    """Catmull-Rom through the points."""
    P = np.array(points, float)
    if closed:
        P = np.vstack([P[-1], P, P[0], P[1]])
    else:
        P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, per, endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(out[0] if closed else P[-2])
    return np.array(out)


def resample(P, step):
    P = np.asarray(P, float)
    d = np.hypot(*np.diff(P, axis=0).T)
    s = np.concatenate([[0], np.cumsum(d)])
    if s[-1] < 1e-6:
        return P[:1], np.array([0.0])
    n = max(2, int(s[-1] / step) + 1)
    u = np.linspace(0, s[-1], n)
    return np.column_stack([np.interp(u, s, P[:, 0]), np.interp(u, s, P[:, 1])]), u


def snoise(s, wl, k=3):
    out = np.zeros_like(s)
    for i in range(k):
        f = (1 + 0.7 * i) / wl * (0.8 + 0.4 * R.random())
        out += np.sin(2 * np.pi * f * s + R.random() * 6.28) / (1 + 0.6 * i)
    return out / 1.8


def jitter(P, s, amp, wl):
    if amp <= 0 or len(P) < 3:
        return P
    T = np.gradient(P, axis=0)
    L = np.hypot(T[:, 0], T[:, 1]) + 1e-9
    N = np.column_stack([-T[:, 1] / L, T[:, 0] / L])
    d = amp * snoise(s, wl)
    return P + N * d[:, None]


def f(x):
    return f"{x:.1f}"


def pathd(P, close=False):
    d = "M" + " L".join(f"{f(x)},{f(y)}" for x, y in P)
    return d + ("Z" if close else "")


# ---------- strokes --------------------------------------------------------

def stroke(pts, w=3.0, color="#222", smooth=False, wob=0.8, taper=0.55, press=0.25,
           step=3.0, closed=False, wl=70, chunk=4, op=None):
    if w < 8:
        w = w * BOOST
    P = cr(pts, closed=closed) if smooth else np.array(pts, float)
    P, s = resample(P, step)
    if len(P) < 2:
        return ""
    P = jitter(P, s, wob, wl)
    t = s / max(s[-1], 1e-6)
    wid = w * (1 + press * snoise(s, 55))
    if taper and not closed:
        edge = np.exp(-t * s[-1] / 18.0) + np.exp(-(1 - t) * s[-1] / 18.0)
        wid = wid * (1 - (1 - taper) * np.clip(edge, 0, 1))
    wid = np.clip(wid, 0.4 * w, 1.6 * w)
    parts = []
    n = len(P)
    i = 0
    while i < n - 1:
        j = min(i + chunk, n - 1)
        parts.append(f'<path d="{pathd(P[i:j + 1])}" stroke-width="{wid[(i + j) // 2]:.2f}"/>')
        i = j
    o = f' opacity="{op}"' if op else ""
    return (f'<g fill="none" stroke="{color}" stroke-linecap="round" stroke-linejoin="round"{o}>'
            + "".join(parts) + "</g>")


def dot(x, y, r, color="#222", wob=0.4):
    a = R.random() * 6.28
    dx, dy = math.cos(a) * r * 0.15, math.sin(a) * r * 0.15
    return stroke([(x - dx, y - dy), (x + dx, y + dy)], w=2 * r, color=color, wob=0, taper=0)


def ring(cx, cy, rx, ry=None, w=3, color="#222", rot=0, turns=1.1, a0=None, drift=0.06, **kw):
    ry = ry or rx
    a0 = R.random() * 6.28 if a0 is None else a0
    n = 40
    th = np.linspace(a0, a0 + 2 * math.pi * turns, n)
    t = np.linspace(0, 1, n)
    rr = 1 + drift * (t - 0.5) * (1 if R.random() < .5 else -1)
    x = rx * rr * np.cos(th)
    y = ry * rr * np.sin(th)
    c, s_ = math.cos(rot), math.sin(rot)
    pts = np.column_stack([cx + x * c - y * s_, cy + x * s_ + y * c])
    return stroke(pts, w=w, color=color, smooth=True, taper=0.7, **kw)


def line(a, b, w=3, color="#222", over=0, **kw):
    a = np.array(a, float)
    b = np.array(b, float)
    v = b - a
    L = np.hypot(*v) + 1e-9
    u = v / L
    a2 = a - u * over * R.random()
    b2 = b + u * over * R.random()
    mid = (a2 + b2) / 2 + np.array([-u[1], u[0]]) * R.normal(0, 0.8)
    return stroke([a2, mid, b2], w=w, color=color, smooth=True, **kw)


def rough_rect(x0, y0, x1, y1, w=3, color="#222", over=5, **kw):
    j = lambda: R.normal(0, 1.6)
    c = [(x0 + j(), y0 + j()), (x1 + j(), y0 + j()), (x1 + j(), y1 + j()), (x0 + j(), y1 + j())]
    out = ""
    for i in range(4):
        out += line(c[i], c[(i + 1) % 4], w=w, color=color, over=over, **kw)
    return out


def round_rect_pts(x0, y0, x1, y1, r, n=7):
    pts = []
    for (cx, cy, a0) in [(x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)]:
        for a in np.linspace(a0, a0 + 90, n):
            pts.append((cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))))
    return pts


def round_rect(x0, y0, x1, y1, r=24, w=3, color="#222", **kw):
    pts = round_rect_pts(x0, y0, x1, y1, r)
    # open at top-left, overshoot a little
    pts = pts[-4:] + pts[:-4]
    pts = pts + pts[:3]
    return stroke(pts, w=w, color=color, smooth=True, wob=1.0, taper=0.6, **kw)


def zigzag(x, y0, y1, amp, n, w=3, color="#222", **kw):
    ys = np.linspace(y0, y1, n)
    pts = [(x + (amp if i % 2 else -amp) * (0.85 + 0.3 * R.random()), y) for i, y in enumerate(ys)]
    return stroke(pts, w=w, color=color, wob=0.5, taper=0.6, **kw)


def curls(cx, cy, Rx, Ry, th0, th1, r, k, w, color, n=300, **kw):
    th = np.linspace(math.radians(th0), math.radians(th1), n)
    ph = th * k
    x = cx + Rx * np.cos(th) + r * np.cos(ph)
    y = cy - Ry * np.sin(th) + r * np.sin(ph)
    return stroke(np.column_stack([x, y]), w=w, color=color, smooth=False, wob=0.6, taper=0.4, step=2.5, **kw)


# ---------- washes ---------------------------------------------------------

def blob_d(poly, grow=6, dx=0, dy=0, jit=3, seg=24):
    P = np.array(poly, float)
    P = np.vstack([P, P[:1]])
    Q, s = resample(P, seg)
    Q = Q[:-1] if len(Q) > 3 else Q
    c = Q.mean(axis=0)
    v = Q - c
    L = np.hypot(v[:, 0], v[:, 1])[:, None] + 1e-9
    Q = Q + v / L * (grow + R.normal(0, jit, (len(Q), 1)))
    Q = Q + np.array([dx, dy])
    C = cr(Q, per=6, closed=True)
    return pathd(C, close=True)


def blob(poly, color, grow=6, dx=0, dy=0, jit=3, seg=24, op=1):
    o = f' opacity="{op}"' if op != 1 else ""
    return f'<path d="{blob_d(poly, grow, dx, dy, jit, seg)}" fill="{color}"{o}/>'


def rect_poly(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def circ_poly(cx, cy, r, n=14):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def marker(pts, w, color, smooth=True, op=None, **kw):
    return stroke(pts, w=w, color=color, smooth=smooth, wob=1.4, taper=0.85, press=0.12, op=op, **kw)


# ---------- lettering: a single-stroke capital font -------------------------
# ('p', polyline) or ('s', smooth curve); coordinates: x to the right, y down, cap height 1
G = {
    'A': (0.64, [('p', [(0, 1), (0.32, 0), (0.64, 1)]), ('p', [(0.13, 0.68), (0.51, 0.68)])]),
    'B': (0.58, [('p', [(0, 0), (0, 1)]),
                 ('s', [(0, 0.02), (0.3, 0), (0.5, 0.12), (0.5, 0.3), (0.32, 0.48), (0, 0.5)]),
                 ('s', [(0, 0.5), (0.36, 0.5), (0.58, 0.64), (0.58, 0.84), (0.38, 1), (0, 0.98)])]),
    'C': (0.6, [('s', [(0.58, 0.15), (0.4, 0.02), (0.2, 0.05), (0.05, 0.25), (0.02, 0.5), (0.06, 0.78),
                       (0.22, 0.97), (0.42, 0.99), (0.58, 0.86)])]),
    'D': (0.62, [('p', [(0, 0), (0, 1)]),
                 ('s', [(0, 0.02), (0.3, 0.02), (0.55, 0.2), (0.62, 0.5), (0.52, 0.8), (0.3, 0.98), (0, 0.98)])]),
    'E': (0.52, [('p', [(0.52, 0), (0, 0), (0, 1), (0.52, 1)]), ('p', [(0, 0.5), (0.4, 0.5)])]),
    'F': (0.5, [('p', [(0.5, 0), (0, 0), (0, 1)]), ('p', [(0, 0.5), (0.4, 0.5)])]),
    'G': (0.6, [('s', [(0.58, 0.18), (0.4, 0.02), (0.2, 0.05), (0.05, 0.25), (0.02, 0.5), (0.06, 0.78),
                       (0.22, 0.97), (0.42, 0.99), (0.58, 0.85), (0.58, 0.55)]),
                ('p', [(0.58, 0.55), (0.32, 0.55)])]),
    'H': (0.58, [('p', [(0, 0), (0, 1)]), ('p', [(0.58, 0), (0.58, 1)]), ('p', [(0, 0.5), (0.58, 0.5)])]),
    'I': (0.22, [('p', [(0.11, 0), (0.11, 1)]), ('p', [(0, 0), (0.22, 0)]), ('p', [(0, 1), (0.22, 1)])]),
    'J': (0.42, [('s', [(0.4, 0), (0.4, 0.72), (0.3, 0.95), (0.12, 1), (0, 0.86)])]),
    'K': (0.58, [('p', [(0, 0), (0, 1)]), ('p', [(0.55, 0), (0, 0.6)]), ('p', [(0.2, 0.46), (0.58, 1)])]),
    'L': (0.5, [('p', [(0, 0), (0, 1), (0.5, 1)])]),
    'M': (0.72, [('p', [(0, 1), (0, 0), (0.36, 0.7), (0.72, 0), (0.72, 1)])]),
    'N': (0.6, [('p', [(0, 1), (0, 0), (0.6, 1), (0.6, 0)])]),
    'O': (0.62, [('s', [(0.31, 0), (0.54, 0.1), (0.62, 0.5), (0.54, 0.9), (0.31, 1), (0.08, 0.9), (0, 0.5),
                        (0.08, 0.1), (0.31, 0.0), (0.4, 0.02)])]),
    'P': (0.54, [('p', [(0, 0), (0, 1)]),
                 ('s', [(0, 0.02), (0.32, 0), (0.52, 0.14), (0.52, 0.33), (0.32, 0.5), (0, 0.5)])]),
    'Q': (0.62, [('s', [(0.31, 0), (0.54, 0.1), (0.62, 0.5), (0.54, 0.9), (0.31, 1), (0.08, 0.9), (0, 0.5),
                        (0.08, 0.1), (0.31, 0.0), (0.4, 0.02)]), ('p', [(0.38, 0.75), (0.64, 1.1)])]),
    'R': (0.58, [('p', [(0, 0), (0, 1)]),
                 ('s', [(0, 0.02), (0.32, 0), (0.52, 0.14), (0.52, 0.33), (0.32, 0.5), (0, 0.5)]),
                 ('p', [(0.28, 0.5), (0.58, 1)])]),
    'S': (0.54, [('s', [(0.52, 0.15), (0.38, 0.02), (0.18, 0.03), (0.06, 0.18), (0.14, 0.38), (0.34, 0.5),
                        (0.5, 0.66), (0.48, 0.86), (0.32, 0.98), (0.12, 0.97), (0, 0.84)])]),
    'T': (0.6, [('p', [(0, 0), (0.6, 0)]), ('p', [(0.3, 0), (0.3, 1)])]),
    'U': (0.58, [('s', [(0, 0), (0, 0.68), (0.1, 0.92), (0.29, 1), (0.47, 0.92), (0.58, 0.68), (0.58, 0)])]),
    'V': (0.62, [('p', [(0, 0), (0.31, 1), (0.62, 0)])]),
    'W': (0.84, [('p', [(0, 0), (0.19, 1), (0.42, 0.3), (0.65, 1), (0.84, 0)])]),
    'X': (0.58, [('p', [(0, 0), (0.58, 1)]), ('p', [(0.58, 0), (0, 1)])]),
    'Y': (0.62, [('p', [(0, 0), (0.31, 0.52), (0.62, 0)]), ('p', [(0.31, 0.52), (0.31, 1)])]),
    'Z': (0.56, [('p', [(0, 0), (0.56, 0), (0, 1), (0.56, 1)])]),
    '!': (0.12, [('p', [(0.06, 0), (0.06, 0.68)]), ('dot', (0.06, 0.96))]),
    '?': (0.48, [('s', [(0, 0.2), (0.12, 0.03), (0.32, 0.02), (0.46, 0.15), (0.44, 0.35), (0.28, 0.5),
                        (0.24, 0.65)]), ('dot', (0.24, 0.96))]),
    "'": (0.1, [('p', [(0.06, 0), (0.02, 0.26)])]),
    '.': (0.1, [('dot', (0.05, 0.96))]),
    ',': (0.12, [('p', [(0.08, 0.92), (0.02, 1.12)])]),
    '-': (0.36, [('p', [(0, 0.55), (0.36, 0.55)])]),
    '1': (0.3, [('p', [(0, 0.2), (0.2, 0), (0.2, 1)])]),
    '9': (0.55, [('s', [(0.5, 0.35), (0.35, 0.5), (0.12, 0.45), (0.03, 0.25), (0.15, 0.04), (0.38, 0.03),
                        (0.52, 0.25), (0.5, 0.6), (0.38, 0.92), (0.15, 1)])]),
    '4': (0.56, [('p', [(0.4, 1), (0.4, 0), (0, 0.68), (0.56, 0.68)])]),
}


def text_width(s, h, track=0.26):
    w = 0
    for ch in s:
        if ch == ' ':
            w += 0.42 * h
        else:
            w += (G[ch][0] + track) * h
    return w - track * h


def word_span(line, word, x_center, h, track=0.26):
    """x range of `word` inside a centred `line` drawn by text()."""
    x0 = x_center - text_width(line, h, track) / 2
    pre = line[:line.index(word)]
    off = 0
    for ch in pre:
        off += 0.42 * h if ch == ' ' else (G[ch][0] + track) * h
    return x0 + off, x0 + off + text_width(word, h, track)


def text(s, x, y, h, color="#222", w=3.2, track=0.26, slant=0.1, align="left", wob=0.7, rot_all=0, **kw):
    """x,y = left baseline-top corner (y is the cap top). align 'center' centres on x.
    rot_all rotates the whole string (radians) about its centre."""
    tw = text_width(s, h, track)
    if align == "center":
        x = x - tw / 2
    ccx, ccy = x + tw / 2, y + h / 2
    ca, sa = math.cos(rot_all), math.sin(rot_all)

    def turn(X, Y):
        if not rot_all:
            return X, Y
        return ccx + (X - ccx) * ca - (Y - ccy) * sa, ccy + (X - ccx) * sa + (Y - ccy) * ca

    out = []
    cx = x
    for ch in s:
        if ch == ' ':
            cx += 0.42 * h
            continue
        gw, strokes = G[ch]
        sc = h * (0.94 + 0.12 * R.random())
        rot = math.radians(R.normal(0, 2.2))
        oy = R.normal(0, h * 0.025)
        for kind, data in strokes:
            if kind == 'dot':
                px, py = data
                X = cx + px * sc + slant * (1 - py) * sc
                Y = y + py * sc + oy
                X, Y = turn(X, Y)
                out.append(dot(X, Y, w * 0.6, color))
                continue
            pts = []
            for (px, py) in data:
                qx, qy = px * sc, py * sc
                rx = qx * math.cos(rot) - qy * math.sin(rot)
                ry = qx * math.sin(rot) + qy * math.cos(rot)
                pts.append(turn(cx + rx + slant * (sc - qy) + R.normal(0, h * 0.01), y + ry + oy))
            out.append(stroke(pts, w=w, color=color, smooth=(kind == 's'), wob=wob, taper=0.7,
                              press=0.18, step=2.2, wl=40, **kw))
        cx += (gw + track) * h
    return "".join(out)


# ---------- bubbles ---------------------------------------------------------

def perimeter(x0, y0, x1, y1, step=3.0):
    pts, nrm = [], []
    edges = [((x0, y0), (x1, y0), (0, -1)), ((x1, y0), (x1, y1), (1, 0)),
             ((x1, y1), (x0, y1), (0, 1)), ((x0, y1), (x0, y0), (-1, 0))]
    for a, b, n in edges:
        a, b = np.array(a, float), np.array(b, float)
        L = np.hypot(*(b - a))
        m = int(L / step)
        for i in range(m):
            pts.append(a + (b - a) * i / m)
            nrm.append(n)
    return np.array(pts), np.array(nrm, float)


def bubble(kind, x0, y0, x1, y1, w=2.6, color="#222"):
    P, N = perimeter(x0, y0, x1, y1)
    s = np.arange(len(P)) * 3.0
    ph = R.random() * 6.28
    if kind == "wavy":
        amp = 3.4 + 1.8 * (snoise(s, 160) + 1) / 2
        off = amp * np.sin(2 * np.pi * s / 27 + ph + 2.4 * snoise(s, 220))
    elif kind == "cloud":
        lam = 52
        off = 11 * np.abs(np.sin(np.pi * s / lam + ph / 2)) - 5
    else:  # plain, slightly bulged
        off = 2.5 * snoise(s, 140)
    Q = P + N * off[:, None]
    # start part-way along and overrun slightly
    k = int(len(Q) * R.random() * 0.3)
    Q = np.vstack([Q[k:], Q[:k + 6]])
    return stroke(Q, w=w, color=color, wob=0.7, taper=0.5, step=3.0)
