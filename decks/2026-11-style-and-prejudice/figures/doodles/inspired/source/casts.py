import math
import numpy as np
import hand as H
from hand import stroke, ring, line, dot, blob, marker, text, bubble, round_rect, rough_rect, zigzag, curls, \
    rect_poly, circ_poly, cr

W, HH = 560, 700
DY = 24  # characters sit this much lower than the bubble

TEXT = {
    "human": (["AI CAN'T BE", "CREATIVE!"], "CAN'T"),
    "robot-question": (["CAN AI BE", "CREATIVE?"], None),
    "robot-punch": (["AI CAN'T BE", "CREATIVE!"], "CAN'T"),
}


def defs():
    return """<defs>
<filter id="wash" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
 <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="4" result="lo"/>
 <feDisplacementMap in="SourceGraphic" in2="lo" scale="6" xChannelSelector="R" yChannelSelector="G" result="rough"/>
 <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="9" result="hi"/>
 <feColorMatrix in="hi" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="hiO"/>
 <feColorMatrix in="hiO" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  5.5 0 0 0 -1.9" result="mask"/>
 <feComposite in="rough" in2="mask" operator="in"/>
</filter>
<filter id="crayon" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
 <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="lo"/>
 <feDisplacementMap in="SourceGraphic" in2="lo" scale="5" xChannelSelector="R" yChannelSelector="G" result="rough"/>
 <feTurbulence type="fractalNoise" baseFrequency="0.9 0.12" numOctaves="2" seed="7" result="hi"/>
 <feColorMatrix in="hi" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="hiO"/>
 <feColorMatrix in="hiO" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  6 0 0 0 -2.3" result="mask"/>
 <feComposite in="rough" in2="mask" operator="in"/>
</filter>
<filter id="soft" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
 <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="5" result="lo"/>
 <feDisplacementMap in="SourceGraphic" in2="lo" scale="5" xChannelSelector="R" yChannelSelector="G" result="rough"/>
 <feGaussianBlur in="rough" stdDeviation="0.9" result="bl"/>
 <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="11" result="hi"/>
 <feColorMatrix in="hi" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="hiO"/>
 <feColorMatrix in="hiO" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.6 0 0 0 -0.35" result="mask"/>
 <feComposite in="bl" in2="mask" operator="in"/>
</filter>
</defs>"""


def svg(wash, ink, flt="wash", extra_wash="", split=None, trail=""):
    """split = (len(wash), len(ink)) right after the bubble: everything drawn later is the character and is
    moved down by DY, so the bubble keeps its room. trail (the thought circles) is drawn in canvas coordinates."""
    if split:
        a, b = split
        wash = wash[:a] + f'<g transform="translate(0,{DY})">' + wash[a:] + '</g>'
        ink = ink[:b] + f'<g transform="translate(0,{DY})">' + ink[b:] + '</g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {HH}" width="{W}" height="{HH}">'
            + defs() + f'<g filter="url(#{flt})">{wash}</g>{extra_wash}<g>{ink}{trail}</g></svg>')


def trail(start, end, radii, color, w):
    """thought circles from the bubble (big, first radius) down to the head (small, last radius).
    start sits just under the bubble, end just above the head; the line bows slightly outward."""
    (x0, y0), (x1, y1) = start, end
    n = len(radii)
    out = ""
    for i, r in enumerate(radii):
        t = i / (n - 1)
        x = x0 + (x1 - x0) * t - 9 * math.sin(math.pi * t)
        y = y0 + (y1 - y0) * t
        out += ring(x, y, r, r * 1.06, w=w, color=color, rot=R_rot())
    return out


def thought_circles(P, color, w, x0=112, y0=232, big=11):
    """three little thought circles trailing down-left from the bubble."""
    out = ""
    pts = [(x0, y0, big), (x0 - 26, y0 + 26, big * 0.72), (x0 - 40, y0 + 52, big * 0.45)]
    for (x, y, r) in pts:
        out += ring(x, y, r, r * 1.08, w=w, color=color, rot=R_rot())
    return out


def R_rot():
    return float(H.R.normal(0, 0.4))


# ======================================================================
# CAST A: wash on ink (deck palette: blue human, orange robot, teal highlighter)
# ======================================================================
A = dict(ink="#2a2623", blue="#8ea9e0", blue2="#b7c7ee", orange="#f0a878", orange2="#f7cdb0", teal="#8fd0c6")


def A_bubble(pose, hl_color=None):
    lines, hl = TEXT[pose]
    wash, ink = "", ""
    ink += bubble("wavy", 50, 12, 512, 192, w=2.6, color=A["ink"])
    ys = [44, 110]
    for ln, y in zip(lines, ys):
        ink += text(ln, 281, y, 46, color=A["ink"], w=3.6, align="center")
    if hl:
        # marker stroke behind the word, drawn in the wash layer
        xa, xb = H.word_span(lines[0], hl, 281, 46)
        wash += marker([(xa - 6, 70), ((xa + xb) / 2, 66), (xb + 6, 69)], 30, hl_color or A["teal"])
    return wash, ink


def A_robot(pose):
    H.seed({"robot-question": 11, "robot-punch": 12}[pose])
    wash, ink = A_bubble(pose)
    ink_c = A["ink"]
    split = (len(wash), len(ink))
    tr = trail((216, 214), (224, 336), [13, 10, 7, 5], ink_c, 2.8)
    # head: wider than tall, colour as a marker band laid a little off the line (like his)
    x0, y0, x1, y1 = 150, 346, 430, 574
    band = H.round_rect_pts(x0 - 2, y0 - 2, x1 + 2, y1 + 2, 26)
    wash += marker(band + band[:2], 24, A["orange"], op=0.85)
    wash += marker([(x0 + 6, y1 + 12), (x1 + 10, y1 + 10)], 22, A["orange"], op=0.85)
    ink += round_rect(x0, y0, x1, y1, r=26, w=3.4, color=ink_c)
    # inner screen line (his double frame)
    ink += round_rect(x0 + 15, y0 + 15, x1 - 15, y1 - 15, r=16, w=2.0, color=ink_c)
    # antenna
    ink += line((290, y0), (290, 292), w=3.0, color=ink_c)
    wash += blob(circ_poly(292, 270, 15), A["orange"], grow=6, dx=4, dy=4, jit=2, seg=14, op=0.9)
    ink += ring(290, 270, 17, 19, w=3.0, color=ink_c)
    # ears
    for sgn, ex in ((-1, x0), (1, x1)):
        pts = [(ex, 404), (ex + sgn * 24, 422), (ex + sgn * 28, 464), (ex + sgn * 4, 496)]
        wash += marker([(ex + sgn * 12, 410), (ex + sgn * 20, 440), (ex + sgn * 10, 486)], 18, A["orange"], op=0.85)
        ink += stroke(pts, w=3.0, color=ink_c, smooth=True)
    # eyes: pupils look up to the bubble
    up = (6, -9) if pose == "robot-question" else (4, 3)
    for ex in (228, 352):
        wash += blob(circ_poly(ex, 438, 22), A["orange2"], grow=4, dx=5, dy=5, jit=2, seg=18)
        ink += ring(ex, 438, 25, 24, w=3.0, color=ink_c)
        ink += dot(ex + up[0], 438 + up[1], 8.5, ink_c)
    # mouth
    if pose == "robot-question":
        wash += marker([(254, 512), (330, 514)], 18, A["orange"], op=0.85)
        ink += line((250, 508), (334, 506), w=3.0, color=ink_c)
    else:
        wash += marker([(240, 508), (342, 510)], 42, A["orange"], op=0.85)
        ink += rough_rect(240, 490, 340, 528, w=2.8, color=ink_c, over=3)
        for i in range(1, 8):
            x = 240 + i * (100 / 8)
            ink += line((x, 492), (x + 1, 527), w=2.2, color=ink_c)
    # neck spring and shoulders
    ink += zigzag(290, 578, 626, 22, 7, w=2.8, color=ink_c)
    pts = [(190, 690), (192, 650), (214, 630), (366, 630), (388, 650), (390, 690)]
    wash += marker([(200, 640), (370, 642)], 22, A["orange"], op=0.85)
    ink += stroke(pts, w=3.0, color=ink_c, smooth=True)
    return svg(wash, ink, split=split, trail=tr)


def A_human():
    H.seed(10)
    pose = "human"
    wash, ink = A_bubble(pose)
    ink_c = A["ink"]
    split = (len(wash), len(ink))
    tr = trail((232, 212), (250, 262), [11, 8, 5], ink_c, 2.8)
    # hair: a loop-de-loop cloud in blue marker
    cx, cy = 290, 392
    cloud = [(150, 440), (146, 380), (170, 326), (230, 296), (300, 288), (370, 298), (424, 330), (440, 386),
             (436, 440), (408, 420), (384, 374), (332, 360), (290, 368), (250, 360), (202, 376), (182, 422)]
    wash += blob(cloud, A["blue2"], grow=0, jit=3, seg=26, op=0.8)
    for (Rx, Ry, r, k, w, c) in ((132, 112, 20, 15, 15, A["blue"]), (110, 94, 18, 17, 14, A["blue"]),
                                  (150, 100, 14, 19, 12, A["blue"]), (84, 72, 16, 18, 13, A["blue"]),
                                  (126, 120, 17, 16, 13, A["blue2"])):
        wash += curls(cx, cy - 10, Rx, Ry, 206, -26, r, k, w, c)
    # face
    face = [(178, 404), (184, 470), (214, 536), (290, 578), (368, 536), (398, 470), (404, 404)]
    ink += stroke(face, w=3.4, color=ink_c, smooth=True, wob=1.0)
    for sgn, ex in ((-1, 178), (1, 404)):
        ink += stroke([(ex, 440), (ex + sgn * 20, 448), (ex + sgn * 18, 478), (ex, 486)], w=2.6, color=ink_c,
                      smooth=True)
    # glasses (blue-tinted lenses)
    for gx in (240, 340):
        wash += blob(circ_poly(gx, 446, 27), A["blue2"], grow=3, dx=3, dy=3, jit=1.5, seg=16)
        ink += ring(gx, 446, 28, 27, w=2.8, color=ink_c)
    ink += stroke([(268, 442), (290, 432), (312, 442)], w=2.6, color=ink_c, smooth=True)
    ink += line((212, 444), (182, 438), w=2.4, color=ink_c)
    ink += line((368, 444), (400, 438), w=2.4, color=ink_c)
    # pupils up and to the right, one eyebrow lifted
    ink += dot(247, 438, 6.5, ink_c)
    ink += dot(347, 438, 6.5, ink_c)
    ink += stroke([(208, 404), (240, 396), (266, 402)], w=3, color=ink_c, smooth=True)
    ink += stroke([(318, 394), (346, 372), (376, 380)], w=3, color=ink_c, smooth=True)
    # nose, smirk
    ink += stroke([(292, 456), (286, 500), (304, 508)], w=2.8, color=ink_c, smooth=True)
    ink += stroke([(258, 538), (292, 546), (324, 530)], w=3, color=ink_c, smooth=True)
    ink += stroke([(326, 530), (334, 522)], w=2.6, color=ink_c)
    # neck, collar, shoulders
    ink += line((258, 574), (256, 620), w=2.8, color=ink_c)
    ink += line((324, 574), (326, 620), w=2.8, color=ink_c)
    ink += stroke([(256, 620), (200, 632), (136, 660), (120, 700)], w=3, color=ink_c, smooth=True)
    ink += stroke([(326, 620), (382, 632), (446, 660), (462, 700)], w=3, color=ink_c, smooth=True)
    ink += stroke([(256, 620), (290, 650), (326, 620)], w=2.6, color=ink_c, smooth=True)
    return svg(wash, ink, split=split, trail=tr)


# ======================================================================
# CAST B: round and bold, pigment palette (verdigris robot, tyrian human, ochre lenses, vermilion lips)
# ======================================================================
B = dict(ink="#3a2e2a", green="#1d7368", mint="#b9ddd5", tyrian="#6d597a", lilac="#c9bdd4", ochre="#f0c850",
         verm="#b5341c", hl="#f0c850")


def B_bubble(pose):
    lines, hl = TEXT[pose]
    wash, ink = "", ""
    ink += bubble("cloud", 48, 14, 512, 190, w=2.8, color=B["ink"])
    for ln, y in zip(lines, [46, 110]):
        ink += text(ln, 281, y, 44, color=B["ink"], w=4.2, align="center", slant=0.04)
    if hl:
        xa, xb = H.word_span(lines[0], hl, 281, 44)
        ink_u = marker([(xa - 2, 98), ((xa + xb) / 2, 102), (xb + 2, 96)], 7, B["verm"])
        return wash, ink + ink_u
    return wash, ink


def thought_dots_B(color):
    out = ""
    for (x, y, r) in ((118, 232, 13), (92, 262, 9), (74, 288, 6)):
        out += ring(x, y, r, r, w=3.0, color=color, rot=R_rot())
    return out


def sonnet_bubble():
    """a cloud bubble holding fourteen lines of squiggly verse (4, 4, 3, 3)."""
    ink = bubble("cloud", 48, 20, 512, 232, w=2.8, color=B["ink"])
    y = 50
    lens = [300, 340, 320, 350, 0, 330, 310, 340, 300, 0, 320, 280, 330, 0, 300, 340, 260]
    for L in lens:
        if L == 0:
            y += 7
            continue
        x0 = 281 - L / 2 + H.R.normal(0, 8)
        n = int(L / 8)
        pts = [(x0 + i * 8, y + (1.4 if i % 2 else -1.4) * (0.4 + H.R.random() * 0.9)) for i in range(n)]
        ink += stroke(pts, w=2.2, color=B["ink"], wob=0.3, taper=0.8, smooth=True, op=0.9)
        y += 10.8
    return "", ink


def quill(x0, y0, x1, y1, color_vane, ic):
    """a feather pen from (x0,y0) up to the tip (x1,y1)."""
    wash, ink = "", ""
    mid = ((x0 + x1) / 2 + 14, (y0 + y1) / 2 - 6)
    spine = [(x0, y0), mid, (x1, y1)]
    P = cr(spine, per=10)
    n = len(P)
    left, right = [], []
    for i in range(n):
        t = i / (n - 1)
        wv = 34 * math.sin(math.pi * min(1.0, t * 1.1)) ** 0.7 * (0.45 + 0.55 * t) if t > 0.16 else 0
        T = P[min(i + 1, n - 1)] - P[max(i - 1, 0)]
        T = T / (np.hypot(*T) + 1e-9)
        N = np.array([-T[1], T[0]])
        left.append(P[i] + N * wv)
        right.append(P[i] - N * wv * 0.8)
    vane = left[3:] + right[3:][::-1]
    wash += blob(vane, color_vane, grow=0, jit=1.5, seg=14, op=0.85)
    ink += stroke(spine, w=2.6, color=ic, smooth=True)
    for i in range(6, n - 3, 3):
        T = P[min(i + 1, n - 1)] - P[max(i - 1, 0)]
        ink += stroke([P[i], left[i] + (P[i] - left[i]) * 0.1], w=1.6, color=ic, wob=0.2, taper=0.8) if False else ""
        ink += stroke([P[i], left[i]], w=1.5, color=ic, wob=0.3, taper=0.7, op=0.8)
        ink += stroke([P[i], right[i]], w=1.5, color=ic, wob=0.3, taper=0.7, op=0.8)
    return wash, ink


def B_robot(pose):
    H.seed({"robot-question": 21, "robot-punch": 22, "robot-quill": 23}[pose])
    if pose == "robot-quill":
        wash, ink = sonnet_bubble()
    else:
        wash, ink = B_bubble(pose)
    ic = B["ink"]
    split = (len(wash), len(ink))
    tr = (trail((132, 252), (180, 346), [11, 8, 5], ic, 3.0) if pose == "robot-quill"
          else trail((126, 212), (178, 336), [13, 10, 7, 5], ic, 3.0))
    # bell head: flat base, vertical sides, dome top
    cx, base, side_top, top = 290, 580, 430, 316
    hw = 124
    dome = [(cx - hw, base), (cx - hw, side_top)]
    for a in np.linspace(180, 360, 13)[1:-1]:
        dome.append((cx + hw * math.cos(math.radians(a)), side_top + (side_top - top) * math.sin(math.radians(a))))
    dome += [(cx + hw, side_top), (cx + hw, base)]
    # pale wash inside, bold green marker frame
    wash += blob(dome, B["mint"], grow=-4, dx=4, dy=6, jit=2, seg=36)
    wash += marker(dome + [dome[0]], 12, B["green"])
    # antennae with little balls, or a quill pen in their place
    if pose == "robot-quill":
        qw, qi = quill(cx + 34, 340, cx + 170, 262, B["verm"], ic)
        wash += qw
        ink += qi
        ink += line((cx - 56, 336), (cx - 60, 290), w=3.0, color=ic)
        wash += blob(circ_poly(cx - 60, 278, 12), B["verm"], grow=0, dx=2, dy=2, jit=1, seg=12)
        ink += ring(cx - 60, 278, 13, 13, w=3.0, color=ic)
    else:
        for sx, tx in ((-1, 234), (1, 346)):
            ink += line((cx + sx * 56, 336), (tx + sx * 4, 288), w=3.0, color=ic)
            wash += blob(circ_poly(tx + sx * 4, 276, 12), B["verm"], grow=0, dx=2, dy=2, jit=1, seg=12)
            ink += ring(tx + sx * 4, 276, 13, 13, w=3.0, color=ic)
    # ear dials
    for sx in (-1, 1):
        ex = cx + sx * (hw + 26)
        wash += blob(circ_poly(ex, 484, 24), B["ochre"], grow=0, dx=2, dy=3, jit=1.5, seg=14)
        ink += ring(ex, 484, 24, 24, w=3.0, color=ic)
        ink += line((ex - 12, 484), (ex + 12, 484), w=2.4, color=ic)
        ink += line((ex, 472), (ex, 496), w=2.4, color=ic)
    # round glasses
    up = {"robot-question": (5, -8), "robot-quill": (8, -7)}.get(pose, (3, 3))
    for gx in (cx - 54, cx + 54):
        wash += blob(circ_poly(gx, 452, 36), B["ochre"], grow=-3, dx=2, dy=3, jit=1.5, seg=18, op=0.85)
        ink += ring(gx, 452, 38, 37, w=3.6, color=ic)
        ink += ring(gx, 452, 11, 11, w=2.6, color=ic)
        ink += dot(gx + up[0], 452 + up[1], 5.5, ic)
    ink += stroke([(cx - 18, 446), (cx, 436), (cx + 18, 446)], w=3, color=ic, smooth=True)
    # mouth
    if pose == "robot-question":
        ink += ring(cx, 534, 15, 11, w=3.0, color=ic)
        wash += blob(circ_poly(cx, 534, 9), B["verm"], grow=0, dx=1, dy=2, jit=1, seg=12)
    elif pose == "robot-quill":
        ink += stroke([(cx - 44, 522), (cx - 20, 546), (cx + 20, 548), (cx + 48, 520)], w=3.2, color=ic, smooth=True)
        wash += marker([(cx - 30, 538), (cx, 548), (cx + 30, 538)], 10, B["verm"], op=0.8)
    else:
        ink += rough_rect(cx - 56, 516, cx + 56, 552, w=3.0, color=ic, over=3)
        pts = [(cx - 54 + i * 9, 517 if i % 2 == 0 else 551) for i in range(13)]
        ink += stroke(pts, w=2.4, color=ic, wob=0.4, taper=0.8)
        wash += blob(rect_poly(cx - 52, 520, cx + 52, 550), B["verm"], grow=-8, dx=2, dy=3, jit=1.5, seg=30, op=0.8)
    # rivets
    for rx in (cx - 100, cx - 66, cx + 66, cx + 100):
        ink += dot(rx, 568, 3.6, ic)
    # shoulders
    ink += stroke([(180, 690), (186, 640), (220, 618), (360, 618), (394, 640), (400, 690)], w=3.2, color=ic,
                  smooth=True)
    wash += blob([(188, 690), (192, 646), (224, 624), (356, 624), (388, 646), (394, 690)], B["lilac"], grow=0, dx=0,
                 dy=0, jit=2, seg=30, op=0.9)
    ink += stroke([(cx - 28, 580), (cx - 28, 618)], w=2.8, color=ic)
    ink += stroke([(cx + 28, 580), (cx + 28, 618)], w=2.8, color=ic)
    return svg(wash, ink, flt="crayon", split=split, trail=tr)


def B_human():
    H.seed(20)
    wash, ink = B_bubble("human")
    ic = B["ink"]
    split = (len(wash), len(ink))
    tr = trail((156, 212), (196, 324), [13, 10, 7, 5], ic, 3.0)
    cx = 290
    # bob haircut: lilac wash with a heavy tyrian marker line, fringe zigzag
    hair = [(cx - 138, 640), (cx - 146, 520), (cx - 150, 430), (cx - 118, 350), (cx - 50, 318), (cx + 40, 316),
            (cx + 118, 350), (cx + 150, 430), (cx + 146, 520), (cx + 138, 640)]
    wash += blob(hair, B["lilac"], grow=0, dx=4, dy=4, jit=3, seg=34)
    wash += marker(hair, 13, B["tyrian"])
    # fringe
    fr = [(cx - 112, 400), (cx - 80, 372), (cx - 50, 408), (cx - 10, 370), (cx + 28, 410), (cx + 66, 372),
          (cx + 108, 404)]
    wash += marker(fr, 11, B["tyrian"], smooth=False)
    # face
    face = [(cx - 104, 410), (cx - 104, 480), (cx - 70, 548), (cx, 586), (cx + 70, 548), (cx + 104, 480),
            (cx + 104, 410)]
    wash += blob(face + [(cx - 104, 410)], "#faf3ea", grow=-2, dx=0, dy=0, jit=1, seg=30)
    ink += stroke(face, w=3.2, color=ic, smooth=True)
    # big round glasses in ochre marker
    for gx in (cx - 50, cx + 50):
        wash += blob(circ_poly(gx, 468, 30), B["ochre"], grow=-2, dx=2, dy=2, jit=1.5, seg=16, op=0.7)
        wash += marker(circ_poly(gx, 468, 33) + [circ_poly(gx, 468, 33)[0]], 6, B["ochre"])
    ink += stroke([(cx - 18, 460), (cx, 450), (cx + 18, 460)], w=3, color=ic, smooth=True)
    # closed, pleased eyes with a lash
    for gx in (cx - 50, cx + 50):
        ink += stroke([(gx - 17, 466), (gx, 476), (gx + 17, 466)], w=3.0, color=ic, smooth=True)
        ink += line((gx + 15, 466), (gx + 22, 458), w=2.2, color=ic)
    # brows: one raised
    ink += stroke([(cx - 76, 424), (cx - 50, 416), (cx - 24, 422)], w=3, color=ic, smooth=True)
    ink += stroke([(cx + 26, 418), (cx + 52, 402), (cx + 80, 410)], w=3, color=ic, smooth=True)
    # nose, lips, cheeks
    ink += stroke([(cx + 4, 490), (cx - 6, 524), (cx + 10, 528)], w=2.8, color=ic, smooth=True)
    wash += marker([(cx - 22, 553), (cx, 560), (cx + 24, 551)], 11, B["verm"])
    wash += blob(circ_poly(cx - 78, 524, 17), B["verm"], grow=0, dx=0, dy=0, jit=2, seg=12, op=0.45)
    wash += blob(circ_poly(cx + 78, 524, 17), B["verm"], grow=0, dx=0, dy=0, jit=2, seg=12, op=0.45)
    # neck and collar
    ink += line((cx - 30, 584), (cx - 30, 624), w=2.8, color=ic)
    ink += line((cx + 30, 584), (cx + 30, 624), w=2.8, color=ic)
    ink += stroke([(cx - 30, 624), (cx, 654), (cx + 30, 624)], w=2.8, color=ic, smooth=True)
    return svg(wash, ink, flt="crayon", split=split, trail=tr)


# ======================================================================
# CAST C: single line, one accent (vermilion)
# ======================================================================
C = dict(ink="#27221f", verm="#b5341c", verm2="#e59a85")


def C_bubble(pose):
    lines, hl = TEXT[pose]
    wash, ink = "", ""
    ink += bubble("plain", 56, 16, 506, 188, w=2.0, color=C["ink"])
    for ln, y in zip(lines, [46, 108]):
        ink += text(ln, 281, y, 42, color=C["ink"], w=2.6, align="center", slant=0.14)
    if hl:
        xa, xb = H.word_span(lines[0], hl, 281, 42)
        ink += stroke([(xa - 2, 94), ((xa + xb) / 2, 100), (xb + 2, 93)], w=3.4, color=C["verm"], smooth=True)
    return wash, ink


def C_dots():
    out = ""
    for (x, y, r) in ((98, 232, 10), (80, 258, 7), (68, 280, 4.5)):
        out += ring(x, y, r, r, w=1.8, color=C["ink"], rot=R_rot())
    return out


def C_robot(pose):
    H.seed({"robot-question": 31, "robot-punch": 32}[pose])
    wash, ink = C_bubble(pose)
    ic = C["ink"]
    split = (len(wash), len(ink))
    tr = trail((204, 210), (216, 330), [11, 8, 6, 4.5], ic, 1.9)
    # tall screen head
    x0, y0, x1, y1 = 196, 330, 394, 590
    ink += round_rect(x0, y0, x1, y1, r=36, w=2.2, color=ic)
    ink += round_rect(x0 + 18, y0 + 20, x1 - 18, y1 - 54, r=22, w=1.7, color=ic)
    # spring antenna
    pts = []
    for i in range(0, 60):
        t = i / 59
        pts.append((295 + 22 * math.sin(t * 6 * math.pi), 330 - t * 62))
    ink += stroke(pts, w=2.0, color=ic, smooth=False, wob=0.4, taper=0.6, step=2)
    wash += blob(circ_poly(295, 252, 12), C["verm"], grow=0, dx=1, dy=1, jit=1, seg=12)
    ink += ring(295, 252, 12, 12, w=2.0, color=ic)
    # eyes: little rings, pupils up
    up = (3, -5) if pose == "robot-question" else (2, 2)
    for ex in (252, 340):
        ink += ring(ex, 426, 15, 14, w=2.0, color=ic)
        ink += dot(ex + up[0], 426 + up[1], 5, ic)
    # brow flicks
    ink += line((236, 392), (268, 390), w=1.9, color=ic)
    ink += line((326, 388 if pose == "robot-punch" else 382), (356, 392), w=1.9, color=ic)
    # cheeks in vermilion
    for ex in (232, 360):
        wash += blob(circ_poly(ex, 470, 13), C["verm2"], grow=0, jit=2, seg=10, op=0.8)
    # mouth
    if pose == "robot-question":
        ink += stroke([(266, 500), (282, 492), (298, 506), (314, 494), (326, 502)], w=2.0, color=ic, smooth=True)
    else:
        pts = [(258 + i * 11, 490 if i % 2 == 0 else 516) for i in range(8)]
        ink += stroke(pts, w=2.0, color=ic, wob=0.4, taper=0.8)
        ink += rough_rect(258, 490, 335, 516, w=1.8, color=ic, over=2)
    # chin panel: a row of dots
    for i in range(5):
        ink += dot(250 + i * 24, 560, 3.0, ic)
    # body: a plain trapezoid shoulders
    ink += stroke([(250, 592), (248, 622)], w=2.0, color=ic)
    ink += stroke([(340, 592), (342, 622)], w=2.0, color=ic)
    ink += stroke([(248, 622), (196, 636), (160, 690)], w=2.0, color=ic, smooth=True)
    ink += stroke([(342, 622), (394, 636), (430, 690)], w=2.0, color=ic, smooth=True)
    return svg(wash, ink, flt="wash", split=split, trail=tr)


def coil_path(center_pts, r, color, w=1.7, loop=15.0):
    """a coiled line that follows a centre path: little loops all the way along."""
    P, s = H.resample(cr(center_pts, per=8), 1.0)
    ph = 2 * math.pi * s / loop
    pts = np.column_stack([P[:, 0] + r * np.cos(ph), P[:, 1] + r * 0.85 * np.sin(ph)])
    return stroke(pts, w=w, color=color, wob=0.4, taper=0.5, step=1.2, chunk=6)


def C_human():
    H.seed(30)
    wash, ink = C_bubble("human")
    ic = C["ink"]
    split = (len(wash), len(ink))
    tr = trail((226, 208), (238, 300), [10, 7, 5], ic, 1.9)
    # long face in one line, long nose, pipe, curly hair in thin line with a few red curls
    cx = 292
    # loose coils laid in rows, like the hair in his pipe portrait, with a few red streaks through them
    rows = [(298, 18, 1), (318, 14, -1), (338, 12, 1), (358, 12, -1), (374, 10, 1)]
    for (ry, inset, d) in rows:
        hw = 124 * math.sqrt(max(0.05, 1 - ((ry - 398) / 112) ** 2)) - inset
        xs = np.linspace(cx - hw, cx + hw, 40)[::d]
        ys = [ry + 6 * math.sin(i * 0.9) + H.R.normal(0, 2) for i in range(len(xs))]
        ink += coil_path(list(zip(xs, ys)), 10, ic)
    for (x0, x1) in ((158, 204), (380, 426)):
        ink += coil_path([(x0, 392), (x1, 404), (x0 + 4, 420), (x1 - 4, 432)], 9, ic)
    wash += marker([(cx - 96, 330), (cx - 30, 316), (cx + 20, 322)], 7, C["verm"], op=0.9)
    wash += marker([(cx + 40, 346), (cx + 92, 340), (cx + 108, 358)], 7, C["verm"], op=0.9)
    face = [(184, 402), (190, 474), (226, 546), (290, 588), (356, 548), (392, 476), (398, 404)]
    ink += stroke(face, w=2.2, color=ic, smooth=True, wob=1.1)
    # glasses: a flat vermilion lens on one eye only
    for gx in (242, 340):
        ink += ring(gx, 452, 27, 25, w=2.0, color=ic)
    wash += blob(circ_poly(242, 452, 25), C["verm2"], grow=0, dx=3, dy=3, jit=1.5, seg=14, op=0.9)
    ink += stroke([(268, 448), (290, 440), (314, 448)], w=1.9, color=ic, smooth=True)
    ink += dot(247, 446, 4.5, ic)
    ink += dot(345, 446, 4.5, ic)
    # nose long
    ink += stroke([(292, 458), (284, 520), (306, 528)], w=2.0, color=ic, smooth=True)
    # pipe
    ink += stroke([(318, 552), (348, 556), (374, 574), (394, 592)], w=2.8, color=ic, smooth=True)
    wash += blob(circ_poly(412, 606, 17), C["verm"], grow=0, dx=2, dy=2, jit=1.5, seg=12, op=0.9)
    ink += ring(410, 606, 19, 17, w=2.6, color=ic)
    ink += stroke([(396, 596), (404, 590)], w=2.4, color=ic)
    # smoke curling up the right side
    smoke = [(414, 582), (426, 556), (408, 534), (428, 510), (410, 486), (430, 462), (420, 440)]
    ink += stroke(smoke, w=1.7, color=ic, smooth=True, wob=1.2, taper=0.9, op=0.8)
    # mouth line, pipe held in the corner
    ink += stroke([(262, 548), (292, 556), (320, 550)], w=2.2, color=ic, smooth=True)
    # brow raised
    ink += stroke([(318, 404), (344, 388), (372, 394)], w=2.0, color=ic, smooth=True)
    ink += stroke([(212, 410), (242, 404), (264, 410)], w=2.0, color=ic, smooth=True)
    # neck and suit: lapel lines
    ink += line((262, 586), (256, 632), w=2.0, color=ic)
    ink += line((328, 590), (336, 632), w=2.0, color=ic)
    ink += stroke([(256, 632), (210, 640), (150, 670), (136, 720)], w=2.0, color=ic, smooth=True)
    ink += stroke([(336, 632), (384, 640), (444, 670), (458, 720)], w=2.0, color=ic, smooth=True)
    ink += stroke([(256, 632), (290, 664), (336, 632)], w=2.0, color=ic, smooth=True)
    ink += stroke([(290, 664), (288, 720)], w=2.0, color=ic)
    return svg(wash, ink, flt="wash", split=split, trail=tr)


# ======================================================================
# EXTRAS: one new subject per cast
# ======================================================================

def A_letters():
    """a tumbler of letters, with glasses and a dashed smile, letters spilling out (cf. his glass)."""
    H.seed(40)
    ic = A["ink"]
    wash, ink = "", ""
    # letters tumbling out of the glass
    spots = [("Q", 232, 150, -0.35, 54), ("U", 318, 118, 0.25, 50), ("E", 396, 168, 0.5, 52),
             ("N", 170, 232, 0.3, 46), ("E", 282, 214, -0.2, 58), ("A", 372, 268, -0.45, 48),
             ("U", 224, 306, 0.4, 44), ("S", 322, 330, 0.15, 40), ("O", 420, 346, -0.3, 38),
             ("T", 140, 340, -0.5, 38), ("N", 270, 112, 0.6, 30), ("E", 450, 250, 0.35, 32)]
    for ch, x, y, rot, h in spots:
        ink += text(ch, x, y, h, color=ic, w=3.4, rot_all=rot, slant=0.0)
    for (x, y) in ((296, 152), (372, 222), (206, 270)):
        wash += marker([(x - 12, y + 24), (x + 14, y + 20)], 24, A["teal"], op=0.9)
    # tumbler: open trapezoid with a rim line
    L0, R0, TY, BY = (168, 392), (412, 392), 392, 640
    left = [(168, TY), (188, 500), (206, BY)]
    right = [(412, TY), (392, 500), (374, BY)]
    wash += marker([(176, TY + 12), (196, 520), (212, BY - 8)], 20, A["blue"], op=0.7)
    wash += marker([(404, TY + 12), (384, 520), (368, BY - 8)], 20, A["blue"], op=0.7)
    wash += blob([(176, TY + 8), (404, TY + 8), (372, BY - 6), (208, BY - 6)], A["blue2"], grow=-6, jit=2, seg=40, op=0.45)
    ink += stroke(left, w=3.4, color=ic, smooth=True)
    ink += stroke(right, w=3.4, color=ic, smooth=True)
    ink += stroke([(206, BY), (290, BY + 6), (374, BY)], w=3.2, color=ic, smooth=True)
    ink += stroke([(168, TY), (290, TY + 16), (412, TY)], w=2.4, color=ic, smooth=True, op=0.9)
    # face: round glasses, a dashed smile
    for gx in (248, 332):
        ink += ring(gx, 480, 26, 26, w=3.0, color=ic)
        wash += blob(circ_poly(gx, 480, 21), A["blue2"], grow=0, dx=2, dy=2, jit=1.5, seg=14, op=0.8)
        ink += dot(gx + 3, 484, 5.5, ic)
    ink += stroke([(274, 476), (290, 468), (306, 476)], w=2.8, color=ic, smooth=True)
    ink += stroke([(214, 470), (190, 462)], w=2.4, color=ic)
    ink += stroke([(366, 470), (392, 462)], w=2.4, color=ic)
    # nose and a dashed smile
    ink += stroke([(292, 492), (284, 534), (300, 540)], w=2.8, color=ic, smooth=True)
    ts = np.linspace(0, 1, 13)
    arc = [(232 + 116 * t, 566 + 26 * math.sin(math.pi * t)) for t in ts]
    for i in range(0, 12, 2):
        ink += stroke([arc[i], arc[i + 1]], w=3.2, color=ic, wob=0.2, taper=0.9)
    return svg(wash, ink)


def B_hare_unused():
    return ""


def C_hare():
    """a hare in spectacles and a bow tie, one thin line, one red accent."""
    H.seed(50)
    ic, vm = C["ink"], C["verm"]
    wash, ink = "", ""
    cx = 290
    # ears: two long loops
    for sx, tilt in ((-1, -0.15), (1, 0.18)):
        ex = cx + sx * 54
        pts = [(ex - 22, 410), (ex - 30 + sx * 6, 330), (ex - 24 + tilt * 80, 230), (ex + tilt * 90, 196),
               (ex + 26 + tilt * 80, 236), (ex + 30, 330), (ex + 22, 410)]
        ink += stroke(pts, w=2.2, color=ic, smooth=True, wob=1.0)
        inner = [(ex - 8, 400), (ex - 12 + tilt * 40, 320), (ex - 6 + tilt * 70, 240), (ex + 4 + tilt * 70, 240),
                 (ex + 10, 320), (ex + 8, 400)]
        wash += blob(inner, C["verm2"], grow=-1, jit=2, seg=24, op=0.8)
    # head
    head = [(cx - 112, 470), (cx - 100, 420), (cx - 50, 392), (cx, 388), (cx + 50, 392), (cx + 100, 420),
            (cx + 112, 470), (cx + 96, 530), (cx + 50, 574), (cx, 584), (cx - 50, 574), (cx - 96, 530),
            (cx - 112, 470), (cx - 108, 456)]
    ink += stroke(head, w=2.2, color=ic, smooth=True, wob=1.2)
    # spectacles
    for gx in (cx - 46, cx + 46):
        ink += ring(gx, 468, 28, 26, w=2.0, color=ic)
        ink += dot(gx + 3, 464, 5, ic)
    ink += stroke([(cx - 18, 462), (cx, 454), (cx + 18, 462)], w=1.9, color=ic, smooth=True)
    wash += blob(circ_poly(cx + 46, 468, 25), C["verm2"], grow=0, dx=3, dy=3, jit=1.5, seg=14, op=0.9)
    # nose, mouth, whiskers
    wash += blob([(cx - 11, 512), (cx + 11, 512), (cx, 526)], vm, grow=1, jit=1, seg=8)
    ink += stroke([(cx - 11, 512), (cx + 11, 512), (cx, 526), (cx - 11, 512)], w=2.0, color=ic, smooth=False)
    ink += stroke([(cx, 526), (cx, 538), (cx - 14, 548)], w=1.9, color=ic, smooth=True)
    ink += stroke([(cx, 538), (cx + 14, 548)], w=1.9, color=ic, smooth=True)
    for sy in (-1, 0, 1):
        ink += stroke([(cx - 64, 530 + sy * 8), (cx - 130, 520 + sy * 22)], w=1.5, color=ic, wob=0.6)
        ink += stroke([(cx + 64, 530 + sy * 8), (cx + 130, 520 + sy * 22)], w=1.5, color=ic, wob=0.6)
    # bow tie in vermilion
    wash += blob([(cx, 616), (cx - 46, 596), (cx - 46, 636)], vm, grow=0, jit=1.5, seg=10, op=0.9)
    wash += blob([(cx, 616), (cx + 46, 596), (cx + 46, 636)], vm, grow=0, jit=1.5, seg=10, op=0.9)
    ink += stroke([(cx, 616), (cx - 46, 596), (cx - 46, 636), (cx, 616), (cx + 46, 596), (cx + 46, 636), (cx, 616)],
                  w=1.9, color=ic, wob=0.5, taper=0.8)
    ink += dot(cx, 616, 6, ic)
    # shoulders
    ink += stroke([(cx - 60, 580), (cx - 150, 640), (cx - 176, 700)], w=2.0, color=ic, smooth=True)
    ink += stroke([(cx + 60, 580), (cx + 150, 640), (cx + 176, 700)], w=2.0, color=ic, smooth=True)
    return svg(wash, ink, flt="wash")


CASTS = {
    "a-wash": dict(human=A_human, robot=A_robot, extra=("letters", A_letters)),
    "b-bell": dict(human=B_human, robot=B_robot, extra=("quill", lambda: B_robot("robot-quill"))),
    "c-line": dict(human=C_human, robot=C_robot, extra=("hare", C_hare)),
}


def build_all(outdir):
    import os
    os.makedirs(outdir, exist_ok=True)
    for name, c in CASTS.items():
        open(f"{outdir}/{name}-human.svg", "w").write(c["human"]())
        open(f"{outdir}/{name}-robot-question.svg", "w").write(c["robot"]("robot-question"))
        open(f"{outdir}/{name}-robot-punch.svg", "w").write(c["robot"]("robot-punch"))
        en, ef = c["extra"]
        open(f"{outdir}/{name}-{en}.svg", "w").write(ef())


if __name__ == "__main__":
    import sys
    build_all(sys.argv[1])
