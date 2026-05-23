# Content 객체 스키마

`build_kr_patent.js`에 전달하는 `content.js`(또는 객체)의 스키마.

## 전체 구조

```javascript
module.exports = {
  metadata: { ... },
  invention_title: "...",
  technical_field: "..." | [...],
  background: [...],
  problem_to_solve: [...],
  solution: [...],
  effects: [...],
  drawings_brief: [...],
  detailed_description: [...],
  symbols: [...],
  claims: [...],
  abstract: "..." | [...]
};
```

## 각 필드 상세

### `metadata` (선택)

```javascript
metadata: {
  file_label: "_법인명__관리번호_명세서초안08_담당자__YYYYMMDD_발명명",
  invention_title: "빔 진단 시스템 및 빔 진단 방법",
  representative_drawing: "도 1"
}
```

- `file_label`: 출력 docx 파일명 (확장자 제외). 빈 값이면 `patent_spec`로 출력.
- `invention_title`: metadata에 백업으로. 본문에는 `content.invention_title` 사용.
- `representative_drawing`: 대표도 섹션에 들어갈 텍스트.

### `invention_title` (필수)

```javascript
invention_title: "빔 진단 시스템 및 빔 진단 방법"
```

【발명의 명칭】 섹션 내용. 단일 문자열.

### `technical_field` (필수)

```javascript
technical_field: "본 발명은 입자 가속기의 빔 진단 기술에 관한 것이다."
```

또는 여러 문장:

```javascript
technical_field: [
  "본 발명은 ~에 관한 것으로,",
  "보다 구체적으로는 ~에 관한 것이다."
]
```

### `background` (필수)

```javascript
background: [
  "<1단락 - 산업적 동향>",
  "<2단락 - 기존 접근의 일반적 방식>",
  "<3단락 - 기존 방식의 한계>",
  "<4단락 - 해결과제로의 브릿지>"
]
```

각 단락은 string. 4단락 구조 권장 (강제는 아님).

### `problem_to_solve` (필수)

```javascript
problem_to_solve: [
  "본 발명의 첫 번째 목적은, ~ 위한 것이다.",
  "본 발명의 두 번째 목적은, ~ 위한 것이다.",
  "본 발명의 세 번째 목적은, ~ 위한 것이다."
]
```

목적형으로만. 수단 시사 금지. (`kr-patent-spec-drafting` 참고)

### `solution` (필수)

```javascript
solution: [
  "<독립항(청구항 1) 풀어쓰기 1단락>",
  "<청구항 2 종속항 풀어쓰기>",
  "<청구항 3 종속항 풀어쓰기>",
  "..."
]
```

청구항 N개를 모두 빠짐없이 반영. 독립항 "~한다.", 종속항 "~할 수 있다." 어미.

### `effects` (필수)

```javascript
effects: [
  "첫째, <효과 1 — 3단 인과 구조>",
  "둘째, <효과 2>",
  "...",
  "<마무리 종합 1-2문장>"
]
```

각 효과는 구조→메커니즘→이점 3단 인과 구조.

### `drawings_brief` (필수)

```javascript
drawings_brief: [
  { fig: "도 1", desc: "본 발명의 일 실시예에 따른 빔 진단 시스템을 보인 블록도이다." },
  { fig: "도 2", desc: "본 발명의 일 실시예에 따른 스플리터의 구성을 보인 회로도이다." }
]
```

각 항목은 `{ fig, desc }` 객체. desc 끝에는 마침표.

### `detailed_description` (필수)

```javascript
detailed_description: [
  "<실시예 도입부 표준 해석 규정 문구>",
  "<도 1 실시예 단락 1>",
  "<도 1 실시예 단락 2>",
  "<도 2 실시예 단락 1>",
  "..."
]
```

각 도면별 6관점 (구조/기능/관계/메커니즘/효과/변형례) 적용.

### `symbols` (필수)

```javascript
symbols: [
  { num: "10", name: "슬릿 스캐너" },
  { num: "11, 12", name: "슬릿 (x, x' 측정용 1쌍)" },
  { num: "100", name: "빔 진단 시스템" },
  { num: "110", name: "스플리터" },
  { num: "120", name: "다중 게인 증폭부" },
  { num: "121-124", name: "제1-4 게인 스테이지" },
  { num: "S100", name: "빔 진단 방법" },
  { num: "S110", name: "채널 분배 단계" }
]
```

각 항목 `{ num, name }`. 시스템 부호와 방법 단계 부호(S 접두사) 모두 포함.

### `claims` (필수)

```javascript
claims: [
  "[청구항 1] ~를 포함하는, X 시스템.",
  "[청구항 2] 제1항에 있어서, ~인 것을 특징으로 하는, X 시스템."
]
```

각 청구항은 string. 사용자가 제공한 원문 그대로. 절대 변경 금지.

청구항 번호 표기는 `[청구항 N]` 또는 `【청구항 N】` 중 일관성 유지.

### `abstract` (필수)

```javascript
abstract: "본 발명은 ~에 관한 것이다. ~를 통해 ~한 효과를 얻을 수 있다."
```

또는 여러 단락:

```javascript
abstract: [
  "본 발명은 ~에 관한 것이다.",
  "본 발명에 따르면, ~한 효과를 얻을 수 있다."
]
```

청구항 1 복붙이 아닌 의역. 효과 1-2문장 포함.

---

## 빌드 시 자동 처리

빌드 스크립트가 자동으로 추가하는 항목:

- 【발명의 설명】 큰 컨테이너 헤더 (필요 시)
- 섹션 헤더 (【발명의 명칭】, 【기술분야】 등)
- 들여쓰기/줄간격/폰트 (나눔고딕)
- 청구항 들여쓰기 (firstLine 677 DXA + hanging 280 DXA)
- 페이지 크기 A4, 표준 여백

## 분할 content 파일 사용

명세서가 크면 부분 파일로 분할:

```javascript
// content.js
module.exports = {
  ...require("./content_part1.js"),  // metadata, invention_title, technical_field, background
  ...require("./content_part2.js"),  // problem_to_solve, solution
  ...require("./content_part3.js"),  // effects, drawings_brief
  ...require("./content_part4.js"),  // detailed_description (가장 큼)
  ...require("./content_part5.js")   // symbols, claims, abstract
};
```

각 부분 파일은 자신이 채우는 필드만 export.

```javascript
// content_part1.js
module.exports = {
  metadata: { ... },
  invention_title: "...",
  technical_field: "...",
  background: [...]
};
```

## 자주 발생하는 schema 오류

| 증상 | 원인 |
|---|---|
| `Cannot read property 'forEach' of undefined` | 배열 필드(예: `background`)를 string으로 잘못 제공 |
| 청구항이 들여쓰기 없이 출력 | `claims` 항목이 `[청구항 N]` 접두사 누락 |
| 부호 설명이 표 없이 한 줄로 | `symbols` 배열 항목이 `{ num, name }` 객체가 아닌 string |
| 영문/숫자만 다른 폰트로 표시 | 빌드 스크립트는 자동 처리하지만, content.js 작성 시 raw HTML 같은 이상한 문자열 포함 시 발생 가능 |
