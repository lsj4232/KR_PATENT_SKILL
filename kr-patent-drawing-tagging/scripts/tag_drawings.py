# -*- coding: utf-8 -*-
"""한국 특허 도면부호 태깅 엔진 (config 구동형)

사용법:
    python tag_drawings.py --config <config.json>

config.json 스키마:
{
  "src_dir": "원본 PNG 폴더",
  "out_dir": "태깅본 출력 폴더",
  "font_path": "C:\\Windows\\Fonts\\malgunbd.ttf",   // 선택
  "figures": {
    "1": {
      "file": "1.png",                                // 선택 (기본 "<번호>.png")
      "solo": [[0.082, 0.120, "210"], ...],           // 단독 박스 [fx, fy, 부호]
      "cyl": [[0.923, 0.167, "120"]],                 // 실린더 — 내부 하단 중앙
      "container": "140",                             // 최대 면적 박스 — 내부 우상단
      "groups": [                                     // 점선 그룹
        {"sym": "250, 251",
         "members": [[0.652, 0.32], [0.652, 0.52]],   // 멤버 locator (무부호)
         "tagged": [[0, "121"]]}                      // 예외적 멤버 태깅 [idx, 부호]
      ],
      "copy_only": false                              // true면 무수정 복사
    }
  }
}
좌표 fx/fy = 박스 중심의 (이미지 폭/높이) 대비 비율. 최근접 매칭이므로 근사값이면 충분.
"""
import argparse
import json
import os
import shutil
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

DEFAULT_FONT = r"C:\Windows\Fonts\malgunbd.ttf"


def detect_boxes(img):
    """솔리드 박스·실린더의 bounding rect 목록 (테두리 이중 컨투어 IoU 중복 제거)."""
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


class Tagger:
    """어두운 픽셀·기존 라벨과의 충돌을 감지하며 후보 위치에 부호를 배치."""

    def __init__(self, gray, draw, W, H):
        self.gray, self.draw, self.W, self.H = gray, draw, W, H
        self.drawn = []

    def free(self, px, py, tw, th, pad=6):
        x0, y0 = int(px - pad), int(py - pad)
        x1, y1 = int(px + tw + pad), int(py + th + pad)
        if x0 < 0 or y0 < 0 or x1 >= self.W or y1 >= self.H:
            return False
        if (self.gray[y0:y1, x0:x1] < 128).any():
            return False
        for (dx0, dy0, dx1, dy1) in self.drawn:
            if not (x1 < dx0 or dx1 < x0 or y1 < dy0 or dy1 < y0):
                return False
        return True

    def put(self, sym, candidates, font):
        tb = self.draw.textbbox((0, 0), sym, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        pos = None
        for (px, py) in candidates:
            if self.free(px, py - tb[1], tw, th):
                pos = (px, py - tb[1])
                break
        forced = pos is None
        if forced:
            px, py = candidates[-1]
            pos = (px, py - tb[1])
        self.draw.text(pos, sym, font=font, fill=(0, 0, 0))
        self.drawn.append((pos[0], pos[1], pos[0] + tw, pos[1] + th))
        return not forced


def process(fig_no, spec, src_dir, out_dir, font_path):
    src = os.path.join(src_dir, spec.get("file", f"{fig_no}.png"))
    out = os.path.join(out_dir, f"도{int(fig_no):02d}.png")

    if spec.get("copy_only"):
        shutil.copy(src, out)
        return [("(copy_only)", "copy", True)]

    img = cv2.imdecode(np.fromfile(src, dtype=np.uint8), cv2.IMREAD_COLOR)
    H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    rects = detect_boxes(img)
    pil = Image.open(src).convert("RGB")
    draw = ImageDraw.Draw(pil)
    tg = Tagger(gray, draw, W, H)
    used = set()
    log = []

    def font_for(h_box):
        fs = max(28, min(int(W / 90), int(h_box * 0.40)))
        return ImageFont.truetype(font_path, fs)

    # container: 최대 면적 박스 — 내부 우상단
    if spec.get("container"):
        r = max(rects, key=lambda q: q[2] * q[3])
        used.add(r)
        x, y, w, h = r
        font = font_for(200)
        tb = draw.textbbox((0, 0), spec["container"], font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        ok = tg.put(spec["container"],
                    [(x + w - tw - 20, y + 16), (x + w + 12, y + 4),
                     (x + w - tw - 20, y + h - th - 16)], font)
        log.append((spec["container"], "container", ok))

    # 실린더: 내부 하단 중앙
    for fx, fy, sym in spec.get("cyl", []):
        r = nearest(rects, used, W, H, fx, fy)
        used.add(r)
        x, y, w, h = r
        font = font_for(h)
        tb = draw.textbbox((0, 0), sym, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        ok = tg.put(sym, [(x + w / 2 - tw / 2, y + h - th - 12),
                          (x + w + 10, y + h / 2 - th / 2),
                          (x + w / 2 - tw / 2, y + h + 10)], font)
        log.append((sym, "cyl", ok))

    # 그룹: 멤버 union → 점선 테두리 추정 → 외부 우상단
    for g in spec.get("groups", []):
        mrects = []
        for fx, fy in g["members"]:
            r = nearest(rects, used, W, H, fx, fy)
            used.add(r)
            mrects.append(r)
        x0 = min(r[0] for r in mrects)
        y0 = min(r[1] for r in mrects)
        x1 = max(r[0] + r[2] for r in mrects)
        y1 = max(r[1] + r[3] for r in mrects)
        pad = int(W * 0.010)
        gx1, gy0 = x1 + pad + 18, max(0, y0 - int(H * 0.16))
        font = font_for(220)
        tb = draw.textbbox((0, 0), g["sym"], font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        ok = tg.put(g["sym"], [(gx1 + 14, gy0), (gx1 + 14, gy0 + th + 22),
                               (x1 + pad + 14, y1 + 16), (x0 - tw - 24, gy0)], font)
        log.append((g["sym"], "group", ok))
        for idx, msym in g.get("tagged", []):
            x, y, w, h = mrects[idx]
            mfont = font_for(h)
            mtb = draw.textbbox((0, 0), msym, font=mfont)
            mtw, mth = mtb[2] - mtb[0], mtb[3] - mtb[1]
            ok = tg.put(msym, [(x + w - mtw - 12, y + h / 2 - mth / 2),
                               (x + w - mtw - 10, y + h - mth - 6),
                               (x + w + 8, y + h / 2 - mth / 2),
                               (x + w - mtw, y - mth - 6)], mfont)
            log.append((msym, "member", ok))

    # 단독 박스: 충돌감지 폴백 체인
    for fx, fy, sym in spec.get("solo", []):
        r = nearest(rects, used, W, H, fx, fy)
        if r is None:
            log.append((sym, "solo", "MISS"))
            continue
        used.add(r)
        x, y, w, h = r
        font = font_for(h)
        tb = draw.textbbox((0, 0), sym, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        ok = tg.put(sym, [
            (x + w - tw - 14, y + h / 2 - th / 2),   # 내부 우측 중앙
            (x + w - tw - 12, y + h - th - 10),      # 내부 우하단
            (x + w - tw - 12, y + 10),               # 내부 우상단
            (x + w - tw, y - th - 10),               # 외부 상단 우측
            (x + w - tw, y + h + 10),                # 외부 하단 우측
            (x + w + 12, y + h / 2 - th / 2),        # 외부 우측
        ], font)
        log.append((sym, "solo", ok))

    pil.save(out)
    return log


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    args = ap.parse_args()
    cfg = json.load(open(args.config, encoding="utf-8-sig"))  # BOM 내성 (PS5.1 Out-File 대응)
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
        print(f"도{fig_no}: {len(log)}개 부호 | 문제:", bad if bad else "없음")
    print("완료:", out_dir)
    if any_forced:
        print("⚠ 강제 배치/MISS 항목 존재 — 해당 도면 육안 확인 필수")
    print("※ 자동 리포트는 매칭 품질만 보장 — 태깅본 전수 육안 검증을 생략하지 말 것")


if __name__ == "__main__":
    main()
