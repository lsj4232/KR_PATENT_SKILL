# Content 객체 스키마

현재 `scripts/build_kr_patent.js` CLI가 읽는 JSON 또는 CommonJS 객체다. 문서 내용의 작성 규칙과 빌더의 필드 형식을 구별한다.

## 최소 예제: 청구항 문서

```json
{
  "invention_title": "센서 제어 장치",
  "claims": [
    {"num": 1, "text": "센서 및 상기 센서의 출력에 기초하여 동작하는 제어기를 포함하는 센서 제어 장치."},
    {"num": 2, "text": "제1항에 있어서, 상기 제어기는 상기 센서의 출력을 저장하는 센서 제어 장치."}
  ]
}
```

헤더는 자동 생성된다. 청구항 본문에 `[청구항 1]` 등의 헤더를 포함하지 않는다. `claims`를 문자열 배열로 주면 1부터 자동 번호를 부여한다. 객체의 `text`가 문자열 배열이면 각 항목이 문단이 되며 자동 줄 분할은 생략된다.

## 필드

빌더는 존재하는 필드의 섹션을 출력한다. 전체 명세서에 필요한 섹션은 사용 목적에 맞게 준비한다. '필드 생략 가능'이 출원 서류에서의 생략 허용을 의미하지는 않는다.

| 필드 | 형식 | 처리 |
|---|---|---|
| `metadata` | 객체 | `file_label`, 문서 속성용 `invention_title`, `representative_drawing` |
| `invention_title` | 문자열 | 본문 발명의 명칭. metadata 제목으로 대체되지 않음 |
| `technical_field` | 문자열 또는 문자열 배열 | 기술분야 |
| `background` | 문자열 배열 | 배경기술 |
| `problem_to_solve` | 문자열 배열 | 과제 및 발명의 내용 컨테이너 |
| `solution` | 문자열 배열 | 해결수단 |
| `effects` | 문자열 배열 | 효과 |
| `drawings_brief` | `{fig, desc}` 배열 | `fig`는 '도 1', `desc`는 조사 뒤의 설명. 빌더가 은/는을 붙임 |
| `detailed_description` | 문자열 또는 `{heading, level, paragraphs}`의 배열 | heading은 괄호 없는 제목, level 기본 3, paragraphs는 문자열 배열 권장 |
| `symbols` | `{num, name}` 배열 | 없거나 빈 배열이면 절 생략 |
| `claims` | 문자열 또는 `{num, text}`의 배열 | 청구항 헤더 자동 생성 |
| `abstract` | 문자열 또는 문자열 배열 | 요약서·요약 |
| `figures` | `{num, caption}` 배열 | 도면 헤더·캡션만. 이미지 파일 삽입 미지원 |
| `layout` | 객체 | 아래 설정을 CLI에서 적용 |

`drawings_brief` 예: `[{"fig":"도 1","desc":"센서 제어 장치를 나타내는 블록도이다."}]`.

## Layout

```json
{
  "layout": {
    "body_align": "JUSTIFIED",
    "l1_center": true,
    "title_indent": true,
    "drawings_indent": true,
    "claim_tab": true,
    "claim_linebreak": true,
    "indent": {"body_first_line": 800, "claim_tab_pos": 1021},
    "spacing": {"line": 480, "para_after": 120, "section_before": 320, "section_after": 200},
    "margin": {"top": 1440, "right": 1080, "bottom": 1440, "left": 1080}
  }
}
```

여백·들여쓰기·문단 간격의 수치는 twip(DXA), 줄 간격 240은 1배다. 값은 예시이며 사용자 템플릿에 맞춘다. `body_align`은 `JUSTIFIED` 또는 `LEFT` 등을 받는다. `claim_tab=true`면 명칭·청구항에 실제 탭 문자가 들어가며 `claim_first_line`, `claim_hanging`은 탭 방식에서 쓰이지 않는다.

폰트·폰트 크기는 현재 `layout`으로 바꿀 수 없다. 맑은 고딕·본문 12pt가 스크립트 상수다. 코드 수정 없이 지원되지 않는 설정을 넣었다고 적용되었다고 보고하지 않는다.

## 주의

- 배열 필드에 문자열을 넣지 않는다.
- `metadata.invention_title`은 본문 제목을 대신하지 않는다.
- `figures[].path`는 현재 구현에서 읽지 않는다.
- JSON을 우선 사용할 수 있다. 여러 파일을 조합해야 하면 신뢰할 수 있는 JS의 `module.exports`로 구성한다.
- 명시적 `--output` 경로를 사용하고 결과의 실제 내용·문언을 대조한다.
