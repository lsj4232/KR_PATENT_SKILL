# KR_PATENT_SKILL

한국 변리사 실무를 위한 Claude 스킬(Skills) 모음. 발명자 미팅, 부호 체계 설계, 명세서 본문 작성, 정합성 점검, docx 출력, 회고를 통한 스킬 자동 업데이트, **전체 워크플로우 자동 오케스트레이션**까지 — 한국 특허 명세서 작성 전 과정을 커버한다.

> **스킬(Skills)이란?** Claude가 호출할 수 있는 절차적 지식 패키지. 단순 프롬프트보다 한 단계 위로, 설명(Description) + 지시사항(Instructions) + 도구(Tools)의 3계층 구조. 매번 같은 작업을 새로 설명할 필요 없이 Claude에게 "앱"처럼 호출 가능.

## ✨ 특징

- **조합 가능(Composable)** — 7개의 작고 집중된 스킬. 전체 워크플로우 또는 일부만 선택적으로 사용.
- **한국 특허 실무 특화** — "종래" 금지, "구성되는" 금지, 효과 3단 인과(구조→메커니즘→이점), 청구항 수치 도면 노출 방지 등 한국 특허청 가이드라인 반영.
- **실행 가능한 도구 포함** — docx 빌더(`build_kr_patent.js`)와 스킬 업데이터(`append_learning.py`)가 실제 코드로 동작.
- **컴파운딩 루프 자동화** — 메타 스킬(`kr-patent-skill-updater`)로 회고 → 학습 항목 누적이 자동화. 사용할수록 똑똑해짐.
- **전체 워크플로우 한 줄로** — `/full` 또는 "처음부터 끝까지"라고 하면 9단계가 자동 순차 실행. 변리사는 체크포인트 3곳에서만 의사결정.

## 📦 스킬 구성

| # | 스킬 이름 | 역할 |
|---|---|---|
| 1 | [`kr-patent-inventor-meeting`](./kr-patent-inventor-meeting/) | 발명자 미팅 질문 생성 (7관점 프레임워크) |
| 2 | [`kr-patent-symbol-design`](./kr-patent-symbol-design/) | 도면 부호 체계 설계 (계층적 넘버링) |
| 3 | [`kr-patent-spec-drafting`](./kr-patent-spec-drafting/) | 명세서 본문 작성 (한국 가이드라인 준수) |
| 4 | [`kr-patent-consistency-check`](./kr-patent-consistency-check/) | 명세서·도면·청구항 정합성 점검 |
| 5 | [`kr-patent-docx-builder`](./kr-patent-docx-builder/) | 한국 특허 양식 docx 빌드 (인프라) |
| 6 | [`kr-patent-skill-updater`](./kr-patent-skill-updater/) | 회고 → 스킬 자동 업데이트 (메타 스킬) |
| 7 | [`kr-patent-full-workflow`](./kr-patent-full-workflow/) | **`/full` 전체 워크플로우 오케스트레이터** ★ |

## 🚀 설치 방법

### 옵션 1: Claude.ai (Skills 기능 사용)

Claude.ai의 Skills 기능에 각 스킬을 업로드한다. (Skills 기능은 일부 환경에서만 사용 가능 — Anthropic 문서 확인)

각 스킬 폴더(예: `kr-patent-inventor-meeting/`)를 zip으로 압축하여 업로드.

### 옵션 2: Claude Code / API

작업 디렉토리 또는 프로젝트의 스킬 경로에 클론.

```bash
git clone https://github.com/lsj4232/KR_PATENT_SKILL.git
cd KR_PATENT_SKILL
```

Claude Code 또는 API에서 스킬 경로를 인식하도록 설정. 자세한 사용법은 [Anthropic Skills 문서](https://docs.claude.com) 참조.

### 옵션 3: 수동 — Claude에게 스킬 내용을 직접 보여주기

각 SKILL.md 파일의 내용을 Claude 대화 초반에 시스템 메시지처럼 붙여 넣어도 동작한다.

## 📋 의존성

| 스킬 | 의존성 |
|---|---|
| `kr-patent-docx-builder` | Node.js ≥ 18, `docx` npm 패키지 (`npm install -g docx`) |
| `kr-patent-skill-updater` | Python ≥ 3.8 (표준 라이브러리만 사용) |
| 나머지 4개 스킬 | 추가 의존성 없음 (텍스트 기반) |

## 🎯 빠른 시작 (사용 예)

### 시나리오 A: 새 발명을 처음부터 명세서까지

```
1. 발명자가 IDS(기술내용설명서) 제출
   ↓
2. [kr-patent-inventor-meeting] → 발명자 미팅 질문 생성
   ↓
3. 미팅 후 청구항 확정
   ↓
4. [kr-patent-symbol-design] → 부호 체계 확정
   ↓
5. [kr-patent-spec-drafting] → 명세서 본문 작성
   ↓
6. [kr-patent-consistency-check] → 정합성 점검 (점수표 + 수정안)
   ↓
7. [kr-patent-docx-builder] → 한국 특허 양식 docx 출력
   ↓
8. [kr-patent-skill-updater] → 회고 → 다른 스킬들에 학습 항목 누적
```

### 대화 예시

#### ✨ 가장 빠른 방법: `/full` (전체 자동)

```
User: "/full" 또는 "처음부터 끝까지 도와줘"
→ Claude가 kr-patent-full-workflow 사용
  ↓
  현재 자료 자동 점검 → 어느 단계부터 시작할지 판단
  ↓
  9단계 순차 실행 (체크포인트 3곳에서만 사용자 OK 받음):
    1) 발명자 미팅 질문 (선택)
    2) 청구항 확정 확인
    3) 부호 체계 설계 ★ OK
    4) 스토리텔링 설계 ★ OK
    5) 본문 작성
    6) 정합성 점검 ★ 어떤 수정 적용할지 결정
    7) 수정 반영
    8) docx 출력
    9) 회고 (선택)
```

#### 개별 호출 (특정 작업만)

```
User: "이 발명자 IDS 검토하고 미팅 질문 만들어줘"
→ Claude가 kr-patent-inventor-meeting 사용

User: "청구항 확정됐어. 부호 체계 설계해줘"
→ Claude가 kr-patent-symbol-design 사용

User: "이 청구항과 도면으로 명세서 본문 작성해줘"
→ Claude가 kr-patent-spec-drafting 사용

User: "최종 docx로 만들어줘"
→ Claude가 kr-patent-docx-builder 사용 → docx 파일 생성

User: "이번 작업 회고하고 스킬에 반영해줘"
→ Claude가 kr-patent-skill-updater 사용 → 학습 항목 자동 누적
```

### docx 빌더 직접 사용

```bash
# 의존성 설치
npm install -g docx

# content.js 작성 (스키마는 kr-patent-docx-builder/references/content-schema.md 참조)
cp kr-patent-docx-builder/references/example-content.js ./content.js
# 각 필드 채우기

# 빌드
node kr-patent-docx-builder/scripts/build_kr_patent.js \
    --content ./content.js \
    --output ./my_patent_spec.docx
```

## 🔄 컴파운딩 루프 — 핵심 차별점

이 패키지의 가장 중요한 설계 결정은 **사용할수록 스킬이 똑똑해지도록 만든 것**이다.

각 SKILL.md 끝에는 `### 누적 학습 항목` 섹션이 있다. `kr-patent-skill-updater` 스킬을 통해:

1. 작업 종료 후 "회고해줘"라고 요청
2. Claude가 지난 대화에서 발견된 패턴/실수/개선점을 추출
3. 사용자 승인 후 `append_learning.py`로 해당 SKILL.md 자동 업데이트 (백업 포함)

5번, 50번 사용할수록 변리사가 자주 빠뜨리는 함정/체크포인트가 누적되어, 새 명세서 작성 시 자동으로 회피한다.

## 📐 한국 특허 가이드라인 요약

본 스킬들이 자동으로 적용하는 규칙들:

### 금지 표현
- "종래", "종래기술" → "기존", "이미", "통상적으로"로 우회
- "구성되는" → "이루어지는" 또는 "포함하는"
- 청구항 한정 수치(예: "100 dB", "10 mV")를 배경기술에 그대로 노출 금지
- 도면 박스 라벨에 청구항 한정 수치 노출 금지

### 권장 표현
- 독립항 풀어쓰기: "~한다." (단정)
- 종속항 풀어쓰기: "~할 수 있다." (선택적)
- 효과 3단 인과 구조: 구조 → 메커니즘 → 이점
- 동의어 방어망: "X는 Y로도 명명될 수 있다."
- 사전 패턴: "여기에서, X라 함은 ~를 의미할 수 있다."

### 명세서 양식 (docx)
- 폰트: 나눔고딕
- 본문: 11pt, 1.5배 줄간격
- 청구항: firstLine 677 DXA + hanging 280 DXA
- 페이지: A4, 표준 여백
- 섹션 헤더: 【발명의 명칭】, 【기술분야】, …

## 🤝 기여 방법

이 프로젝트는 한국 변리사 커뮤니티의 집단 지성으로 성장한다.

### 기여 가능한 영역

- **새로운 학습 항목 제안** — 각 SKILL.md의 `누적 학습 항목` 섹션에 일반화된 룰 추가
- **금지/권장 표현 카탈로그 확장** — `kr-patent-spec-drafting/references/ko-patent-style-rules.md`
- **점검 항목 추가** — `kr-patent-consistency-check/SKILL.md`의 마스터 리스트
- **docx 양식 개선** — 빌더 스크립트의 한국 특허청 양식 정확도 향상
- **새 스킬 추가** — 의견서/거절이유 대응, 영문 번역, 우선권 출원 등

### PR 가이드라인

1. 학습 항목은 **특정 사건이 아닌 일반 규칙**으로 작성
2. 변경 사유를 PR 설명에 명시 (어떤 실무 경험에서 도출됐는지)
3. 개인정보·사건번호·기술 영업비밀은 절대 포함하지 말 것
4. 변경 후 기존 워크플로우가 깨지지 않는지 확인

## ⚖️ 라이선스

[MIT License](./LICENSE)

본 스킬들은 "있는 그대로" 제공되며, 한국 특허청의 공식 양식이나 변리사 윤리 규정에 100% 부합한다는 보장은 하지 않는다. 실제 출원 전 자격을 갖춘 변리사의 검토가 필요하다.

## 📚 참고 자료

- [한국 특허법 시행규칙 별지 양식](https://www.law.go.kr/) — 공식 명세서 양식
- [Anthropic Claude Skills 문서](https://docs.claude.com)
- 본 패키지의 영감: "스킬 = 절차적 지식 + 도구 + 컴파운딩" 설계 철학

## 🙏 만든 사람

한국 변리사 실무 경험을 기반으로 Claude와 함께 설계.

기여자: [Contributors](https://github.com/lsj4232/KR_PATENT_SKILL/graphs/contributors)
