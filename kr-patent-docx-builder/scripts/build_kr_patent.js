// =============================================================================
// 한국 특허청 양식 docx 빌더
// =============================================================================
//
// 사용법:
//   1) 본 스킬 디렉토리에서 최초 1회 `npm install` 실행 (docx 모듈 설치)
//   2) 작업 디렉토리에 content.js 작성 (스키마는 references/content-schema.md 참조)
//   3) node scripts/build_kr_patent.js [--content <path>] [--output <path>]
//
// 또는 본 스크립트를 작업 디렉토리에 복사하여 build.js로 이름 변경 후 실행:
//   cp /path/to/skill/scripts/build_kr_patent.js ./build.js
//   node build.js
//
// =============================================================================

const fs = require("fs");
const path = require("path");

let docxLib;
try {
  docxLib = require("docx");
} catch (e) {
  console.error(
    "[kr-patent-docx-builder] docx 모듈을 찾을 수 없습니다.\n" +
    "  해결: kr-patent-docx-builder 디렉토리에서 `npm install` 실행하세요.\n" +
    "  (package.json의 dependencies가 설치됩니다)"
  );
  process.exit(1);
}

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageBreak, PageNumber, Header, Footer, Tab, TabStopType
} = docxLib;

// =============================================================================
// 표준 양식 상수 (한국 특허청 별지 양식 기준)
// =============================================================================

const FONT = "맑은 고딕";

const SIZE = {
  section_title: 24,  // 12pt - 【발명의 명칭】 등 (본문과 동일 크기, bold로만 구분)
  sub_title: 24,      // 12pt
  body: 24,           // 12pt - 본문
  small: 22           // 11pt - 부호 표 등
};

const INDENT = {
  body_first_line: 280,    // 본문 첫줄 들여쓰기 (DXA, 약 2글자)
  claim_first_line: 677,   // 청구항 첫줄 (firstLine 677 DXA = firstLineChars 300)
  claim_hanging: 280,      // 청구항 매달림 들여쓰기
  claim_tab_pos: 1021      // 청구항 탭 정지 위치 (사무소 서식, claim_tab=true일 때)
};

const SPACING = {
  section_before: 480,
  section_after: 240,
  para_after: 120,
  line: 480           // 2.0배 줄간격 (240=1.0, 360=1.5, 480=2.0)
};

// 본문 정렬 · 용지 여백 — content.layout 으로 덮어쓸 수 있다
const LAYOUT = {
  body_align: "JUSTIFIED",
  l1_center: false,        // 【발명의 설명】·【청구범위】·【요약서】·【도면】 가운데 정렬
  title_indent: false,     // 발명의 명칭 단락 첫줄 들여쓰기
  drawings_indent: false,  // 【도면의 간단한 설명】 각 줄 첫줄 들여쓰기                                  // "JUSTIFIED" | "LEFT"
  claim_tab: true,         // 청구항 들여쓰기를 firstLine 대신 실제 탭 문자로 (사무소 서식 ★)
  claim_linebreak: true,   // 청구항 본문을 구성요소 경계마다 문단 분할 (2026-08-11 확정)
  margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 }  // DXA
};

// content.layout = { indent:{...}, spacing:{...}, body_align:"LEFT", margin:{...} }
function applyLayout(layout) {
  if (!layout) return;
  Object.assign(INDENT, layout.indent || {});
  Object.assign(SPACING, layout.spacing || {});
  if (layout.body_align) LAYOUT.body_align = layout.body_align;
  ["l1_center", "title_indent", "drawings_indent", "claim_tab", "claim_linebreak"].forEach(k => {
    if (layout[k] !== undefined) LAYOUT[k] = layout[k];
  });
  Object.assign(LAYOUT.margin, layout.margin || {});
}

// =============================================================================
// Run / Paragraph 헬퍼
// =============================================================================

function runK(text, opts = {}) {
  return new TextRun({
    text: text,
    font: {
      name: FONT,
      eastAsia: FONT,
      hAnsi: FONT,
      hAnt: FONT
    },
    size: opts.size || SIZE.body,
    bold: opts.bold || false,
    color: opts.color || "000000"
  });
}

// 섹션 타이틀: 【발명의 명칭】 등
// opts.level: 1 = 최상위(【발명의 설명】·【청구범위】·【요약서】·【대표도】),
//             2 = 표준 섹션(default),
//             3 = 【발명의 내용】 하위(【해결하고자 하는 과제】·【과제의 해결 수단】·【발명의 효과】)
function sectionTitle(text, opts = {}) {
  const level = typeof opts.level === "number" ? opts.level : 2;
  return new Paragraph({
    alignment: (LAYOUT.l1_center && level === 1) ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: {
      before: SPACING.section_before,
      after: SPACING.section_after,
      line: SPACING.line
    },
    outlineLevel: level - 1,  // docx는 0-based: Level 1 → outlineLevel 0
    children: [runK(text, { size: SIZE.section_title, bold: true })]
  });
}

// 본문 단락
function bodyPara(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType[LAYOUT.body_align],
    spacing: {
      before: 0,
      after: opts.afterSpacing || SPACING.para_after,
      line: SPACING.line
    },
    indent: opts.noIndent ? {} : { firstLine: INDENT.body_first_line },
    children: [runK(text, { size: SIZE.body })]
  });
}

// 문단 첫머리에 실제 <w:tab/> 를 넣는 단락 (w:ind 미부여 — 탭이 들여쓰기를 담당)
// 사무소 서식: 【발명의 명칭】 본문 + 【청구항 N】 각 문단
function tabPara(text) {
  return new Paragraph({
    alignment: AlignmentType[LAYOUT.body_align],
    spacing: { before: 0, after: SPACING.para_after, line: SPACING.line },
    tabStops: [{ type: TabStopType.LEFT, position: INDENT.claim_tab_pos }],
    children: [
      new TextRun({
        children: [new Tab(), text],
        font: { name: FONT, eastAsia: FONT, hAnsi: FONT, hAnt: FONT },
        size: SIZE.body
      })
    ]
  });
}

// 청구항 본문 → 문단(줄) 배열
// 분할 규칙 (2026-08-11 사용자 확정, 사무소 서식):
//   (1) 종속항 전제부 "제N항에 있어서," 를 1행으로 분리
//   (2) 방법항 구성요소 경계 "단계;" / "단계; 및" 뒤에서 분할
//   (3) 시스템·장치항 물리 블록 경계 "~부; 및" 뒤에서 분할
//   (4) 시스템·장치·프로그램항의 제어부 동작 "~하고," / "~하며," 뒤에서 분할
//       ⚠ (4)를 방법항에 적용하면 단계 내부의 "~검출하고," 에서 잘못 끊긴다 → 말미 판정으로 차단
function splitClaimLines(text) {
  const NL = "@@NL@@";
  let s = String(text).trim();
  const isDeviceOrProgram = /(시스템|장치|서버|단말|프로그램)\.\s*$/.test(s);

  s = s.replace(/^(제\d+항(?:\s*내지\s*제\d+항)?에 있어서,)\s*/, (m, g1) => g1 + NL);
  s = s.replace(/(단계;\s*및)\s*/g, () => "단계; 및" + NL);
  s = s.replace(/(단계;)(?!\s*및)\s*/g, (m, g1) => g1 + NL);
  if (isDeviceOrProgram) {
    s = s.replace(/(부;\s*및)\s*/g, () => "부; 및" + NL);
    s = s.replace(/(하고,|하며,)\s*/g, (m, g1) => g1 + NL);
  }

  return s.split(NL).map(t => t.trim()).filter(Boolean);
}

// 청구항 단락 (LAYOUT.claim_tab / claim_linebreak 에 따라 서식·분할 결정)
function claimPara(text) {
  if (LAYOUT.claim_tab) return tabPara(text);
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: {
      before: 0,
      after: SPACING.para_after,
      line: SPACING.line
    },
    indent: INDENT.claim_hanging
      ? { firstLine: INDENT.claim_first_line, hanging: INDENT.claim_hanging }
      : { firstLine: INDENT.claim_first_line },
    children: [runK(text, { size: SIZE.body })]
  });
}

// 청구항 1건 → 문단 배열
function claimParas(text) {
  const lines = LAYOUT.claim_linebreak ? splitClaimLines(text) : [String(text).trim()];
  return lines.map(l => claimPara(l));
}

// 빈 단락 (섹션 간 간격)
function emptyPara() {
  return new Paragraph({
    spacing: { after: 60 },
    children: [runK("", {})]
  });
}

// =============================================================================
// 섹션 빌더
// =============================================================================

function buildSection(title, paragraphs, opts = {}) {
  const blocks = [sectionTitle(title, opts)];
  if (Array.isArray(paragraphs)) {
    paragraphs.forEach(p => {
      if (typeof p === "string") {
        blocks.push(bodyPara(p));
      } else if (p && typeof p === "object") {
        blocks.push(p);
      }
    });
  } else if (typeof paragraphs === "string") {
    blocks.push(bodyPara(paragraphs));
  }
  return blocks;
}

// 도면의 간단한 설명 빌더
// 조사 은/는: 도면 번호 끝자리의 한국어 독음 받침 기준 (영·일·삼·육·칠·팔=은 / 이·사·오·구=는)
function figJosa(fig) {
  const m = String(fig).match(/(\d)\s*$/);
  if (!m) return "은";
  return "2459".includes(m[1]) ? "는" : "은";
}
function buildDrawingsBrief(drawings) {
  const blocks = [sectionTitle("【도면의 간단한 설명】", { level: 2 })];
  drawings.forEach(d => {
    blocks.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: SPACING.para_after, line: SPACING.line },
      indent: LAYOUT.drawings_indent ? { firstLine: INDENT.body_first_line } : {},
      children: [runK(`${d.fig}${figJosa(d.fig)} ${d.desc}`, { size: SIZE.body })]
    }));
  });
  return blocks;
}

// 부호의 설명 빌더 (표 형태도 가능하지만 한국 실무는 줄 단위가 일반적)
function buildSymbols(symbols) {
  const blocks = [sectionTitle("【부호의 설명】", { level: 2 })];
  symbols.forEach(s => {
    blocks.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 60, line: SPACING.line },
      children: [runK(`${s.num}: ${s.name}`, { size: SIZE.body })]
    }));
  });
  return blocks;
}

// 청구범위 빌더
// claims는 (a) 문자열 배열 — 청구항 본문만 — 또는 (b) {num, text} 객체 배열
//   객체 배열로 주면 각 청구항마다 【청구항 N】 헤더(Level 2 outline)를 출력
function buildClaims(claims) {
  const blocks = [sectionTitle("【청구범위】", { level: 1 })];
  claims.forEach((c, idx) => {
    if (typeof c === "string") {
      // 헤더 자동 생성
      blocks.push(sectionTitle(`【청구항 ${idx + 1}】`, { level: 2 }));
      blocks.push(...claimParas(c));
    } else if (c && typeof c === "object") {
      const num = c.num || idx + 1;
      blocks.push(sectionTitle(`【청구항 ${num}】`, { level: 2 }));
      // text가 배열이면 이미 사용자가 줄을 나눈 것으로 보고 자동 분할하지 않는다
      const body = Array.isArray(c.text) ? c.text : null;
      if (body) body.forEach(b => blocks.push(claimPara(b)));
      else blocks.push(...claimParas(c.text));
    }
  });
  return blocks;
}

// 도면 페이지 빌더 — 【도면】 컨테이너 (L1) + 【도면 N】 개별 페이지 (L2)
function buildDrawingsSection(figures) {
  const blocks = [sectionTitle("【도면】", { level: 1 })];
  figures.forEach((f, idx) => {
    const num = (f && f.num) || idx + 1;
    blocks.push(sectionTitle(`【도면 ${num}】`, { level: 2 }));
    if (f && f.caption) {
      blocks.push(bodyPara(f.caption, { noIndent: true }));
    }
  });
  return blocks;
}

// 실시예 본문 소제목 — Level 3 (1., 2., ...) / Level 4 (2-1., 6-1., ...)
// detailed_description 콘텐츠가 객체({heading, level, paragraphs})로 들어오면 sub-heading 출력
function buildDetailedDescription(items) {
  const blocks = [sectionTitle("【발명을 실시하기 위한 구체적인 내용】", { level: 2 })];
  items.forEach(item => {
    if (typeof item === "string") {
      blocks.push(bodyPara(item));
    } else if (item && typeof item === "object") {
      if (item.heading) {
        const lvl = item.level || 3;  // default L3
        blocks.push(sectionTitle(`【${item.heading}】`, { level: lvl }));
      }
      const paras = item.paragraphs || [];
      paras.forEach(p => {
        if (typeof p === "string") blocks.push(bodyPara(p));
        else if (p && typeof p === "object") blocks.push(p);
      });
    }
  });
  return blocks;
}

// =============================================================================
// 메인 빌드
// =============================================================================

function buildDocument(content) {
  const children = [];

  // 【발명의 설명】 — Level 1 컨테이너 (Word 탐색 창 최상위)
  children.push(sectionTitle("【발명의 설명】", { level: 1 }));

  if (content.invention_title) {
    children.push(sectionTitle("【발명의 명칭】", { level: 2 }));
    children.push(LAYOUT.claim_tab
      ? tabPara(content.invention_title)   // 사무소 서식: 명칭도 탭 들여쓰기
      : bodyPara(content.invention_title, { noIndent: !LAYOUT.title_indent }));
  }

  if (content.technical_field) {
    children.push(...buildSection("【기술분야】",
      Array.isArray(content.technical_field) ? content.technical_field : [content.technical_field],
      { level: 2 }));
  }

  if (content.background) {
    children.push(...buildSection("【발명의 배경이 되는 기술】", content.background, { level: 2 }));
  }

  if (content.problem_to_solve) {
    children.push(...buildSection("【발명의 내용】", [], { level: 2 }));
    children.push(...buildSection("【해결하고자 하는 과제】", content.problem_to_solve, { level: 3 }));
  }

  if (content.solution) {
    children.push(...buildSection("【과제의 해결 수단】", content.solution, { level: 3 }));
  }

  if (content.effects) {
    children.push(...buildSection("【발명의 효과】", content.effects, { level: 3 }));
  }

  if (content.drawings_brief) {
    children.push(...buildDrawingsBrief(content.drawings_brief));
  }

  if (content.detailed_description) {
    children.push(...buildDetailedDescription(content.detailed_description));
  }

  // 부호의 설명 섹션 — 한국 변리사 실무상 default 생략. symbols가 없거나 빈 배열이면 건너뜀.
  if (content.symbols && content.symbols.length > 0) {
    children.push(...buildSymbols(content.symbols));
  }

  // 청구범위 (별도 페이지가 자연스럽도록 페이지 브레이크는 옵션)
  if (content.claims) {
    children.push(...buildClaims(content.claims));
  }

  // 요약서
  if (content.abstract) {
    children.push(...buildSection("【요약서】", [], { level: 1 }));
    children.push(...buildSection("【요약】",
      Array.isArray(content.abstract) ? content.abstract : [content.abstract],
      { level: 2 }));
  }

  // 대표도 — Level 2 (요약서 컨테이너 하위 또는 독립)
  if (content.metadata && content.metadata.representative_drawing) {
    children.push(...buildSection("【대표도】", [content.metadata.representative_drawing], { level: 2 }));
  }

  // 도면 페이지 (【도면】 컨테이너 + 【도면 N】) — Level 1 + Level 2
  if (content.figures && content.figures.length > 0) {
    children.push(...buildDrawingsSection(content.figures));
  }

  // Document 객체 생성
  return new Document({
    creator: "kr-patent-docx-builder",
    title: (content.metadata && content.metadata.invention_title) || "특허 명세서",
    styles: {
      default: {
        document: {
          run: {
            font: {
              name: FONT,
              eastAsia: FONT,
              hAnsi: FONT
            },
            size: SIZE.body
          }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },  // A4 (DXA)
          margin: {
            top: LAYOUT.margin.top, right: LAYOUT.margin.right,
            bottom: LAYOUT.margin.bottom, left: LAYOUT.margin.left
          }
        }
      },
      children: children
    }]
  });
}

// =============================================================================
// CLI 진입점
// =============================================================================

function main() {
  // 인자 파싱
  const args = process.argv.slice(2);
  let contentPath = null;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--content" && i + 1 < args.length) {
      contentPath = args[i + 1];
      i++;
    } else if (args[i] === "--output" && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    }
  }

  // 기본값: 동일 디렉토리의 content.js
  if (!contentPath) {
    contentPath = path.join(process.cwd(), "content.js");
  }

  if (!fs.existsSync(contentPath)) {
    console.error(`Error: content file not found at ${contentPath}`);
    console.error(`Create content.js (see references/content-schema.md) or pass --content <path>`);
    process.exit(1);
  }

  // content 로드
  const absContentPath = path.resolve(contentPath);
  const content = require(absContentPath);
  applyLayout(content.layout);

  // 기본 output 경로
  if (!outputPath) {
    const fileLabel = (content.metadata && content.metadata.file_label) || "patent_spec";
    outputPath = `/mnt/user-data/outputs/${fileLabel}.docx`;
  }

  // 빌드
  const doc = buildDocument(content);

  Packer.toBuffer(doc).then(buffer => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    console.log(`✓ Built: ${outputPath}`);
    const stat = fs.statSync(outputPath);
    console.log(`  File size: ${stat.size} bytes`);
  }).catch(err => {
    console.error("Build error:", err);
    process.exit(1);
  });
}

// 모듈로 사용될 때와 CLI로 실행될 때 분리
if (require.main === module) {
  main();
}

module.exports = {
  buildDocument,
  runK, bodyPara, claimPara, sectionTitle, buildSection,
  buildSymbols, buildClaims, buildDrawingsBrief, buildDrawingsSection, buildDetailedDescription,
  FONT, SIZE, INDENT, SPACING
};
