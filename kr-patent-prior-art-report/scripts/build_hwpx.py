# -*- coding: utf-8 -*-
"""우선심사신청설명서 hwpx 빌더 (범용).

템플릿 hwpx는 [1~4페이지: 기존 건 예시] + [5~8페이지: 1~4페이지의 복제본] 구조라야 한다.
이 스크립트는 '두 번째 복제본'(문서 후반부)의 다음 요소를 config JSON 값으로 교체한다.

  - 【검색어】 / 【검색IPC】 행
  - 【검색결과】 4개 항목
  - 【선행기술과의 대비설명】 표의 데이터 행 4개 (청구항/문헌명/유사점/차이점/대비판단)
  - 【우선심사 신청이유】 1번 문단 (출원번호·명칭·출원일)

대상 위치는 인덱스 하드코딩 없이 '마지막 출현' 기준으로 동적 탐색하므로,
같은 구조의 다른 템플릿에도 재사용 가능하다. 글자 스타일(charPrIDRef)은
교체 전 기존 런에서 읽어와 재사용한다(차이점 칸의 밑줄·강조 포함).

사용법:
    python build_hwpx.py <config.json>

config.json 스키마는 스킬의 references/config_example.json 참조.
"""
import sys, json, re, zipfile
import xml.etree.ElementTree as ET

HPNS = "http://www.hancom.co.kr/hwpml/2011/paragraph"
HP = "{%s}" % HPNS


def textof(el):
    return "".join(t.text or "" for t in el.iter(HP + "t"))


def strip_lineseg(p):
    for lsa in p.findall(HP + "linesegarray"):
        p.remove(lsa)


def set_para(p, segments):
    """문단 p의 모든 런을 [(charPrID, text), ...] 로 교체."""
    for run in p.findall(HP + "run"):
        p.remove(run)
    strip_lineseg(p)
    for chid, txt in segments:
        run = ET.SubElement(p, HP + "run", {"charPrIDRef": chid})
        ET.SubElement(run, HP + "t").text = txt


def cell_styles(tc):
    """셀 안 런들의 charPrIDRef를 등장 순서대로 (중복 제거) 반환."""
    seen = []
    for run in tc.iter(HP + "run"):
        c = run.get("charPrIDRef")
        if c not in seen:
            seen.append(c)
    return seen or ["0"]


def set_cell(tc, paras):
    """셀 subList의 문단들을 paras(런 세그먼트 리스트의 리스트)로 재구성."""
    sub = tc.find(HP + "subList")
    olds = sub.findall(HP + "p")
    attrib = dict(olds[0].attrib)
    attrib["id"] = "2147483648"
    for op in olds:
        sub.remove(op)
    for segs in paras:
        p = ET.SubElement(sub, HP + "p", attrib)
        for chid, txt in segs:
            run = ET.SubElement(p, HP + "run", {"charPrIDRef": chid})
            ET.SubElement(run, HP + "t").text = txt


def last_index(root, predicate):
    idx = -1
    for i, p in enumerate(root):
        if predicate(textof(p)):
            idx = i
    if idx < 0:
        raise SystemExit("템플릿에서 대상 문단을 찾지 못했습니다: " + predicate.__doc__)
    return idx


def first_run_style(p, default="0"):
    r = p.find(HP + "run")
    return r.get("charPrIDRef") if r is not None else default


def drop_leading_example(root):
    """앞부분(참조용 예시 건)을 삭제하여 최종본을 두 번째 복사본만 남긴다.

    템플릿은 [예시 건] + [실제 기입한 복사본]으로 '우선심사신청설명서' 제목 문단이
    2번 등장한다. 두 번째 제목 문단부터를 남기고 그 앞을 전부 제거한다.
    문서 구역 설정(secPr) 및 단 설정(ctrl/colPr)은 최초 문단의 첫 run에만 존재하므로,
    삭제 전에 이를 새 첫 문단의 run 맨 앞으로 이동시킨다(안 하면 문서가 깨짐).
    반환: 삭제 수행 여부(복사본 구조가 아니면 False, 원본 유지).
    """
    titles = [i for i, p in enumerate(root) if textof(p).strip() == "우선심사신청설명서"]
    if len(titles) < 2:
        return False
    start = titles[-1]
    src_run = root[0].find(HP + "run")
    controls = [k for k in list(src_run) if k.tag in (HP + "secPr", HP + "ctrl")]
    tgt_run = root[start].find(HP + "run")
    if tgt_run is None:
        tgt_run = ET.SubElement(root[start], HP + "run", {"charPrIDRef": "7"})
    for off, c in enumerate(controls):
        src_run.remove(c)
        tgt_run.insert(off, c)
    root[start].set("pageBreak", "0")
    for p in list(root)[:start]:
        root.remove(p)
    return True


def fill_row(tr, row):
    """대비설명 표 데이터 행 1개를 채운다. 셀 5개: 청구항/문헌명/유사점/차이점/대비판단."""
    cells = tr.findall(HP + "tc")
    if len(cells) != 5:
        raise SystemExit(f"데이터 행 셀 수가 5가 아님: {len(cells)}")
    s_claim = cell_styles(cells[0])[0]
    s_doc = cell_styles(cells[1])[0]
    diff_styles = cell_styles(cells[3])
    s_plain = diff_styles[0]
    s_emph = diff_styles[1] if len(diff_styles) > 1 else s_plain
    s_sim = cell_styles(cells[2])[0]
    s_judge = cell_styles(cells[4])[0]

    set_cell(cells[0], [[(s_claim, row["claims"])]])
    set_cell(cells[1], [[(s_doc, row["doc_name"])], [(s_doc, row["doc_ref"])]])
    set_cell(cells[2], [[(s_sim, row["similarity"])]])
    set_cell(cells[3], [
        [(s_plain, row["diff_intro"]), (s_emph, row["diff_emph1"]), (s_plain, "인 반면에,")],
        [(s_plain, row["diff_pre2"]), (s_emph, row["diff_emph2"]), (s_plain, row.get("diff_tail", "임"))],
    ])
    set_cell(cells[4], [[(s_judge, row["judgement"])]])


def main():
    cfg = json.load(open(sys.argv[1], encoding="utf-8"))
    z = zipfile.ZipFile(cfg["template"])
    raw = z.read("Contents/section0.xml").decode("utf-8")
    for pfx, uri in re.findall(r'xmlns:([\w\d]+)="([^"]+)"', raw[:2000]):
        ET.register_namespace(pfx, uri)
    root = ET.fromstring(raw)

    # ---- 검색어 / IPC (마지막 출현 = 두 번째 복제본) ----
    def is_kw(t):
        """【검색어】"""
        return t.strip().startswith("【검색어】")
    def is_ipc(t):
        """【검색IPC】"""
        return t.strip().startswith("【검색IPC】")
    p_kw = root[last_index(root, is_kw)]
    set_para(p_kw, [(first_run_style(p_kw, "6"), " 【검색어】" + cfg["search_keywords"])])
    p_ipc = root[last_index(root, is_ipc)]
    runs = p_ipc.findall(HP + "run")
    label_style = runs[0].get("charPrIDRef") if runs else "6"
    value_style = runs[1].get("charPrIDRef") if len(runs) > 1 else label_style
    set_para(p_ipc, [(label_style, " 【검색IPC】"), (value_style, cfg["search_ipc"])])

    # ---- 검색결과 4항목: 마지막 【검색결과】 마커 뒤의 'N.' 문단 4개 ----
    def is_marker(t):
        """【검색결과】"""
        return t.strip().startswith("【검색결과】")
    m = last_index(root, is_marker)
    targets = []
    for i in range(m + 1, len(root)):
        t = textof(root[i]).strip()
        if re.match(r"^\d\.", t):
            targets.append(i)
        if len(targets) == 4:
            break
    if len(targets) != 4:
        raise SystemExit(f"검색결과 4개 항목을 찾지 못함: {len(targets)}개")
    for i, line in zip(targets, cfg["results"]):
        p = root[i]
        set_para(p, [(first_run_style(p, "6"), "  " + line.strip())])

    # ---- 대비설명 표: tbl 포함 문단 중 마지막 2개 ----
    tbl_paras = [p for p in root if p.find(".//" + HP + "tbl") is not None]
    if len(tbl_paras) < 2:
        raise SystemExit("대비설명 표(tbl 문단 2개)를 찾지 못함")
    data_rows = []
    for tp in tbl_paras[-2:]:
        tbl = tp.find(".//" + HP + "tbl")
        for tr in tbl.findall(HP + "tr"):
            cells = tr.findall(HP + "tc")
            head = textof(cells[0]).strip() if cells else ""
            if len(cells) == 5 and head not in ("청구항", "유사점", "대비 설명"):
                data_rows.append(tr)
    if len(data_rows) != 4:
        raise SystemExit(f"표 데이터 행이 4개가 아님: {len(data_rows)}개")
    for tr, row in zip(data_rows, cfg["rows"]):
        fill_row(tr, row)

    # ---- 신청이유 1번 문단 ----
    def is_reason(t):
        """1. 우선심사 신청의 대상인"""
        return t.strip().startswith("1. 우선심사 신청의 대상인")
    p_r = root[last_index(root, is_reason)]
    set_para(p_r, [(first_run_style(p_r, "10"), cfg["reason_paragraph"])])

    # ---- 앞 예시 페이지 삭제 (기본 활성; 최종본은 4페이지 이내) ----
    if cfg.get("drop_example", True):
        dropped = drop_leading_example(root)
        print("leading example dropped:", dropped)

    # ---- 대비표 데이터 셀 폰트 조정 (선택; 표가 페이지를 넘길 때 축소) ----
    # table_font_height: 1/100 pt 단위. 예 900=9pt. 기본 유지(템플릿 값 1100).
    hdr_xml = None
    tfh = cfg.get("table_font_height")
    if tfh:
        hdr_xml = z.read("Contents/header.xml").decode("utf-8")
        for cid in ("17", "18"):  # 17=유사점/차이점/대비판단 일반, 18=차이점 강조
            hdr_xml = re.sub(
                r'(<hh:charPr id="%s" height=")\d+(")' % cid,
                r"\g<1>%d\g<2>" % tfh, hdr_xml)

    # ---- 직렬화: 원본 루트 시작 태그(전체 xmlns 선언) 복원 ----
    body = ET.tostring(root, encoding="unicode")
    orig_start = raw[raw.index("<hs:sec"):raw.index(">", raw.index("<hs:sec")) + 1]
    new_start = body[body.index("<hs:sec"):body.index(">", body.index("<hs:sec")) + 1]
    body = body.replace(new_start, orig_start, 1)
    xml_out = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' + body

    # writestr에는 ZipInfo가 아닌 파일명(str)을 넘긴다 — ZipInfo를 재사용하면
    # header_offset이 원본 값으로 남아 파이썬 zipfile 재읽기 시 Overlapped 에러 발생.
    zout = zipfile.ZipFile(cfg["output"], "w")
    for item in z.infolist():
        data = z.read(item.filename)
        if item.filename == "Contents/section0.xml":
            data = xml_out.encode("utf-8")
        elif item.filename == "Contents/header.xml" and hdr_xml is not None:
            data = hdr_xml.encode("utf-8")
        comp = zipfile.ZIP_STORED if item.filename == "mimetype" else zipfile.ZIP_DEFLATED
        zout.writestr(item.filename, data, compress_type=comp)
    zout.close()

    # 재파싱 검증
    ET.fromstring(zipfile.ZipFile(cfg["output"]).read("Contents/section0.xml").decode("utf-8"))
    print("written + xml valid:", cfg["output"])


if __name__ == "__main__":
    main()
