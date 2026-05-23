---
name: kr-patent-docx-builder
description: 한국 특허청 양식의 명세서 docx 빌드 인프라. 명세서 본문 텍스트를 JSON/JS 객체 형태의 콘텐츠로 받아 나눔고딕·청구항 들여쓰기·표준 섹션 헤더(【발명의 명칭】 등)·부호의 설명표 등 한국 특허청 별지 양식을 따르는 docx 파일을 자동 생성. 매번 docx 생성 코드를 처음부터 짜는 대신 본 스킬의 재사용 가능한 빌드 스크립트를 호출. "docx 빌드", "명세서 docx", "한국 특허 양식 docx", "워드 출력", "최종 docx", "출원용 docx", "build patent docx" 같은 표현이 보이면 사용. 다른 한국 특허 명세서 스킬(kr-patent-spec-drafting 등)에서 본문이 준비된 뒤 최종 산출물 단계에서 호출되는 인프라성 스킬.
---

# 한국 특허 docx 빌더

## 무엇을 하는가

명세서 본문 콘텐츠(텍스트, 청구항, 부호의 설명 등)를 표준화된 JS 객체 형태로 받아, **한국 특허청 별지 양식을 따르는 docx 파일을 자동 생성**한다.

**핵심 가치**: 매번 명세서 docx를 만들 때마다 폰트/들여쓰기/섹션 헤더 코드를 다시 짜지 않아도 된다. 본 스킬의 빌드 스크립트가 이미 검증된 양식을 적용한다.

## 핵심 파일

- `scripts/build_kr_patent.js` — 메인 빌드 스크립트. content 객체를 받아 docx 생성
- `references/content-schema.md` — content 객체의 스키마 (어떤 필드를 채워야 하는지)
- `references/example-content.js` — 샘플 content 파일

## 사용 방법

### Step 1. 필요 패키지 설치 (최초 1회)

```bash
# 본 스킬 디렉토리에서 1회만 실행. docx 패키지가 로컬 설치됨.
cd kr-patent-docx-builder
npm install
```

(package.json의 dependencies — `docx`)

### Step 2. content 객체 작성

명세서의 각 섹션을 채우는 JS 객체를 작성한다. 스키마는 `references/content-schema.md` 참조.

작업 디렉토리에 `content.js` (필요 시 `content_part1.js`, `content_part2.js`, … 분할) 파일을 생성한다.

```javascript
// content.js (최소 골격)
module.exports = {
  metadata: {
    file_label: "_법인명__관리번호_명세서초안01_담당자__YYYYMMDD_발명명",
    invention_title: "예시 발명의 명칭",
    representative_drawing: "도 1"
  },
  technical_field: "본 발명은 입자 가속기의 빔 진단 기술에 관한 것이다.",
  background: [
    "<배경 1단락>",
    "<배경 2단락>",
    "<배경 3단락>",
    "<배경 4단락 - 해결과제로의 브릿지>"
  ],
  problem_to_solve: [
    "본 발명의 첫 번째 목적은, ~ 위한 것이다.",
    "본 발명의 두 번째 목적은, ~ 위한 것이다."
  ],
  solution: [
    "<해결수단 단락 1>",
    "<해결수단 단락 2>"
  ],
  effects: [
    "<효과 1 (3단 인과 구조)>",
    "<효과 2>"
  ],
  drawings_brief: [
    { fig: "도 1", desc: "본 발명의 일 실시예에 따른 X를 보인 블록도이다." }
  ],
  detailed_description: [
    "<실시예 도입부 표준 문구>",
    "<도 1 실시예 단락>",
    "<도 2 실시예 단락>"
  ],
  symbols: [
    { num: "10", name: "슬릿 스캐너" },
    { num: "100", name: "빔 진단 시스템" },
    { num: "110", name: "스플리터" }
  ],
  claims: [
    "[청구항 1] ~를 포함하는 X 시스템.",
    "[청구항 2] 제1항에 있어서, ~인 것을 특징으로 하는 X 시스템."
  ],
  abstract: "본 발명은 ~에 관한 것이다. ~를 통해 ~한 효과를 얻을 수 있다."
};
```

### Step 3. 빌드 실행

```bash
cd <작업 디렉토리>
node /path/to/skill/scripts/build_kr_patent.js \
    --content ./content.js \
    --output /mnt/user-data/outputs/<filename>.docx
```

또는 더 간단하게 (작업 디렉토리에서):

```bash
cp /path/to/skill/scripts/build_kr_patent.js ./build.js
node build.js
```

이때 `build.js`는 동일 디렉토리의 `content.js`를 자동 로드.

### Step 4. 검증

```bash
python3 /mnt/skills/public/docx/scripts/office/validate.py <output.docx>
extract-text <output.docx> | head -50
```

## 표준 양식 사양 (자동 적용)

빌드 스크립트가 자동으로 적용하는 사양은 아래와 같다. 사용자가 별도로 신경 쓸 필요 없음.

| 항목 | 값 |
|---|---|
| 폰트 (한글) | 나눔고딕 |
| 폰트 (영문·숫자) | 나눔고딕 (eastAsia + hAnsi + hAnt 모두 지정 — 폰트 일관성) |
| 본문 폰트 크기 | 11pt (Half-point 22) |
| 섹션 타이틀 폰트 크기 | 12pt (24) |
| 줄 간격 | 360 (1.5배 정도) |
| 본문 단락 들여쓰기 | firstLine 280 DXA (약 2글자) |
| 청구항 들여쓰기 | firstLineChars 300 또는 firstLine 677 DXA |
| 정렬 | 본문 양쪽 정렬, 섹션 타이틀 좌측 정렬 또는 중앙 |
| 페이지 크기 | A4 |
| 여백 | 한국 특허법 시행규칙 별지 양식 기준 |
| 섹션 헤더 표기 | 【발명의 명칭】, 【기술분야】 등 한국 표준 |

## content 객체 분할 전략 (대규모 명세서)

명세서가 길어지면 content.js를 부분 파일로 분할.

```
content.js              # 전체 모음 (require로 부분 import)
content_part1.js        # 발명 명칭, 기술분야, 배경, 해결과제
content_part2.js        # 해결수단
content_part3.js        # 효과, 도면 설명
content_part4.js        # 실시예 (가장 큼)
content_part5.js        # 부호 설명, 청구항, 요약, 대표도
```

`content.js`:
```javascript
module.exports = {
  ...require("./content_part1.js"),
  ...require("./content_part2.js"),
  ...require("./content_part3.js"),
  ...require("./content_part4.js"),
  ...require("./content_part5.js")
};
```

## 파일 명명 규칙

특허법인 내부 관행에 따른 파일명 패턴 (사용자가 customize 가능):

```
_<특허법인>__<관리번호>_명세서초안<버전>_<담당자>__<날짜>_<발명명>.docx
```

예:
```
_법인명__관리번호_명세서초안08_담당자__YYYYMMDD_발명명.docx
```

`metadata.file_label` 필드를 적절히 채우면 빌드 스크립트가 이 형식을 따른다.

## 도면 처리

본 스킬은 명세서 본문만 다룬다. 도면은 별도 처리:
- 도면 placeholder (도 1 ~ 도 N)만 본문에 포함
- 실제 도면 파일은 사용자가 별도로 첨부하여 출원

도면 placeholder는 빌드 스크립트가 자동으로 도면설명 섹션 끝에 또는 별도 페이지에 둔다.

## 컴파운딩 루프 (개선 메모)

빌드 스크립트의 양식이 특허청·법인 검토 과정에서 지적받은 패턴은 scripts/build_kr_patent.js를 직접 수정하여 누적. 다음 사용 시 자동으로 개선된 양식이 적용됨.

### 누적 양식 개선
- (예시) 청구항 단락 간 후방 간격을 추가로 0.5줄 띄우는 것이 검토자에게 가독성 좋다는 피드백 → 스크립트에 반영

## 자주 발생하는 빌드 오류

| 증상 | 원인 | 해결 |
|---|---|---|
| `Cannot find module 'docx'` | docx 패키지 미설치 | `cd kr-patent-docx-builder && npm install` |
| docx 파일이 열리지 않음 | 빌더 코드 오류로 invalid xml 생성 | validate.py 실행하여 오류 메시지 확인 |
| 한글이 깨져 보임 | 폰트 hint 누락 | TextRun 생성 시 `font: { name: "나눔고딕", eastAsia: "나눔고딕", hAnsi: "나눔고딕" }` 명시 |
| 청구항 들여쓰기 불일치 | firstLineChars vs firstLine 혼용 | 한 가지로 통일 |
