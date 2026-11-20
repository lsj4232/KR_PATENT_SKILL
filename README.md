# KR_PATENT_SKILL

한국 특허 작성 실무를 돕는 24개 Agent Skills와 문서·도면 도구입니다. 발명자료 검토, 청구항·명세서 작성, 정합성 검토, DOCX 출력에 필요한 작업을 선택해 사용합니다.

**고유 도면 작도 프로그램인 [특허 블록도 에디터](patent-block-diagram-app/README.md)와 연동해, 자연어 설명이나 발명자료를 바탕으로 블록도·흐름도까지 직접 만들고 Word 명세서 생성 시 도면 이미지도 자동 삽입합니다.** 도면부호가 표시된 PNG 이미지와 수정 가능한 PBD 원본을 함께 제공하며, 생성한 도면은 에디터에서 이어서 편집할 수 있습니다.

생성하는 모든 도면의 실선 박스에는 아래 예시처럼 오른쪽 아래에 선명한 검은 그림자를 기본으로 넣습니다.

![특허 블록도 에디터 예시](docs/examples/example-agent-system.png)

## 시작하기

1. 저장소를 받습니다: `git clone https://github.com/lsj4232/KR_PATENT_SKILL.git`
2. 필요한 스킬 **폴더 전체**를 사용하는 에이전트의 스킬 경로에 설치합니다. `references/`, `scripts/`도 함께 필요합니다.
3. 자료와 원하는 결과를 지정합니다. 전체 과정은 `kr-patent-full-workflow`, 한 작업은 해당 스킬을 사용합니다.

Claude Code에서는 프로젝트의 `.claude/skills/<skill-name>/` 또는 개인 `~/.claude/skills/<skill-name>/`에 둘 수 있습니다. 실제 호출은 `/kr-patent-full-workflow`처럼 스킬 이름을 사용합니다. `/full`, `/recommend` 단축 명령은 이 저장소에서 등록하지 않습니다. [공식 설치·호출 안내](https://code.claude.com/docs/en/skills)

Claude의 스킬 업로드 기능을 이용할 때는 각 스킬 폴더와 참고자료를 함께 압축합니다. 전체 워크플로우에는 해당 단계의 다른 스킬도 설치되어 있어야 합니다. 도면 에디터는 별도 앱이므로 아래 안내에 따라 준비합니다.

예시 요청:

- “이 IDS로 청구항과 명세서 초안을 작성해줘. 불확실한 내용은 따로 표시해줘.”
- “이 문서는 검토만 해줘. 청구항·본문·도면의 불일치를 위치와 함께 알려줘.”
- “내용은 확정했어. 이 JSON을 DOCX로 만들어줘.”

## 스킬 선택

| 작업 | 스킬 |
|---|---|
| 미팅 질문 | [inventor-meeting](kr-patent-inventor-meeting/SKILL.md) |
| 현재 자료 진단·다음 작업 | [stage-recommender](kr-patent-stage-recommender/SKILL.md) |
| 독립항 | [claim1-drafting](kr-patent-claim1-drafting/SKILL.md) |
| 종속항·추가 독립항 | [dependent-claim-drafting](kr-patent-dependent-claim-drafting/SKILL.md) |
| 부호 체계 | [symbol-design](kr-patent-symbol-design/SKILL.md) |
| 도면 객체·부호 매핑 | [drawing-mapping](kr-patent-drawing-mapping/SKILL.md) |
| PNG 부호 삽입 | [drawing-tagging](kr-patent-drawing-tagging/SKILL.md) |
| 명세서 본문 | [spec-drafting](kr-patent-spec-drafting/SKILL.md) |
| 용어 정의 | [definition-insertion](kr-patent-definition-insertion/SKILL.md) |
| 구현 설명 보완 | [implementation-elaboration](kr-patent-implementation-elaboration/SKILL.md) |
| 변형 실시예 | [embodiment-addition](kr-patent-embodiment-addition/SKILL.md) |
| 전체 정합성 점검 | [consistency-check](kr-patent-consistency-check/SKILL.md) |
| 실시예 본문 집중 검토 | [detail-description-review](kr-patent-detail-description-review/SKILL.md) |
| 제한된 반복 정제 | [ralph-loop](kr-patent-ralph-loop/SKILL.md) |
| 선행기술 검색식 | [search-query](kr-patent-search-query/SKILL.md) |
| 선행기술 보고서 | [prior-art-report](kr-patent-prior-art-report/SKILL.md) |
| 새 블록도·흐름도 | [patent-block-diagram](patent-block-diagram/SKILL.md) |
| 기존 PBD 수정 | [patent-block-diagram-refine](patent-block-diagram-refine/SKILL.md) |
| DOCX 생성 | [docx-builder](kr-patent-docx-builder/SKILL.md) |
| 기존 DOCX 서식 | [format-unify](kr-patent-format-unify/SKILL.md) |
| Word 탐색창 | [navigation-pane](kr-patent-navigation-pane/SKILL.md) |
| DOCX → HLZ | [docx-to-hlz](docx-to-hlz/SKILL.md) |
| 여러 단계 이어서 수행 | [full-workflow](kr-patent-full-workflow/SKILL.md) |
| 요청에 따른 스킬 개선 | [skill-updater](kr-patent-skill-updater/SKILL.md) |

전체 흐름은 자료 확인 → 청구항 → 도면·부호 → 본문 → 필요한 보완 → 검토·수정 → 출력입니다. AI·소프트웨어·제어·시스템 풀명세서의 실시예 본문은 600문장·25,000자·30페이지 이상을 권장합니다. 기본·변형·선택·대체 실시예를 작성하고, 구성요소마다 정의·구체화·조건 또는 변형을 설명하며, 보완 문단은 15~25문장으로 작성합니다. [SW/AI 풀명세서 작성 기준](kr-patent-spec-drafting/references/sw-ai-spec-supplement.md#풀명세서-작성-기준)을 참고하세요. 특정 문체와 ITER 10 템플릿은 요청한 경우에 선택합니다.

## 도구와 의존성

문서 지침만 사용하는 작업에는 아래 실행 환경이 모두 필요하지 않습니다.

| 기능 | 실행 환경 |
|---|---|
| DOCX 빌더 | Node.js, `kr-patent-docx-builder/package-lock.json`에 고정된 의존성 (`npm ci`) |
| 서식·탐색창 후처리 | Python, `python-docx` |
| PNG 부호 태깅 | Python, `opencv-python`, `numpy`, `Pillow` 및 사용 폰트 |
| DOCX → HLZ | Python, `python-docx`, `Pillow` |
| HWPX 보고서 | Python; 페이지 측정은 Windows·한글 COM·`pywin32` 필요 |
| 스킬 업데이터 | Python 표준 라이브러리 |
| 블록도 에디터 | Node.js·Electron, 앱의 잠금 파일에 따른 설치 |

DOCX 예시:

```bash
cd kr-patent-docx-builder
npm ci
node scripts/build_kr_patent.js --content /path/to/content.json --output /path/to/draft.docx
```

[입력 스키마](kr-patent-docx-builder/references/content-schema.md)를 사용합니다. `figures`에 도면 이미지의 `path`를 지정하면 Word 생성 시 PNG/JPEG를 도면 페이지에 자동 삽입합니다. 이미지 비율을 유지해 페이지 안에 맞추며, 상대 경로는 입력 콘텐츠 파일의 폴더를 기준으로 읽습니다. 기존 Word 편집을 보존해야 하는 경우 재빌드하지 말고 해당 문서를 편집합니다.

## 한국 특허 명세서 양식에 맞춘 Word 탐색창

Word 명세서를 만들 때 각 제목의 개요 수준을 한국 특허 명세서 양식의 항목에 맞춰 자동으로 설정합니다. Word의 **보기 → 탐색 창**에서 `【발명의 설명】`, `【청구범위】`, `【요약서】`, `【도면】`을 펼치고, 하위 항목이나 개별 청구항·도면으로 바로 이동할 수 있습니다. 기존 DOCX에도 같은 제목 계층을 적용할 수 있습니다. [Word 탐색창 스킬](kr-patent-navigation-pane/SKILL.md)

![한국 특허 명세서의 상위 항목과 하위 제목이 계층으로 표시된 Word 탐색창](docs/examples/word-navigation-pane.png)

## Word 명세서를 HLZ로 변환

**HLZ(`.hlz`)는 한국 특허 전자출원에서 출원서에 첨부하는 명세서 등 제출파일 형식**입니다. 명세서 XML과 도면 이미지 등을 하나의 압축 파일로 묶습니다. [특허로 명세서작성기 사용자 설명서, 4.10.1절](https://www.patent.go.kr/smart/docs/download/MOIPEditorManual.pdf)

한국 특허 명세서의 식별항목(`【발명의 명칭】`, `【청구항 1】` 등)이 있는 Word 파일을 주고 **“이 DOCX를 HLZ로 변환해줘”**라고 요청하면 `.hlz` 파일로 변환합니다. 현재 변환기는 Word 표를 지원하지 않습니다. [DOCX → HLZ 변환 스킬](docx-to-hlz/SKILL.md)

## 특허 블록도 에디터

[patent-block-diagram-app](patent-block-diagram-app/README.md)은 PBD 원본을 편집하고 PNG로 내보내는 Electron 앱입니다. 실행·렌더링 상세는 앱과 도면 스킬 안내를 따릅니다.

```bash
cd patent-block-diagram-app
npm ci
npm start
```

에이전트용 인스턴스는 사용자 작업 창과 별도의 `--user-data-dir`를 사용합니다. CDP 연결·렌더링이 필요한 경우에만 실행합니다.

## 검증·유지보수

```bash
python -m pip install -r requirements-dev.txt
python scripts/validate_skills.py
python -m unittest discover -s tests -v
```

[기여 안내](CONTRIBUTING.md), [정리 기준과 공식 참고자료](docs/skill-maintenance.md), [행동 평가 사례](evals/skill-cases.json)를 참고하세요. 구조 검사와 스크립트 테스트는 모델의 실무 판단 성능 검증과 구분합니다.

이 도구는 업무 보조용입니다. 개별 출원의 법적 요건은 적용 시점의 공식 기준과 자료로 검토해야 하며, 점검 통과가 등록·출원 적합성을 보증하지 않습니다. 비공개 발명자료를 공개 예시나 스킬에 포함하지 마세요.

## English summary

24 composable skills for Korean patent drafting, review, document output, and diagrams. Install only the skills needed for your task. Instructions distinguish technical evidence from optional writing conventions; references load on demand. See each skill for inputs, tooling, and limits.

MIT License — see [LICENSE](LICENSE).
