# -*- coding: utf-8 -*-
"""
docx2hlz  —  한글 워드(.docx) 특허 명세서 → 특허청 통합명세서작성기(NKEditor) .hlz 변환기

핵심 사실(리버스 엔지니어링 결과, 자세한 내용은 교훈.md 참조)
  * NKEditor 저장파일 .HLT 는 'HAN Lite' 독자 바이너리라 외부 생성 불가.
  * 실제로 편집기가 여닫는 .hlz 는 표준 ZIP =  <이름>.xml (KIPO application-body)
    + patNNNNN.<확장자> (도면 이미지).  → 이 스크립트는 .hlz 를 만든다.
  * XML 골격:
      <KIPO><PatentCAFDOC><description>
        <invention-title> <technical-field> <background-art>
        <summary-of-invention><tech-problem><tech-solution><advantageous-effects>
        <description-of-drawings> <description-of-embodiments>
      </description>
      <claims><claim num><claim-text>…<br/>…</claim-text></claim>…</claims>
      <abstract><summary><p><abstract-figure><figref num>
      <drawings><figure num><img he wi file img-format></figure>…</drawings>
      </PatentCAFDOC></KIPO>
  * <p num> 은 description 전체를 관통하는 4자리 일련번호(0001…). abstract 는 0001a…
  * <img he wi> 는 mm 단위 표시크기. docx 이미지 표시크기(EMU)/36000 = mm, 페이지에 맞게 캡.

사용법:
    python docx2hlz.py "명세서.docx"                # → output/명세서.hlz
    python docx2hlz.py "명세서.docx" -o 결과.hlz
"""
import sys, os, re, io, zipfile, argparse, hashlib
from docx import Document
from docx.oxml.ns import qn
from xml.sax.saxutils import escape

try:
    from PIL import Image
    HAVE_PIL = True
except Exception:
    HAVE_PIL = False

class _CP949ZipInfo(zipfile.ZipInfo):
    """구 특허청 편집기(MFC)는 zip 파일명을 CP949(ANSI)로 읽고 UTF-8 플래그를 모른다.
    Python 기본은 비ASCII 파일명에 UTF-8 플래그(0x800)를 세팅 → 편집기가 엔트리를
    못 찾아 압축해제 실패(.SGM not found). 그래서 CP949 바이트 + 플래그 미설정으로 기록."""
    def _encodeFilenameFlags(self):
        try:
            return self.filename.encode("ascii"), self.flag_bits & ~0x800
        except UnicodeEncodeError:
            return self.filename.encode("cp949", "replace"), self.flag_bits & ~0x800


def _cp949_zipinfo(name):
    zi = _CP949ZipInfo(name)
    zi.compress_type = zipfile.ZIP_DEFLATED
    zi.external_attr = 0o600 << 16
    return zi


EMU_PER_MM = 36000
# KIPO 도면 이미지 최대 크기(검증기 E-218): 가로 165mm × 세로 222mm 초과 금지.
# (실제 출원건 레퍼런스도 he 최대 ~221mm 로 이 한계에 맞춰져 있음)
PAGE_MAX_W_MM = 165
PAGE_MAX_H_MM = 222

# 도면 세로 흰 패딩(1도면=1페이지 강제)은 기본 OFF.
# 【도면】 머리글과 【도 1】이 같은 페이지에 있어야 하는데, he=222 패딩을 넣으면
# 도1이 다음 페이지로 밀리고 도면마다 상하 여백이 20%씩 생겨 보기 나쁘다.
# 여러 도면이 한 페이지에 뭉치는 것을 감수하고서라도 패딩은 넣지 않는다.
# 굳이 필요하면 --pad-page 로 켠다.
PAD_TO_PAGE = False

# ── 워드 【식별항목】 → 내부 섹션 키 매핑 ───────────────────────────────
SECTION_MAP = {
    "발명의 명칭": "title",
    "기술분야": "technical-field",
    "발명의 배경이 되는 기술": "background-art",
    "배경기술": "background-art",
    "해결하고자 하는 과제": "tech-problem",
    "발명이 해결하고자 하는 과제": "tech-problem",
    "과제의 해결 수단": "tech-solution",
    "발명의 효과": "advantageous-effects",
    "도면의 간단한 설명": "description-of-drawings",
    "발명을 실시하기 위한 구체적인 내용": "description-of-embodiments",
    "청구범위": "claims",
    "요약": "abstract-summary",
    "대표도": "abstract-figure",
    "도면": "drawings",
}
# 무시(래퍼)
IGNORE_TAGS = {"발명의 설명", "발명의 내용", "요약서"}

TAG_RE = re.compile(r"^【\s*(.+?)\s*】\s*(.*)$")
CLAIM_RE = re.compile(r"^【\s*청구항\s*(\d+)\s*】")
FIG_RE = re.compile(r"^【\s*도\s*면?\s*(\d+)\s*】")
# 【1. 용어의 정의…】 처럼 숫자로 시작하는 이해편의용 소목차(챕터 제목)
CHAPTER_HEAD_RE = re.compile(r"^\d+[A-Za-z]?\s*[.)]\s*\S")


def parse_tag(text):
    """'【기술분야】' → ('기술분야','') ; 일반문단 → (None, text)"""
    m = TAG_RE.match(text.strip())
    if not m:
        return None, text
    return m.group(1).strip(), m.group(2).strip()


MEMO_RE = re.compile(r"//.*?//")

def strip_memo(text):
    """작성자 메모 //…// 제거. 예) '【청구항 1】//멀티모달…//' 의 rest '//멀티모달…//' → ''"""
    if not text:
        return text
    text = MEMO_RE.sub("", text)          # //…// 쌍 제거
    if "//" in text:                       # 짝 안 맞는 잔여 // 이후 절단
        text = text.split("//", 1)[0]
    return text.strip()


def is_pure_memo(text):
    """문단 전체가 //…// 메모인지"""
    t = text.strip()
    return t.startswith("//") and t.endswith("//") and len(t) >= 4


def blip_extent_mm(blip):
    """blip 요소에서 조상 wp:inline/anchor 의 extent(cx,cy EMU)를 찾아 (wi_mm, he_mm) 반환."""
    node = blip
    for _ in range(8):
        node = node.getparent()
        if node is None:
            break
        local = node.tag.split('}')[-1]
        if local in ("inline", "anchor"):
            ext = node.find(qn('wp:extent'))
            if ext is not None:
                cx = int(ext.get('cx', '0')); cy = int(ext.get('cy', '0'))
                if cx and cy:
                    return cx / EMU_PER_MM, cy / EMU_PER_MM
            break
    return None, None


def fit_page(wi, he, fill=False):
    """mm 크기를 페이지 인쇄영역에 종횡비 유지하며 맞춤.
    fill=False: 넘칠 때만 축소(캡).  fill=True: 항상 페이지에 꽉 차게(작으면 확대) —
      도면은 fill=True 로 크게 만들어야 편집기가 한 도면당 한 페이지로 배치한다."""
    if not wi or not he:
        return None, None
    if fill:
        s = min(PAGE_MAX_W_MM / wi, PAGE_MAX_H_MM / he)   # contain: 확대/축소 모두
    else:
        s = 1.0
        if wi > PAGE_MAX_W_MM:
            s = min(s, PAGE_MAX_W_MM / wi)
        if he * s > PAGE_MAX_H_MM:
            s = min(s, PAGE_MAX_H_MM / he)
    # 반올림이 상한을 넘지 않도록 최종 클램프 (E-218 방지)
    w = min(PAGE_MAX_W_MM, max(1, round(wi * s)))
    h = min(PAGE_MAX_H_MM, max(1, round(he * s)))
    return w, h


def pad_drawing_to_page(meta):
    """가로로 긴 도면(표시 he < 222mm)을 흰 캔버스로 세로 패딩해 표시 he=222 로 강제.

    스키마에 페이지나눔 마크업이 없어 세로가 작은 도면 2장은 편집기가 한 페이지에
    흘려 담는다(예 71+148=219 ≤ 222). 캔버스 자체를 페이지 비율로 키워야
    물리적으로 한 도면 = 한 페이지가 보장된다. 내용은 수직 중앙 배치, 종횡비 무손상."""
    if not PAD_TO_PAGE:
        return
    if not HAVE_PIL or not meta.get('he') or not meta.get('wi'):
        return
    if meta['he'] >= PAGE_MAX_H_MM:
        return
    try:
        im = Image.open(io.BytesIO(meta['bytes']))
        im.load()
        if im.mode not in ("1", "L", "RGB"):
            im = im.convert("RGB")
        w_px, h_px = im.size
        new_h_px = round(h_px * PAGE_MAX_H_MM / meta['he'])
        if new_h_px <= h_px:
            return
        white = 1 if im.mode == "1" else (255 if im.mode == "L" else (255, 255, 255))
        canvas = Image.new(im.mode, (w_px, new_h_px), white)
        canvas.paste(im, (0, (new_h_px - h_px) // 2))
        buf = io.BytesIO()
        dpi = im.info.get('dpi')
        kw = dict(dpi=dpi) if dpi else {}
        if meta['ext'] == "tif":
            comp = "group4" if canvas.mode == "1" else "tiff_adobe_deflate"
            canvas.save(buf, format="TIFF", compression=comp, **kw)
        else:
            canvas.save(buf, format="JPEG", quality=95, **kw)
        meta['bytes'] = buf.getvalue()
        meta['he'] = PAGE_MAX_H_MM
    except Exception as e:
        print(f"    [경고] 도면 세로 패딩 실패: {e} → 원본 유지(페이지 뭉침 가능)")


def img_size_from_bytes(data):
    """PIL 로 픽셀·DPI 읽어 mm 추정(폴백용)."""
    if not HAVE_PIL:
        return None, None
    try:
        im = Image.open(io.BytesIO(data))
        px = im.size
        dpi = im.info.get('dpi', (96, 96))
        dx = dpi[0] or 96; dy = dpi[1] or 96
        return px[0] / dx * 25.4, px[1] / dy * 25.4
    except Exception:
        return None, None


def collect(docx_path):
    """docx 를 순회하며 섹션별 문단/이미지를 구조화."""
    doc = Document(docx_path)
    rels = doc.part.rels
    zf = zipfile.ZipFile(docx_path)

    # rId → 이미지 바이트/확장자 (KIPO 허용 img-format = jpg|tif 로 정규화)
    #   DTD(application-body): img-format (jpg | tif | st33 | st35) #REQUIRED
    #   → tiff=tif 로, png/bmp/gif 등은 jpg 로 재인코딩.
    def img_bytes(rid):
        tref = rels[rid].target_ref
        arc = tref if tref.startswith("word/") else "word/" + tref
        data = zf.read(arc)
        ext = os.path.splitext(tref)[1].lstrip('.').lower()
        if ext in ("jpeg", "jpe"):
            ext = "jpg"
        if ext in ("tiff",):
            ext = "tif"
        if ext not in ("jpg", "tif"):
            # KIPO 미허용 포맷 → jpg 로 변환(투명 배경은 흰색으로 평탄화)
            if HAVE_PIL:
                try:
                    im = Image.open(io.BytesIO(data))
                    if im.mode in ("RGBA", "LA", "P"):
                        bg = Image.new("RGB", im.size, (255, 255, 255))
                        im = im.convert("RGBA")
                        bg.paste(im, mask=im.split()[-1])
                        im = bg
                    else:
                        im = im.convert("RGB")
                    buf = io.BytesIO()
                    im.save(buf, format="JPEG", quality=95, dpi=(600, 600))
                    data = buf.getvalue()
                    ext = "jpg"
                except Exception as e:
                    print(f"    [경고] 이미지 변환 실패({tref}): {e} → 원본 유지")
            else:
                print(f"    [경고] Pillow 없음 → {tref} 포맷({ext}) 그대로 (KIPO 미허용 가능)")
        return data, ext

    sections = {}   # key -> list of 문단(str)  또는 claims/drawings 특수구조
    claims = []     # [(num, [lines...])]
    drawings = []   # [(fignum, {bytes,ext,wi,he})]
    order_imgs = [] # (rid, wi_mm, he_mm) 문서순
    cur = None
    cur_claim = None
    cur_fig = None

    body = doc.element.body
    # 문단 단위로 순회하되, 문단 내부 blip 도 처리
    for p in doc.paragraphs:
        text = p.text.strip()
        # 이 문단에 이미지가 있나?
        blips = p._p.findall('.//' + qn('a:blip'))

        tagname, rest = parse_tag(text) if text else (None, "")

        if tagname is not None:
            if tagname in IGNORE_TAGS:
                cur = None
                continue
            cm = CLAIM_RE.match(text)
            fm = FIG_RE.match(text)
            if cm:  # 【청구항 N】
                cur = "claims"
                cur_claim = [int(cm.group(1)), []]
                claims.append(cur_claim)
                rest = strip_memo(rest)          # 【청구항 N】//작성자 메모// 제거
                if rest:
                    cur_claim[1].append(rest)
                continue
            if fm and cur == "drawings":  # 【도면 N】
                cur_fig = int(fm.group(1))
                continue
            key = SECTION_MAP.get(tagname)
            if key == "drawings":
                cur = "drawings"; cur_fig = None; continue
            if key:
                cur = key
                sections.setdefault(key, [])
                if key == "title" and rest:
                    sections[key].append(rest)
                continue
            # 【N. …】 형태의 이해편의용 소목차(챕터 제목)는 제거 — 본문에 넣지 않는다.
            if CHAPTER_HEAD_RE.match(tagname):
                continue
            # 그 밖의 알 수 없는 【…】 → 본문 문단으로 흡수
            if cur in ("description-of-embodiments", "technical-field",
                       "background-art", "tech-problem", "tech-solution",
                       "advantageous-effects"):
                sections.setdefault(cur, []).append((tagname + (" " + rest if rest else "")).strip())
            continue

        # ── 일반 문단/이미지 ──
        if cur == "claims" and cur_claim is not None:
            if text and not is_pure_memo(text):
                cur_claim[1].append(strip_memo(text))
            continue

        if cur == "drawings":
            for b in blips:
                rid = b.get(qn('r:embed')) or b.get(qn('r:link'))
                if not rid:
                    continue
                wi, he = blip_extent_mm(b)
                data, ext = img_bytes(rid)
                if not wi:
                    wi, he = img_size_from_bytes(data)
                wi, he = fit_page(wi, he, fill=True)   # 도면은 페이지에 꽉 차게 → 한 장/페이지
                fignum = cur_fig if cur_fig is not None else (len(drawings) + 1)
                meta = dict(bytes=data, ext=ext, wi=wi, he=he)
                pad_drawing_to_page(meta)              # 세로 부족분 흰 패딩 → 1도면=1페이지 강제
                drawings.append([fignum, meta])
            continue

        # description 계열 본문
        if cur in ("title", "technical-field", "background-art", "tech-problem",
                   "tech-solution", "advantageous-effects",
                   "description-of-drawings", "description-of-embodiments",
                   "abstract-summary"):
            if text:
                sections.setdefault(cur, []).append(text)
            # 본문 내 인라인 이미지(임베디드) → embodiments 인라인 처리
            if blips and cur == "description-of-embodiments":
                for b in blips:
                    rid = b.get(qn('r:embed')) or b.get(qn('r:link'))
                    if rid:
                        wi, he = blip_extent_mm(b)
                        data, ext = img_bytes(rid)
                        if not wi:
                            wi, he = img_size_from_bytes(data)
                        wi, he = fit_page(wi, he)
                        sections.setdefault("_inline_imgs", []).append(dict(bytes=data, ext=ext, wi=wi, he=he))
            continue

        if cur == "abstract-figure":
            if text:
                sections.setdefault("abstract-figure", []).append(text)
            continue

    return sections, claims, drawings


def build_xml(sections, claims, drawings, title_fallback="명세서"):
    pnum = [0]
    def P(text):
        pnum[0] += 1
        return f'<p num="{pnum[0]:04d}">{escape(text)}</p>'

    out = []
    out.append('<?xml version="1.0" encoding="UTF-8"?>')
    # documentID: 제목 해시 기반 결정적 숫자
    title = (sections.get("title") or [title_fallback])[0]
    did = int(hashlib.md5(title.encode("utf-8")).hexdigest()[:8], 16)
    total_chars = sum(len(x) for v in sections.values() for x in v if isinstance(x, str))
    pagecount = max(1, round(total_chars / 1600) + len(drawings))
    out.append(f'<KIPO keapsVersion="5.6" editorKind="K" pageCount="{pagecount}" '
               f'imgApply="N" xmlns="http://www.kipo.go.kr">')
    out.append(f'<PatentCAFDOC docflag="1.0" documentID="{did}">')
    out.append('<description>')
    out.append(f'<invention-title>{escape(title)}</invention-title>')

    def section_paras(key):
        return [x for x in sections.get(key, []) if isinstance(x, str)]

    # technical-field
    out.append('<technical-field>')
    for t in section_paras("technical-field"):
        out.append(P(t))
    out.append('</technical-field>')

    # background-art
    out.append('<background-art>')
    for t in section_paras("background-art"):
        out.append(P(t))
    out.append('</background-art>')

    # summary-of-invention
    out.append('<summary-of-invention>')
    out.append('<tech-problem>')
    for t in section_paras("tech-problem"):
        out.append(P(t))
    out.append('</tech-problem>')
    out.append('<tech-solution>')
    for t in section_paras("tech-solution"):
        out.append(P(t))
    out.append('</tech-solution>')
    out.append('<advantageous-effects>')
    for t in section_paras("advantageous-effects"):
        out.append(P(t))
    out.append('</advantageous-effects>')
    out.append('</summary-of-invention>')

    # description-of-drawings  (도 N 설명들을 <br/> 로 이어 한 문단)
    dod = section_paras("description-of-drawings")
    out.append('<description-of-drawings>')
    if dod:
        pnum[0] += 1
        body = "<br/>\n".join(escape(t) for t in dod)
        out.append(f'<p num="{pnum[0]:04d}">{body}</p>')
    out.append('</description-of-drawings>')

    # description-of-embodiments
    out.append('<description-of-embodiments>')
    for t in section_paras("description-of-embodiments"):
        out.append(P(t))
    # 인라인 이미지가 있으면 말미에 붙임
    inl = sections.get("_inline_imgs", [])
    out.append('</description-of-embodiments>')
    out.append('</description>')

    # claims
    out.append('<claims>')
    for num, lines in sorted(claims, key=lambda c: c[0]):
        body = "<br/>\n".join(escape(x) for x in lines)
        out.append(f'<claim num="{num}"><claim-text>{body}</claim-text></claim>')
    out.append('</claims>')

    # abstract
    out.append('<abstract>')
    out.append('<summary>')
    an = [0]
    def PA(text):
        an[0] += 1
        return f'<p num="{an[0]:04d}a">{escape(text)}</p>'
    for t in section_paras("abstract-summary"):
        out.append(PA(t))
    out.append('</summary>')
    # 대표도
    figref = None
    for t in sections.get("abstract-figure", []):
        m = re.search(r"(\d+)", t)
        if m:
            figref = int(m.group(1)); break
    if figref is not None:
        an[0] += 1
        out.append('<abstract-figure>')
        out.append(f'<p num="{an[0]:04d}a"><figref num="{figref}"/></p>')
        out.append('</abstract-figure>')
    out.append('</abstract>')

    # drawings
    out.append('<drawings>')
    for i, (num, meta) in enumerate(drawings, 1):
        fname = f"pat{i:05d}.{meta['ext']}"
        meta['_fname'] = fname
        wi = meta['wi'] or 150; he = meta['he'] or 100
        fmt = meta['ext']
        out.append(f'<figure num="{num}"><img id="i{i:04d}" he="{he}" wi="{wi}" '
                   f'file="{fname}" img-format="{fmt}"/></figure>')
    out.append('</drawings>')

    out.append('</PatentCAFDOC>')
    out.append('</KIPO>')
    return "\n".join(out)


def convert(docx_path, out_path=None):
    base = os.path.splitext(os.path.basename(docx_path))[0]
    if out_path is None:
        # 기본: 입력 docx 와 같은 폴더에 <이름>.hlz 저장
        out_path = os.path.join(os.path.dirname(os.path.abspath(docx_path)), base + ".hlz")

    sections, claims, drawings = collect(docx_path)
    xml = build_xml(sections, claims, drawings, title_fallback=base)

    xml_name = base + ".xml"
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        zi = _cp949_zipinfo(xml_name)
        z.writestr(zi, xml.encode("utf-8"))
        for i, (num, meta) in enumerate(drawings, 1):
            fn = meta.get('_fname', f"pat{i:05d}.{meta['ext']}")
            z.writestr(_cp949_zipinfo(fn), meta['bytes'])

    # 요약 리포트
    rep = {
        "제목": (sections.get("title") or [base])[0],
        "청구항 수": len(claims),
        "도면 수": len(drawings),
        "본문섹션": {k: len([x for x in v if isinstance(x, str)])
                    for k, v in sections.items() if not k.startswith("_")},
        "출력": out_path,
    }
    return rep


def main():
    ap = argparse.ArgumentParser(description="워드 명세서 → 통합명세서작성기 .hlz 변환기")
    ap.add_argument("docx", help="입력 .docx 경로")
    ap.add_argument("-o", "--out", help="출력 .hlz 경로(기본 output/<이름>.hlz)")
    ap.add_argument("--pad-page", action="store_true",
                    help="도면을 흰 패딩으로 he=222 강제(1도면=1페이지). "
                         "기본 OFF — 【도면】과 【도 1】이 같은 페이지에 와야 하므로")
    args = ap.parse_args()
    if args.pad_page:
        globals()['PAD_TO_PAGE'] = True
    if not os.path.exists(args.docx):
        print("[오류] 파일 없음:", args.docx); sys.exit(1)
    rep = convert(args.docx, args.out)
    print("=" * 60)
    print(" 변환 완료")
    print("=" * 60)
    print(f"  제목      : {rep['제목']}")
    print(f"  청구항 수 : {rep['청구항 수']}")
    print(f"  도면 수   : {rep['도면 수']}")
    print(f"  본문섹션  : {rep['본문섹션']}")
    print(f"  → 출력    : {rep['출력']}")
    print("\n  NKEditor에서 [파일 > 열기]로 위 .hlz 를 여세요.")


if __name__ == "__main__":
    main()
