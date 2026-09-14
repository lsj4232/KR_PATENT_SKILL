# -*- coding: utf-8 -*-
"""명세서 .docx에서 전체 텍스트를 추출한다.

사용법:
    python extract_docx_text.py <입력.docx> <출력.txt>

문단 단위로 개행하여 저장한다. 【청구항 N】 등 식별항목이 그대로 보존되므로
출력 파일을 Read/Grep 하여 청구항·발명 요지를 파악하면 된다.
"""
import sys, zipfile, re, html

def main():
    src, dst = sys.argv[1], sys.argv[2]
    z = zipfile.ZipFile(src)
    xml = z.read("word/document.xml").decode("utf-8")
    xml = re.sub(r"<w:p [^>]*>|<w:p>", "\n", xml)
    text = re.sub(r"<[^>]+>", "", xml)
    text = html.unescape(text)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"chars={len(text)} -> {dst}")

if __name__ == "__main__":
    main()
