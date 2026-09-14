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
  // symbols: [ ... ]   // ⚠ default: 생략. 한국 변리사 실무상 【부호의 설명】
                          // 섹션은 의도적으로 두지 않는 게 권리범위 보호·검토 부담
                          // 양면에서 유리. symbols 키 자체를 누락 또는 [] 빈 배열로 두면
                          // 빌더가 해당 섹션을 건너뜀. 사용자가 명시적으로 두기로
                          // 결정한 경우에만 다음 형태로 채움:
                          //   symbols: [
                          //     { num: "10", name: "슬릿 스캐너" },
                          //     { num: "100", name: "빔 진단 시스템" },
                          //   ],
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
- (2026-05-28) 외부에서 받은 도면 또는 docx 인계 시점에 docx 안 word/media/ 추출 + 외부 도면 폴더와 sha256 비교 → 도면 버전 차이 즉시 검출. 빌더 또는 정합성 점검 인프라성 스크립트로 추가. 옛 도면 폴더 기준으로 정합성 진단 시 잘못된 결함 보고 발생 사례 있음.
- (2026-05-28) OneDrive 한글 경로(OneDrive\문서\...) 안 docx 작업 시 파일 잠금·인코딩 충돌이 잦음 → C:\Users\<user>\_v<N>.docx 식 ASCII 경로 작업 사본 생성 → 작업 → OneDrive 복귀 패턴이 default. python-docx 스크립트 첫 줄에 os.environ['PYTHONIOENCODING']='utf-8'; sys.stdout.reconfigure(encoding='utf-8') 보일러플레이트 자동 삽입. 사례: v9/v10/v11 라운드 모두 동일 패턴 적용.
- (2026-05-28) 사용자 IPLAB 빌드 default 확정: 폰트 '맑은 고딕', 본문 12pt (size half-points 24), 줄간격 2.0 (spacing.line 480), 섹션 헤더 outline level 자동 부여 (Level 1: 【발명의 설명】·【청구범위】·【요약서】·【대표도】 / Level 2: 【발명의 명칭】·【기술분야】·【발명의 배경이 되는 기술】·【발명의 내용】·【도면의 간단한 설명】·【발명을 실시하기 위한 구체적인 내용】·【부호의 설명】·【요약】 / Level 3: 【해결하고자 하는 과제】·【과제의 해결 수단】·【발명의 효과】). buildDocument 첫 줄에 【발명의 설명】 컨테이너 헤더 출력 강제. sectionTitle(text, {level: N})·buildSection(title, paras, {level: N}) 시그니처로 호출.
- (2026-05-28 교정) outline level 정본 구조는 사용자 P-2026-011-01-KR v11 정본 기준으로 재정렬. **Level 1 (4개 컨테이너)**: 【발명의 설명】·【청구범위】·【요약서】·【도면】. **Level 2**: 【발명의 명칭】·【기술분야】·【발명의 배경이 되는 기술】·【발명의 내용】·【도면의 간단한 설명】·【발명을 실시하기 위한 구체적인 내용】·【청구항 N】(각 청구항마다)·【요약】·【대표도】·【도면 N】(각 도면마다). **Level 3**: 【해결하고자 하는 과제】·【과제의 해결 수단】·【발명의 효과】·【본 발명 시작】·실시예 본문 1단 소제목 ('1. 시스템 구성', '2. 디지털 트윈 모델 생성' 등). **Level 4**: 실시예 본문 2단 소제목 ('2-1.', '2-2.', '6-1.' 등). buildClaims는 청구항마다 【청구항 N】 헤더 자동 출력, buildDrawingsSection으로 【도면】 컨테이너 + 【도면 N】 페이지 출력, buildDetailedDescription으로 실시예 본문 sub-heading 객체({heading, level, paragraphs}) 지원. 【대표도】는 L1 아닌 L2.
- (2026-05-28) python-docx의 insert_paragraph_before(ref_para, txt) 다중 신설 시 순서 동작 — ref_para가 고정된 채 정순으로 [a, b, c, d] 삽입 시 결과는 [..., a, b, c, d, ref_para] 순서로 누적 (각 삽입이 ref_para 바로 앞에 추가되므로 직전 삽입분은 한 칸 앞으로 밀림). reversed(list) 호출 시 결과는 역순으로 출력됨. 신설 단락 순서가 의도와 일치하는지 항상 검증 단계 필요 — d.paragraphs 재로딩 후 인덱스 출력으로 verify. 보일러플레이트: for txt in new_paras: ref_para.insert_paragraph_before(txt) — 정순 사용이 default. 사례: v12 첫 시도에서 reversed로 삽입하여 결과 순서가 역순으로 나옴(정의 단락이 변형 단락 뒤에 위치) → 정순으로 재실행.

## 자주 발생하는 빌드 오류

| 증상 | 원인 | 해결 |
|---|---|---|
| `Cannot find module 'docx'` | docx 패키지 미설치 | `cd kr-patent-docx-builder && npm install` |
| docx 파일이 열리지 않음 | 빌더 코드 오류로 invalid xml 생성 | validate.py 실행하여 오류 메시지 확인 |
| 한글이 깨져 보임 | 폰트 hint 누락 | TextRun 생성 시 `font: { name: "나눔고딕", eastAsia: "나눔고딕", hAnsi: "나눔고딕" }` 명시 |
| 청구항 들여쓰기 불일치 | firstLineChars vs firstLine 혼용 | 한 가지로 통일 |
