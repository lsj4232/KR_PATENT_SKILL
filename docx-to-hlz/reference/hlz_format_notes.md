# 워드(.docx) → 통합명세서작성기(.hlz) 변환기 — 교훈 기록

작성: 2026-07-01 / 대상: 특허청 전자출원 SW **통합명세서작성기(NKEditor, `C:\KipoNet\NKEditor\NKEditor.exe`)**

---

## 0. 한 줄 결론
`.HLT`는 직접 못 만들지만 **`.hlz`는 만들 수 있고, 편집기가 그대로 연다.**
`.hlz` = **ZIP( KIPO XML 1개 + 도면 이미지 `patNNNNN` )**.

---

## 1. 파일 포맷 리버스 엔지니어링

| 포맷 | 정체 | 생성 가능? |
|---|---|---|
| **`.HLT`** | 독자 바이너리. 파일 시그니처 = `HAN Lite`. 편집기 네이티브 저장본. | ❌ 외부 생성 불가 |
| **`.hlz`** | **표준 ZIP**(`PK\x03\x04`). 내부 = `<이름>.xml` + `patNNNNN.{jpg,tif}` | ✅ **이걸 만든다** |
| **`.fin`** | 제출 완성본(역시 ZIP 계열) | 편집기가 생성 |

> 그래서 전략: **docx → .hlz 생성 → 편집기 [파일>열기]로 로드**.
> `.HLT`가 필요하면 편집기에서 열고 [저장]만 하면 편집기가 알아서 써준다(우리가 만들 필요 없음).

## 2. KIPO XML 스키마 (application-body DTD)

```
<KIPO keapsVersion="5.6" editorKind="K" pageCount="N" imgApply="N" xmlns="http://www.kipo.go.kr">
 <PatentCAFDOC docflag="1.0" documentID="숫자">
  <description>
   <invention-title>한글{ENGLISH}</invention-title>
   <technical-field><p num="0001">…</p></technical-field>
   <background-art><p num="0002">…</p>…</background-art>
   <summary-of-invention>
     <tech-problem><p num=…>…</p></tech-problem>
     <tech-solution><p num=…>…</p></tech-solution>
     <advantageous-effects><p num=…>…</p></advantageous-effects>
   </summary-of-invention>
   <description-of-drawings><p num="00NN">도 1은…<br/>도 2는…</p></description-of-drawings>
   <description-of-embodiments><p num=…>…</p>…</description-of-embodiments>
  </description>
  <claims>
   <claim num="1"><claim-text>…단계;<br/>…단계; 및<br/>…을 특징으로 하는 ….</claim-text></claim>
  </claims>
  <abstract>
   <summary><p num="0001a">…</p></summary>
   <abstract-figure><p num="0002a"><figref num="3"/></p></abstract-figure>
  </abstract>
  <drawings>
   <figure num="1"><img id="i0001" he="44" wi="134" file="pat00001.tif" img-format="tif"/></figure>
  </drawings>
 </PatentCAFDOC>
</KIPO>
```

## 3. 반드시 지켜야 할 규칙(안 지키면 편집기가 거부/깨짐)

1. **`<p num>` 은 description 전체를 관통하는 4자리 일련번호**(0001→끝까지 증가). `<abstract>`만 별도 카운터 + 접미사 `a`(0001a…).
2. **청구항은 `<p>`가 아니라 `<claim-text>` 한 덩어리**, 줄바꿈은 `<br/>`. (`【청구항 N】` 태그의 작성자 메모 `//…//`는 **반드시 제거** — 안 그러면 청구범위 본문에 섞여 들어감.)
3. **`img-format` 은 DTD상 `jpg | tif | st33 | st35` 만 허용.**
   - `tiff` → **`tif`** 로 정규화(3글자!).
   - `png`·`bmp`·`gif` → **`jpg`로 재인코딩**(투명 배경은 흰색 평탄화). ← 이 파일 도12~16이 png였음.
4. **`<img he wi>` = mm 단위 표시크기.** docx 이미지 표시크기(EMU)/36000 = mm, **최대 가로 165mm × 세로 222mm**(검증기 E-218, 초과 금지)에 종횡비 유지하며 맞춤. `he wi file img-format` 은 **#REQUIRED**.
5. **대표도**는 `<abstract-figure>…<figref num="도번호"/>`. (본문 `【대표도】 도 3` → num="3")
6. **도면**은 `<drawings><figure num="N"><img .../></figure>`. 이미지 파일명은 `pat00001`부터 순번, XML `file=` 참조와 **정확히 일치**해야 함.
7. XML 특수문자(`& < >`)는 이스케이프. 인코딩 UTF-8.
8. `.hlz` 안에 **XML을 먼저**, 그다음 이미지들. ZIP_DEFLATED.
9. **【최중요】 ZIP 엔트리 파일명은 CP949로, UTF-8 플래그(0x800) 없이 기록.**
   - 편집기(구 MFC)는 zip 파일명을 CP949(ANSI)로 읽고 **UTF-8 플래그를 모른다.**
   - Python `zipfile` 기본은 파일명에 한글이 있으면 UTF-8 인코딩 + 플래그 0x800 세팅 →
     편집기가 해당 엔트리를 **못 찾아 압축해제 자체가 실패**(temp 폴더 비어 있음) →
     내부문서를 못 찾고 `<이름>.SGM` 을 기본추정하다 **"…SGM 을(를) 찾을 수 없습니다" 에러.**
   - 해결: `ZipInfo._encodeFilenameFlags` 를 오버라이드해 `filename.encode('cp949')` 반환 +
     `flag_bits & ~0x800`. 레퍼런스(편집기 자체 생성 hlz)는 전 엔트리 flag_bits=0x0000.
   - 내부 xml basename == hlz 파일 basename 이어야 함(편집기가 이름으로 문서파일 탐색).

## 4. 워드 파싱 시 주의

- 섹션은 `【식별항목】`으로 구분. 래퍼(`【발명의 설명】`,`【발명의 내용】`,`【요약서】`)는 자식만 쓰고 자신은 버림.
- 비표준 챕터 제목(`【1. 용어의 정의…】` 같은 탐색창용 소제목)은 KIPO 식별항목이 아니므로 **일반 본문 문단으로** 흡수(대괄호 제거).
- `【도면의 간단한 설명】`의 "도 N은…" 여러 줄은 **한 `<p>` 안에서 `<br/>`로** 이어 붙임(편집기 실물과 동일).
- 이미지 순서 = 문서 등장 순서 = 도면 순서. `<w:drawing>` 조상의 `<wp:extent cx cy>`에서 표시크기 획득.

## 5. 검증에 쓴 방법(다음에도 재사용)

- 편집기가 실제로 만든 레퍼런스 `.hlz`(`C:\KipoNet\NKEditor\Data\Hlz\`)를 뜯어 **정답지**로 사용.
- 생성물 vs 레퍼런스 **요소 스켈레톤 1:1 대조**(누락·여분 0 확인).
- ZIP 무결성, XML well-formed, `img-format` 화이트리스트, `file=` 참조 ↔ 실제 이미지 파일 일치, PIL로 이미지 16장 무결성.
- DTD 원본: `C:\KipoNet\NKEditor\Epasl\INCLUDE\DTD\application-body-v1-6.dtd`.

## 5.5 도면 페이지 나눔 & 소목차 (2026-07-02 추가)

- **도면 페이지 나눔용 마크업은 스키마에 없다.** `br`은 속성 없는 단순 줄바꿈, `doc-page`는
  "전체 페이지=1이미지" 배타 모드(figure와 병용 불가). 레퍼런스(실제 출원건)도 `<figure>`만 나열.
  → **편집기가 `<figure>` 하나당 자동으로 한 페이지**로 배치한다(수동 페이지나눔 삽입 불가).
- 단, 도면이 **너무 작으면**(docx 표시크기 그대로면 도1이 44mm 등) 편집기가 여러 개를 한 페이지에
  흘려 담아 보일 수 있다. → `fit_page(fill=True)`로 **각 도면을 페이지 인쇄영역에 꽉 차게 확대**.
- **★도면 이미지 최대 크기 = 가로 165mm × 세로 222mm (검증기 E-218).** 초과하면
  "이미지의 크기는 최대 가로 165mm, 세로 222mm를 초과할 수 없습니다" 에러.
  세로 상한을 245로 잡았다가 도2·도7이 세로 230으로 걸림 → **PAGE_MAX_H_MM=222 로 수정 + 반올림
  초과 방지 최종 클램프**(w≤165, h≤222). 실제 출원건 레퍼런스도 he 최대 ~221mm 로 이 한계에 맞춰져 있음.
  (편집기는 큰 이미지를 자기 페이지 최대치로 낮추지만, 검증기 한계(222)보다 관대할 수 있어
  he/wi 자체를 222 이내로 넣어야 통과.)
- **이해편의용 소목차 제거**: 【발명을 실시하기 위한 구체적인 내용】 안의 `【1. 용어의 정의…】`
  같은 `【N. …】`(숫자 시작) 챕터 제목은 출원 서식에 없어야 하므로 `CHAPTER_HEAD_RE`로 **본문에서 드롭**.
  (탐색창 소제목은 kr-patent-navigation-pane 로 outlineLvl만 주는 것이 정석 — 본문 텍스트론 넣지 않음.)

## 6. 남은 한계 / 열린 이슈

- **수식(도 13 등)·색상 도면**: 지금은 png→jpg로 넣어 편집기 로딩·표시는 되지만, **KIPO 최종 제출용 도면은 흑백 TIFF(G4) 권장.** 편집기 내 [이미지 변환] 또는 별도 `topatent`(1-bit·Group4·600DPI) 툴체인으로 최종 변환 필요.
- **인라인 이미지**(본문 중간 삽입): 코드에 자리는 있으나 이 파일엔 없어 실전 검증 못 함. 실제 인라인 삽입건에서 위치 정확도 재확인 요망.
- **pageCount**: 추정값. 편집기가 열 때 재계산하므로 무해.
- **표(table)**: 이 명세서엔 표 0개라 미구현. 표 있는 명세서는 `<table>` 매핑 추가 필요(DTD `table-external.dtd`).
- 편집기 로딩 최종 확인은 GUI에서 [파일>열기]로 사람이 1회 확인해야 함(자동화 밖).

## 7. 사용법

```bat
python docx2hlz.py "명세서.docx"            # → output\명세서.hlz
python docx2hlz.py "명세서.docx" -o 결과.hlz
변환.bat  에 docx 를 끌어다 놓기          # 드래그&드롭
```
그다음 **NKEditor [파일 > 열기] → 생성된 .hlz 선택.**
```
```
