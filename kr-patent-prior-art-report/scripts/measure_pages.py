# -*- coding: utf-8 -*-
"""hwpx의 실제 렌더링 페이지 수를 한/글(한컴오피스) COM으로 측정한다.

한컴오피스가 설치된 Windows에서만 동작한다(HWPFrame.HwpObject ProgID).
pageBreak 개수로 추정하면 표가 페이지를 넘길 때 틀리므로, 최종 검증은 이 도구로 한다.

사용법:
    python measure_pages.py <a.hwpx> [b.hwpx ...]

각 파일의 "페이지수 파일명"을 한 줄씩 출력. 실패 시 "ERR".
"""
import sys, os
import win32com.client as wc


def main():
    hwp = wc.Dispatch("HWPFrame.HwpObject")
    try:
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    except Exception:
        pass  # 보안 모듈 미등록이면 파일 경로 확인 팝업이 뜰 수 있음
    for p in sys.argv[1:]:
        try:
            hwp.Open(p, "HWPX", "")
            print(hwp.PageCount, os.path.basename(p))
            hwp.Clear(1)
        except Exception as e:
            print("ERR", os.path.basename(p), e)
    try:
        hwp.Quit()
    except Exception:
        pass


if __name__ == "__main__":
    main()
