#!/usr/bin/env python3
"""kr-patent-navigation-pane — add Word Navigation Pane outline to a Korean patent .docx.

Inserts <w:outlineLvl w:val="N"/> into each section-header paragraph (where the entire
paragraph text is 【...】) so the Word Navigation Pane works. Visual styling is untouched
(no pStyle assignment, no styles.xml modification).

Usage:
    python apply_navigation_pane.py <path-to.docx> [--no-backup]
"""
import argparse
import os
import re
import shutil
import sys
import tempfile
import zipfile


def outline_level(title: str):
    """Map a section-header title (text inside 【...】) to an outline level (0-3).

    Returns None for unrecognized titles — those paragraphs are skipped.
    Mirrors the Korean patent specification template hierarchy.
    """
    t = title.strip()
    if t in ("발명의 설명", "청구범위", "요약서", "도면"):
        return 0
    if t in (
        "발명의 명칭", "기술분야", "발명의 배경이 되는 기술", "발명의 내용",
        "도면의 간단한 설명", "발명을 실시하기 위한 구체적인 내용",
        "요약", "대표도",
    ):
        return 1
    if re.fullmatch(r"청구항\s*\d+", t):
        return 1
    if re.fullmatch(r"도면\s*\d+", t):
        return 1
    if t in ("해결하고자 하는 과제", "과제의 해결 수단", "발명의 효과", "본 발명 시작"):
        return 2
    if re.match(r"^\d+\.\s", t):
        return 2
    if re.match(r"^\d+-\d+\.\s", t):
        return 3
    return None


P_RE = re.compile(r"<w:p\b[^>]*>.*?</w:p>", re.DOTALL)
T_RE = re.compile(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>", re.DOTALL)
HDR_RE = re.compile(r"^\s*【([^】]+)】\s*$")


def process_document_xml(xml: str):
    applied = []

    def repl(m):
        block = m.group(0)
        full_text = "".join(T_RE.findall(block))
        h = HDR_RE.match(full_text)
        if not h:
            return block
        title = h.group(1)
        lvl = outline_level(title)
        if lvl is None:
            return block
        applied.append((lvl, title))

        insert = f'<w:outlineLvl w:val="{lvl}"/>'
        pPr = re.search(r"<w:pPr>(.*?)</w:pPr>", block, re.DOTALL)
        if pPr:
            # idempotent: strip any prior outlineLvl, then re-insert with correct value
            inner = re.sub(r"<w:outlineLvl[^/]*/>", "", pPr.group(1))
            if "<w:rPr>" in inner:
                inner = inner.replace("<w:rPr>", insert + "<w:rPr>", 1)
            else:
                inner = inner + insert
            return block.replace(pPr.group(0), f"<w:pPr>{inner}</w:pPr>", 1)
        # no <w:pPr> present — create one right after opening <w:p ...>
        return re.sub(
            r"^(<w:p\b[^>]*>)",
            r"\1" + f"<w:pPr>{insert}</w:pPr>",
            block,
            count=1,
        )

    new_xml = P_RE.sub(repl, xml)
    return new_xml, applied


def make_backup_path(src: str) -> str:
    base, ext = os.path.splitext(src)
    bak = f"{base}_원본백업{ext}"
    i = 1
    while os.path.exists(bak):
        bak = f"{base}_원본백업({i}){ext}"
        i += 1
    return bak


def repackage_docx(src_dir: str, out_path: str) -> None:
    out_tmp = out_path + ".tmp"
    if os.path.exists(out_tmp):
        os.remove(out_tmp)
    CT = "[Content_Types].xml"
    with zipfile.ZipFile(out_tmp, "w", zipfile.ZIP_DEFLATED) as zf:
        ct_full = os.path.join(src_dir, CT)
        if os.path.exists(ct_full):
            zf.write(ct_full, CT)
        for root, _, files in os.walk(src_dir):
            for name in files:
                full = os.path.join(root, name)
                rel = os.path.relpath(full, src_dir).replace("\\", "/")
                if rel == CT:
                    continue
                zf.write(full, rel)
    shutil.move(out_tmp, out_path)


def main():
    ap = argparse.ArgumentParser(
        description="Add Word Navigation Pane outline to a Korean patent .docx "
                    "(visual styling untouched).",
    )
    ap.add_argument("docx", help="Path to the .docx file (modified in place).")
    ap.add_argument("--no-backup", action="store_true",
                    help="Skip creating *_원본백업.docx (not recommended).")
    args = ap.parse_args()

    src = os.path.abspath(args.docx)
    if not os.path.exists(src):
        sys.exit(f"File not found: {src}")
    if not src.lower().endswith(".docx"):
        sys.exit("Only .docx files are supported.")

    # backup
    if not args.no_backup:
        bak = make_backup_path(src)
        shutil.copy2(src, bak)
        print(f"Backup: {bak}")

    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(src, "r") as zf:
            zf.extractall(tmp)
        doc_path = os.path.join(tmp, "word", "document.xml")
        if not os.path.exists(doc_path):
            sys.exit("word/document.xml not found — is this a valid .docx?")
        with open(doc_path, "r", encoding="utf-8") as f:
            xml = f.read()
        new_xml, applied = process_document_xml(xml)
        with open(doc_path, "w", encoding="utf-8", newline="") as f:
            f.write(new_xml)
        repackage_docx(tmp, src)

    if applied:
        print(f"\nApplied outlineLvl to {len(applied)} paragraph(s):")
        for lvl, title in applied:
            indent = "  " * lvl
            print(f"  L{lvl}  {indent}【{title}】")
    else:
        print("\nNo section headers matched — file unchanged in content (re-packaged).")
    print(f"\nWrote: {src}")


if __name__ == "__main__":
    main()
