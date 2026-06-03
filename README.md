# KR_PATENT_SKILL

한국 변리사 실무를 위한 Claude 스킬(Skills) 모음. 발명자 미팅, 독립항 작성, 부호 체계 설계, 도면 부호 매핑, 명세서 본문 작성, 권리범위 보강(용어 정의·변형 실시예), 정합성 점검, 자동 정제 루프, docx 출력·후처리, 회고를 통한 스킬 자동 업데이트, **전체 워크플로우 자동 오케스트레이션**까지 — 한국 특허 명세서 작성 전 과정을 **16개 스킬**로 커버한다.

> **스킬(Skills)이란?** Claude가 호출할 수 있는 절차적 지식 패키지. 단순 프롬프트보다 한 단계 위로, 설명(Description) + 지시사항(Instructions) + 도구(Tools)의 3계층 구조. 매번 같은 작업을 새로 설명할 필요 없이 Claude에게 "앱"처럼 호출할 수 있다.

> _English summary at the [bottom of this README](#-english-summary)._

## ✨ 특징

- **조합 가능(Composable)** — 작고 집중된 16개 스킬. 전체 워크플로우 또는 일부만 선택적으로 사용.
- **한국 특허 실무 특화** — 한국 특허청(KIPO) 가이드라인을 자동 반영한다:
  - "종래" 표현 금지 — 종래기술을 자인하는 꼴이 될 수 있으므로 우회한다.
  - "구성되는" 표현 금지 — 영문 명세서 번역 시 권리범위가 한정될 수 있으므로 "포함하는"으로 쓴다.
  - 효과 3단 인과 구조(구조 → 메커니즘 → 이점).
  - 청구항 한정 수치의 배경기술·도면 노출 방지.
- **정형 템플릿 강제** — 독립항 작성(A~L 알고리즘), 본문 S1~S14 정형, 실시예 ITER 10 정형 등 실험으로 수렴된 재사용 템플릿을 자동 적용.
- **권리범위 보강 내장** — 자체 사전(Inventor as Lexicographer) 용어 정의 인라인 삽입 + 16카테고리 변형 실시예 부가로 권리 외연을 확장.
- **실행 가능한 도구 포함** — docx 빌더(`build_kr_patent.js`), 서식 동기화·탐색창 부여(python-docx), 스킬 업데이터(`append_learning.py`)가 실제 코드로 동작.
- **자동 정제 루프** — `kr-patent-ralph-loop`이 결함 0이 될 때까지 점검 → 수정 → 재점검을 자동 반복하여 출원 직전 명세서를 수렴시킨다.
- **컴파운딩 루프 자동화** — 메타 스킬(`kr-patent-skill-updater`)로 회고 → 학습 항목 누적이 자동화된다. 사용할수록 똑똑해진다.
- **전체 워크플로우 한 줄로** — `/full` 또는 "처음부터 끝까지"라고 하면 11단계가 자동 순차 실행되고, 변리사는 주요 결정 단계의 체크포인트에서만 승인한다.

## 📦 스킬 구성 (16개)

| 단계 | 스킬 이름 | 역할 |
|---|---|---|
| 입력·진단 | [`kr-patent-inventor-meeting`](./kr-patent-inventor-meeting/) | 발명자 미팅 질문 생성 (7관점 프레임워크) |
| 입력·진단 | [`kr-patent-stage-recommender`](./kr-patent-stage-recommender/) | 자료 진단 → 어느 Stage부터 시작할지 추천 (진단 게이트) |
| 청구항·부호 | [`kr-patent-claim1-drafting`](./kr-patent-claim1-drafting/) | 독립항(청구항 1) 작성 (A~L 정형 알고리즘) |
| 청구항·부호 | [`kr-patent-symbol-design`](./kr-patent-symbol-design/) | 도면 부호 체계 설계 (계층적 넘버링) |
| 청구항·부호 | [`kr-patent-drawing-mapping`](./kr-patent-drawing-mapping/) | 도면 이미지 OCR → 박스별 1:1 부호 매핑 표 |
| 본문 작성 | [`kr-patent-spec-drafting`](./kr-patent-spec-drafting/) | 명세서 본문 작성 (S1~S14 정형 준수) |
| 권리범위 보강 | [`kr-patent-definition-insertion`](./kr-patent-definition-insertion/) | 자체 사전 용어 정의 인라인 삽입 (4원칙) |
| 권리범위 보강 | [`kr-patent-embodiment-addition`](./kr-patent-embodiment-addition/) | 16카테고리 변형 실시예 부가 (외연 확장) |
| 검토·정합성 | [`kr-patent-consistency-check`](./kr-patent-consistency-check/) | 명세서·도면·청구항 정합성 점검 (Priority A/B/C, tracked changes) |
| 검토·정합성 | [`kr-patent-detail-description-review`](./kr-patent-detail-description-review/) | S13 실시예 본문(ITER 10) 정형 정밀 검토 |
| 검토·정합성 | [`kr-patent-ralph-loop`](./kr-patent-ralph-loop/) | 결함 0까지 점검↔수정 자동 반복 정제 루프 |
| docx 인프라 | [`kr-patent-docx-builder`](./kr-patent-docx-builder/) | 한국 특허 양식 docx 빌드 |
| docx 인프라 | [`kr-patent-format-unify`](./kr-patent-format-unify/) | 신설 단락 서식 동기화 (pPr·rPr 복사) |
| docx 인프라 | [`kr-patent-navigation-pane`](./kr-patent-navigation-pane/) | Word 탐색창 outline level 자동 부여 |
| 오케스트레이션 | [`kr-patent-full-workflow`](./kr-patent-full-workflow/) | **`/full` 전체 워크플로우 오케스트레이터 (11단계)** ★ |
| 메타 | [`kr-patent-skill-updater`](./kr-patent-skill-updater/) | 회고 → 스킬 자동 업데이트 (컴파운딩 루프) |

각 스킬의 SKILL.md 끝에는 `### 누적 학습 항목` 섹션이 있어, `kr-patent-skill-updater`가 회고 결과를 이 섹션에 누적한다.

## 🚀 설치 방법

### 옵션 1: Claude.ai (Skills 기능 사용)

Claude.ai의 Skills 기능에 각 스킬을 업로드한다. (Skills 기능은 일부 환경에서만 사용 가능 — Anthropic 문서 확인.)

각 스킬 폴더(예: `kr-patent-inventor-meeting/`)를 zip으로 압축하여 업로드한다.

### 옵션 2: Claude Code / API

작업 디렉토리 또는 프로젝트의 스킬 경로에 클론한다.

```bash
git clone https://github.com/lsj4232/KR_PATENT_SKILL.git
cd KR_PATENT_SKILL
```

Claude Code 또는 API에서 스킬 경로를 인식하도록 설정한다. 자세한 사용법은 [Anthropic Skills 문서](https://docs.claude.com) 참조.

### 옵션 3: 수동 — Claude에게 스킬 내용을 직접 보여주기

각 SKILL.md 파일의 내용을 Claude 대화 초반에 시스템 메시지처럼 붙여 넣어도 동작한다.

## 📋 의존성

| 스킬 | 의존성 |
|---|---|
| `kr-patent-docx-builder` | Node.js ≥ 18, `docx` npm 패키지 (`^8.5.0`) |
| `kr-patent-format-unify`, `kr-patent-navigation-pane` | Python ≥ 3.8, `python-docx` |
| `kr-patent-skill-updater` | Python ≥ 3.8 (표준 라이브러리만 사용) |
| 나머지 11개 스킬 | 추가 의존성 없음 (텍스트 기반) |

## 🎯 빠른 시작 (사용 예)

### 시나리오 A: 새 발명을 처음부터 명세서까지

```
1. 발명자가 IDS(기술내용설명서) 제출
   ↓
2. [kr-patent-inventor-meeting]  → 발명자 미팅 질문 생성
   ↓ (미팅 후 발명 자료 확정)
3. [kr-patent-claim1-drafting]   → 독립항(청구항 1) 초안 작성
   ↓
4. [kr-patent-symbol-design]     → 부호 체계 확정
   ↓ (도면이 있으면 [kr-patent-drawing-mapping]으로 박스별 부호 매핑)
5. [kr-patent-spec-drafting]     → 명세서 본문 작성 (1차 초안)
   ↓
6. [kr-patent-definition-insertion] → 자체 사전 용어 정의 삽입
   [kr-patent-embodiment-addition]  → 변형 실시예 부가 (권리범위 보강)
   ↓
7. [kr-patent-consistency-check] → 정합성 점검 (Priority A/B/C + 수정안)
   [kr-patent-ralph-loop]        → 결함 0까지 자동 반복 정제 (선택)
   ↓
8. [kr-patent-docx-builder]      → 한국 특허 양식 docx 출력
   [kr-patent-format-unify] / [kr-patent-navigation-pane] → docx 후처리
   ↓
9. [kr-patent-skill-updater]     → 회고 → 다른 스킬들에 학습 항목 누적
```

### 대화 예시

#### ✨ 가장 빠른 방법: `/full` (전체 자동, 11단계)

```
User: "/full" 또는 "처음부터 끝까지 도와줘"
→ Claude가 kr-patent-full-workflow 사용
  ↓
  Stage 0: 현재 자료 자동 점검 → 어느 단계부터 시작할지 판단
           (kr-patent-stage-recommender로 진단 가능)
  ↓
  11단계 순차 실행 (★ 주요 결정 단계에서만 사용자 OK 받음):
    Stage 1)   발명자 미팅 질문 (선택)
    Stage 2)   청구항 확정 확인
    Stage 3)   부호 체계 설계 ★
    Stage 4)   스토리텔링 설계 ★
    Stage 5)   명세서 본문 작성 (1차)
    Stage 6)   권리범위 보강 — 용어 정의 삽입 ★
    Stage 6.5) 권리범위 보강 — 구성요소·파이프라인 구체화 ★
    Stage 7)   권리범위 보강 — 변형 실시예 추가 ★
    Stage 8)   정합성 점검 ★ (어떤 수정 적용할지 결정)
    Stage 9)   수정 반영
    Stage 10)  docx 출력
    Stage 11)  회고 (선택)
```

#### "어디부터 시작하지?" — 진단부터

```
User: "이 명세서 어디까지 됐어? 다음 단계 추천해줘" 또는 "/recommend"
→ Claude가 kr-patent-stage-recommender 사용
  → 자료 현황표 + 추천 시작 Stage + 근거 + 권장 명령(/full <범위>) 1페이지 진단 보고서
```

#### 개별 호출 (특정 작업만)

```
User: "이 발명자 IDS 검토하고 미팅 질문 만들어줘"
→ kr-patent-inventor-meeting

User: "이 논문으로 독립항 초안 작성해줘"
→ kr-patent-claim1-drafting

User: "청구항 확정됐어. 부호 체계 설계해줘"
→ kr-patent-symbol-design   (도면 이미지가 있으면 kr-patent-drawing-mapping)

User: "이 청구항과 도면으로 명세서 본문 작성해줘"
→ kr-patent-spec-drafting

User: "1차 본문 나왔어. 권리범위 보강해줘"
→ kr-patent-definition-insertion → kr-patent-embodiment-addition

User: "명세서 점검해줘"
→ kr-patent-consistency-check   (흠 없을 때까지 자동이면 kr-patent-ralph-loop)

User: "최종 docx로 만들어줘"
→ kr-patent-docx-builder   (서식/탐색창 후처리: kr-patent-format-unify, kr-patent-navigation-pane)

User: "이번 작업 회고하고 스킬에 반영해줘"
→ kr-patent-skill-updater
```

### docx 빌더 직접 사용

```bash
# 의존성 설치
npm install docx

# content.js 작성 (스키마는 kr-patent-docx-builder/references/content-schema.md 참조)
cp kr-patent-docx-builder/references/example-content.js ./content.js
# 각 필드 채우기

# 빌드
node kr-patent-docx-builder/scripts/build_kr_patent.js \
    --content ./content.js \
    --output ./my_patent_spec.docx
```

## 🔄 컴파운딩 루프 — 핵심 차별점

이 패키지의 가장 중요한 설계 결정은 "사용할수록 스킬이 똑똑해지도록 만든 것"이다.

각 SKILL.md 끝에는 `### 누적 학습 항목` 섹션이 있다. `kr-patent-skill-updater` 스킬을 통해:

1. 작업 종료 후 "회고해줘"라고 요청한다.
2. Claude가 지난 대화에서 발견된 패턴/실수/개선점을 추출한다.
3. 사용자 승인 후 `append_learning.py`로 해당 SKILL.md를 자동 업데이트한다 (백업 포함).

```bash
# 학습 항목 추가 (여러 개 동시 가능, 추가 전 .bak.YYYYMMDD-HHMMSS 백업 생성)
python3 kr-patent-skill-updater/scripts/append_learning.py \
    --skill-path kr-patent-spec-drafting/SKILL.md \
    --item "회로 발명에서 V_REF 정전위 조건은 시스템 효과로도 명시해야 함" \
    --item "종속항 효과 누락 빈번 — 청구항군마다 효과 1문장 체크"

# 현재 누적된 학습 항목 조회
python3 kr-patent-skill-updater/scripts/append_learning.py \
    --skill-path kr-patent-spec-drafting/SKILL.md --list
```

5번, 50번 사용할수록 변리사가 자주 빠뜨리는 함정/체크포인트가 누적되어, 새 명세서 작성 시 자동으로 회피한다.

## 📐 한국 특허 가이드라인 요약

본 스킬들이 자동으로 적용하는 규칙들. 세부 카탈로그는 [`kr-patent-spec-drafting/references/ko-patent-style-rules.md`](./kr-patent-spec-drafting/references/ko-patent-style-rules.md) 참조.

### 금지 표현
- "종래", "종래기술" → "기존", "이미", "통상적으로"로 우회
- "구성되는" → "이루어지는" 또는 "포함하는"
- 청구항 한정 수치(예: "100 dB", "10 mV")를 배경기술에 그대로 노출 금지
- 도면 박스 라벨에 청구항 한정 수치 노출 금지
- 해결과제에 수단 시사("~을 이용하여") 금지 — 목적형으로만 기재
- 본문에서 "청구항 X" / "단계 SXXX" 직접 언급 금지 (내부 작성 로직 노출 방지)

### 권장 표현
- 독립항 풀어쓰기: "~한다." (단정) / 종속항: "~할 수 있다." (선택적)
- 효과 3단 인과 구조: 구조 → 메커니즘 → 이점
- 동의어 방어망: "X는 Y로도 명명될 수 있다." (3개 이상)
- 자체 사전: "여기에서, X라 함은 ~를 의미할 수 있다."
- 부정 한정: "다만, 이에 한정되지 않는다."

### 정합성 점검 (출원 전 마지막 게이트)
`kr-patent-consistency-check`가 명세서·도면·청구항 3자 정합성과 S1~S14 정형 준수를 점검하고, 위반을 **Priority A/B/C**로 분류하여 6항목 정형(번호/위치/근거규칙/현황/수정안/부가설명)으로 수정안을 제시한다. 사용자 승인 후 tracked changes(author=IPLAB)로 `.docx`에 반영한다. `kr-patent-ralph-loop`은 이 점검을 결함 0이 될 때까지 자동 반복한다(기본 종료조건 0 Priority A, 최대 5회).

### 명세서 양식 (docx)
- 폰트: 나눔고딕
- 본문: 11pt, 1.5배 줄간격(line 360)
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

자세한 내용은 [CONTRIBUTING.md](./CONTRIBUTING.md) 참조.

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

---

## 🌐 English Summary

GitHub KIPO Korean patent skill SKILL.md claude

GitHub patent specification drafting LLM open source

**KR_PATENT_SKILL** is a suite of **16 composable Claude Skills** for Korean patent attorneys (변리사), covering the entire pre-filing drafting workflow — from inventor interviews through claim drafting, reference-numeral design, specification writing, scope reinforcement, consistency checking, automated refinement, and KIPO-format `.docx` output — plus a meta-skill that compounds lessons learned back into the skills.

| Phase | Skill | Role |
|---|---|---|
| Intake / triage | `kr-patent-inventor-meeting` | Inventor-interview questions (7 perspectives) |
| Intake / triage | `kr-patent-stage-recommender` | Diagnose material → recommend which Stage to start from |
| Claims / numerals | `kr-patent-claim1-drafting` | Draft independent claim 1 (A–L formal algorithm) |
| Claims / numerals | `kr-patent-symbol-design` | Hierarchical reference-numeral scheme |
| Claims / numerals | `kr-patent-drawing-mapping` | OCR drawings → per-box 1:1 numeral mapping |
| Drafting | `kr-patent-spec-drafting` | Specification body per KIPO S1–S14 templates |
| Scope reinforcement | `kr-patent-definition-insertion` | Inline lexicographer definitions (4 principles) |
| Scope reinforcement | `kr-patent-embodiment-addition` | 16-category variant embodiments |
| Review / QA | `kr-patent-consistency-check` | Spec ↔ drawings ↔ claims check (Priority A/B/C, tracked changes) |
| Review / QA | `kr-patent-detail-description-review` | S13 embodiment-body (ITER 10) format review |
| Review / QA | `kr-patent-ralph-loop` | Auto-loop check↔fix until zero defects |
| docx infra | `kr-patent-docx-builder` | Build KIPO-format `.docx` (Node.js ≥ 18, `docx`) |
| docx infra | `kr-patent-format-unify` | Sync formatting of inserted paragraphs (python-docx) |
| docx infra | `kr-patent-navigation-pane` | Add Word outline levels for the Navigation Pane (python-docx) |
| Orchestration | `kr-patent-full-workflow` | `/full` end-to-end orchestrator (11 stages) |
| Meta | `kr-patent-skill-updater` | Retrospective → auto-update skills (compounding loop) |

**Key ideas.** The skills encode Korean patent drafting rules — avoiding prior-art-admitting wording ("종래"), avoiding scope-narrowing wording ("구성되는"), the 3-step causal structure for effects (structure → mechanism → benefit), and keeping claim-limiting numerals out of the background/drawings — and enforce experiment-converged formal templates. A **compounding loop** (`kr-patent-skill-updater`) appends lessons to each skill's `누적 학습 항목` section, so the package gets smarter with use.

**Quick start.** `git clone`, then either upload each skill folder to Claude.ai Skills, point Claude Code/API at the skill path, or paste a `SKILL.md` into the chat. Type `/full` (or "처음부터 끝까지") to run the full 11-stage pipeline; the attorney signs off only at the key decision checkpoints. Provided as-is; have a qualified Korean patent attorney review before filing. Licensed under [MIT](./LICENSE).
