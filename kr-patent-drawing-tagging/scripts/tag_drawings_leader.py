# -*- coding: utf-8 -*-
"""한국 특허 도면부호 태깅 엔진 v2 — 외부 숫자 + 구불선 지시선 (KIPO 정식 스타일)

레퍼런스: 사건 B 작도 스타일 (숫자를 박스 밖에 두고 '~' 구불선으로 테두리에 연결).

사용법:
    python tag_drawings_leader.py --config <config.json>

config 스키마는 tag_drawings.py 와 동일 + 확장:
  figure 단위:
    "pad_top" / "pad_left" / "pad_right" / "pad_bottom": 캔버스 여백 확장(px)
  solo 항목: [fx, fy, "부호"] 또는 [fx, fy, "부호", "side"] (side: above/below/right/left/right_upper)
  groups.tagged 항목: [idx, "부호"] 또는 [idx, "부호", "side"]
"""
import argparse
import json
import math
import os
import shutil
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

DEFAULT_FONT = r"C:\Windows\Fonts\malgunbd.ttf"


def detect_boxes(img):
    H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, bw = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(bw, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    rects = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if w < max(80, W * 0.03) or h < max(40, H * 0.04):
            continue
        rects.append((x, y, w, h))
    rects.sort(key=lambda r: r[2] * r[3], reverse=True)
    kept = []
    for r in rects:
        dup = False
        for k in kept:
            xi = max(0, min(r[0] + r[2], k[0] + k[2]) - max(r[0], k[0]))
            yi = max(0, min(r[1] + r[3], k[1] + k[3]) - max(r[1], k[1]))
            inter = xi * yi
            union = r[2] * r[3] + k[2] * k[3] - inter
            if union > 0 and inter / union > 0.75:
                dup = True
                break
        if not dup:
            kept.append(r)
    return kept


def nearest(rects, used, W, H, fx, fy):
    ax, ay = fx * W, fy * H
    best, bd = None, 1e18
    for r in rects:
        if r in used:
            continue
        cx, cy = r[0] + r[2] / 2, r[1] + r[3] / 2
        d = ((cx - ax) / W) ** 2 + ((cy - ay) / H) ** 2
        if d < bd:
            bd, best = d, r
    return best


def squiggle_points(p0, p1):
    """p0(부호 쪽) → p1(박스 테두리 쪽) 감쇠 사인 구불선 좌표열."""
    n = 28
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / L, dx / L
    amp = min(12.0, L * 0.16)
    pts = []
    for i in range(n + 1):
        t = i / n
        x = p0[0] + dx * t
        y = p0[1] + dy * t
        a = amp * math.sin(2 * math.pi * t) * math.sin(math.pi * t)
        pts.append((x + nx * a, y + ny * a))
    return pts


class LeaderTagger:
    """부호 텍스트 + 구불선을 어두운 픽셀·기존 라벨과 충돌하지 않는 후보에 배치."""

    def __init__(self, gray, draw, W, H):
        self.gray, self.draw, self.W, self.H = gray, draw, W, H
        self.drawn = []          # 텍스트 및 지시선 점유 rect
        self.line_w = max(2, round(W / 900))

    def _rect_free(self, x0, y0, x1, y1, pad=5):
        x0, y0, x1, y1 = int(x0 - pad), int(y0 - pad), int(x1 + pad), int(y1 + pad)
        if x0 < 0 or y0 < 0 or x1 >= self.W or y1 >= self.H:
            return False
        if (self.gray[y0:y1, x0:x1] < 128).any():
            return False
        for (dx0, dy0, dx1, dy1) in self.drawn:
            if not (x1 < dx0 or dx1 < x0 or y1 < dy0 or dy1 < y0):
                return False
        return True

    def _path_free(self, pts):
        # 양 끝 15% 는 박스 테두리·텍스트 근접 허용
        for (x, y) in pts[4:-4]:
            x0, y0 = int(x - 4), int(y - 4)
            x1, y1 = int(x + 4), int(y + 4)
            if x0 < 0 or y0 < 0 or x1 >= self.W or y1 >= self.H:
                return False
            if (self.gray[y0:y1, x0:x1] < 128).any():
                return False
            for (dx0, dy0, dx1, dy1) in self.drawn:
                if dx0 <= x <= dx1 and dy0 <= y <= dy1:
                    return False
        return True

    def candidates(self, box, tw, th, L, sides):
        """(text_x0, text_y0, squiggle_p0, squiggle_p1) 후보 생성."""
        x, y, w, h = box
        out = []
        for s in sides:
            if s == "above":
                ex, ey = x + w * 0.82, y
                tx = ex + L * 0.30 - tw * 0.25
                ty = ey - L - th - 6
                p0 = (tx + tw * 0.35, ty + th + 4)
            elif s == "below":
                ex, ey = x + w * 0.82, y + h
                tx = ex + L * 0.30 - tw * 0.25
                ty = ey + L + 6
                p0 = (tx + tw * 0.35, ty - 4)
            elif s == "right":
                ex, ey = x + w, y + h * 0.5
                tx = ex + L + 8
                ty = ey - th * 0.55
                p0 = (tx - 6, ey)
            elif s == "right_upper":
                ex, ey = x + w, y + h * 0.28
                tx = ex + L + 8
                ty = ey - th * 0.55
                p0 = (tx - 6, ey)
            elif s == "left":
                ex, ey = x, y + h * 0.5
                tx = ex - L - tw - 8
                ty = ey - th * 0.55
                p0 = (tx + tw + 6, ey)
            elif s == "above_left":
                ex, ey = x + w * 0.18, y
                tx = ex - L * 0.30 - tw * 0.75
                ty = ey - L - th - 6
                p0 = (tx + tw * 0.65, ty + th + 4)
            else:
                continue
            out.append((s, tx, ty, p0, (ex, ey)))
        return out

    def put(self, sym, box, font, sides, L):
        tb = self.draw.textbbox((0, 0), sym, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        cands = self.candidates(box, tw, th, L, sides)
        chosen = None
        for (s, tx, ty, p0, p1) in cands:
            pts = squiggle_points(p0, p1)
            if self._rect_free(tx, ty, tx + tw, ty + th) and self._path_free(pts):
                chosen = (s, tx, ty, pts)
                break
        forced = chosen is None
        if forced:
            s, tx, ty, p0, p1 = cands[0]
            chosen = (s, tx, ty, squiggle_points(p0, p1))
        s, tx, ty, pts = chosen
        self.draw.text((tx - tb[0], ty - tb[1]), sym, font=font, fill=(0, 0, 0))
        self.draw.line(pts, fill=(0, 0, 0), width=self.line_w, joint="curve")
        self.drawn.append((tx, ty, tx + tw, ty + th))
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        self.drawn.append((min(xs), min(ys), max(xs), max(ys)))
        return (not forced), s


def dashed_edge(gray, u, W, H):
    """그룹 union 위/오른쪽의 점선 테두리 위치 추정.

    union 가장자리에서 바깥으로 한 줄씩 스캔하며, 큰 공백(다른 요소와의 간격)을
    만나면 중단 — 인접한 별개 실선 박스를 점선 테두리로 오인하지 않도록 한다.
    """
    x0, y0, x1, y1 = u
    top = y0
    cx0, cx1 = x0 + int((x1 - x0) * 0.2), x1 - int((x1 - x0) * 0.05)
    gap, max_gap = 0, max(12, int(H * 0.05))
    for yy in range(y0 - 4, max(0, y0 - int(H * 0.30)), -1):
        if (gray[yy, cx0:cx1] < 128).any():
            top, gap = yy, 0
        else:
            gap += 1
            if gap > max_gap:
                break
    right = x1
    cy0, cy1 = y0 + 4, y1 - 4
    gap, max_gap = 0, max(12, int(W * 0.03))
    for xx in range(x1 + 4, min(W, x1 + int(W * 0.06))):
        if (gray[cy0:cy1, xx] < 128).any():
            right, gap = xx, 0
        else:
            gap += 1
            if gap > max_gap:
                break
    return top, right


def process(fig_no, spec, src_dir, out_dir, font_path):
    src = os.path.join(src_dir, spec.get("file", f"{fig_no}.png"))
    out = os.path.join(out_dir, f"도{int(fig_no):02d}.png")

    if spec.get("copy_only"):
        shutil.copy(src, out)
        return [("(copy_only)", "copy", True)]

    img = cv2.imdecode(np.fromfile(src, dtype=np.uint8), cv2.IMREAD_COLOR)
    H0, W0 = img.shape[:2]
    rects0 = detect_boxes(img)

    pt = int(spec.get("pad_top", 0))
    pl = int(spec.get("pad_left", 0))
    pr = int(spec.get("pad_right", 0))
    pb = int(spec.get("pad_bottom", 0))
    pil = Image.open(src).convert("RGB")
    if pt or pl or pr or pb:
        canvas = Image.new("RGB", (W0 + pl + pr, H0 + pt + pb), (255, 255, 255))
        canvas.paste(pil, (pl, pt))
        pil = canvas
    W, H = pil.size
    gray = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2GRAY)
    rects = [(x + pl, y + pt, w, h) for (x, y, w, h) in rects0]

    draw = ImageDraw.Draw(pil)
    tg = LeaderTagger(gray, draw, W, H)
    used = set()
    log = []

    heights = [r[3] for r in rects] or [100]
    med_h = sorted(heights)[len(heights) // 2]
    fs = max(28, min(int(W / 70), int(med_h * 0.42)))
    font = ImageFont.truetype(font_path, fs)
    L = max(30, int(W / 40))

    # 앵커는 원본 좌표계 기준 → 패딩 반영해 rects 좌표와 비교
    def match2(fx, fy):
        ax, ay = fx * W0 + pl, fy * H0 + pt
        best, bd = None, 1e18
        for r in rects:
            if r in used:
                continue
            cx, cy = r[0] + r[2] / 2, r[1] + r[3] / 2
            d = ((cx - ax) / W) ** 2 + ((cy - ay) / H) ** 2
            if d < bd:
                bd, best = d, r
        return best

    # container: 최대 면적 박스 — 상단 테두리 위 중앙-우측에 부호 + 구불선
    if spec.get("container"):
        r = max(rects, key=lambda q: q[2] * q[3])
        used.add(r)
        ok, side = tg.put(spec["container"], r, font,
                          spec.get("container_sides", ["above", "right_upper", "below"]), L)
        log.append((spec["container"], f"container/{side}", ok))

    # 실린더: 상단 우측 외곽에 부호
    for item in spec.get("cyl", []):
        fx, fy, sym = item[0], item[1], item[2]
        sides = [item[3]] if len(item) > 3 else ["above", "right_upper", "left"]
        r = match2(fx, fy)
        used.add(r)
        x, y, w, h = r
        # 실린더 상단은 타원 — 테두리 접점을 살짝 안쪽으로
        ok, side = tg.put(sym, (x, y + int(h * 0.04), w, int(h * 0.92)), font, sides, L)
        log.append((sym, f"cyl/{side}", ok))

    # 그룹: 점선 테두리 추정 → 우상단 외곽 대표 부호
    for g in spec.get("groups", []):
        mrects = []
        for fx, fy in g["members"]:
            r = match2(fx, fy)
            used.add(r)
            mrects.append(r)
        x0 = min(r[0] for r in mrects)
        y0 = min(r[1] for r in mrects)
        x1 = max(r[0] + r[2] for r in mrects)
        y1 = max(r[1] + r[3] for r in mrects)
        dtop, dright = dashed_edge(gray, (x0, y0, x1, y1), W, H)
        gbox = (x0, dtop, dright - x0, y1 - dtop)
        ok, side = tg.put(g["sym"], gbox, font,
                          g.get("sides", ["above", "right_upper", "below"]), L)
        log.append((g["sym"], f"group/{side}", ok))
        for t in g.get("tagged", []):
            idx, msym = t[0], t[1]
            sides = [t[2]] if len(t) > 2 else ["left", "right", "below", "above"]
            ok, side = tg.put(msym, mrects[idx], font, sides, int(L * 0.7))
            log.append((msym, f"member/{side}", ok))

    # 단독 박스
    for item in spec.get("solo", []):
        fx, fy, sym = item[0], item[1], item[2]
        sides = ([item[3]] + ["above", "below", "right_upper", "right", "left", "above_left"]) if len(item) > 3 \
            else ["above", "below", "right_upper", "right", "left", "above_left"]
        r = match2(fx, fy)
        if r is None:
            log.append((sym, "solo", "MISS"))
            continue
        used.add(r)
        ok, side = tg.put(sym, r, font, sides, L)
        log.append((sym, f"solo/{side}", ok))

    pil.save(out)
    return log


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    args = ap.parse_args()
    cfg = json.load(open(args.config, encoding="utf-8-sig"))
    src_dir = cfg["src_dir"]
    out_dir = cfg["out_dir"]
    font_path = cfg.get("font_path", DEFAULT_FONT)
    os.makedirs(out_dir, exist_ok=True)

    any_forced = False
    for fig_no in sorted(cfg["figures"], key=lambda k: int(k)):
        log = process(fig_no, cfg["figures"][fig_no], src_dir, out_dir, font_path)
        bad = [l for l in log if l[2] is not True]
        if bad:
            any_forced = True
        print(f"도{fig_no}: {len(log)}개 부호 |", " ".join(f"{s}({m})" for s, m, _ in log),
              "| 문제:", bad if bad else "없음")
    print("완료:", out_dir)
    if any_forced:
        print("⚠ 강제 배치/MISS 항목 존재 — 해당 도면 육안 확인 필수")
    print("※ 태깅본 전수 육안 검증 생략 금지")


if __name__ == "__main__":
    main()
