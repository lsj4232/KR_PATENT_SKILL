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
  ShadingType, PageBreak, PageNumber, Header, Footer
} = docxLib;

// =============================================================================
// 표준 양식 상수 (한국 특허청 별지 양식 기준)
// =============================================================================

const FONT = "나눔고딕";

const SIZE = {
  section_title: 24,  // 12pt - 【발명의 명칭】 등
  sub_title: 22,      // 11pt
  body: 22,           // 11pt - 본문
  small: 20           // 10pt - 부호 표 등
};

const INDENT = {
  body_first_line: 280,    // 본문 첫줄 들여쓰기 (DXA, 약 2글자)
  claim_first_line: 677,   // 청구항 첫줄 (firstLine 677 DXA = firstLineChars 300)
  claim_hanging: 280       // 청구항 매달림 들여쓰기
};

const SPACING = {
  section_before: 480,
  section_after: 240,
  para_after: 120,
  line: 360
};

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
function sectionTitle(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: {
      before: SPACING.section_before,
      after: SPACING.section_after,
      line: SPACING.line
    },
    children: [runK(text, { size: SIZE.section_title, bold: true })]
  });
}

// 본문 단락
function bodyPara(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: {
      before: 0,
      after: opts.afterSpacing || SPACING.para_after,
      line: SPACING.line
    },
    indent: opts.noIndent ? {} : { firstLine: INDENT.body_first_line },
    children: [runK(text, { size: SIZE.body })]
  });
}

// 청구항 단락
function claimPara(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: {
      before: 0,
      after: SPACING.para_after,
      line: SPACING.line
    },
    indent: {
      firstLine: INDENT.claim_first_line,
      hanging: INDENT.claim_hanging
    },
    children: [runK(text, { size: SIZE.body })]
  });
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

function buildSection(title, paragraphs) {
  const blocks = [sectionTitle(title)];
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
function buildDrawingsBrief(drawings) {
  const blocks = [sectionTitle("【도면의 간단한 설명】")];
  drawings.forEach(d => {
    blocks.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: SPACING.para_after, line: SPACING.line },
      children: [runK(`${d.fig}은 ${d.desc}`, { size: SIZE.body })]
    }));
  });
  return blocks;
}

// 부호의 설명 빌더 (표 형태도 가능하지만 한국 실무는 줄 단위가 일반적)
function buildSymbols(symbols) {
  const blocks = [sectionTitle("【부호의 설명】")];
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
function buildClaims(claims) {
  const blocks = [sectionTitle("【청구범위】")];
  claims.forEach(c => {
    blocks.push(claimPara(c));
  });
  return blocks;
}

// =============================================================================
// 메인 빌드
// =============================================================================

function buildDocument(content) {
  const children = [];

  // [발명의 설명] 큰 컨테이너
  if (content.invention_title) {
    children.push(sectionTitle("【발명의 명칭】"));
    children.push(bodyPara(content.invention_title, { noIndent: true }));
  }

  if (content.technical_field) {
    children.push(...buildSection("【기술분야】",
      Array.isArray(content.technical_field) ? content.technical_field : [content.technical_field]));
  }

  if (content.background) {
    children.push(...buildSection("【발명의 배경이 되는 기술】", content.background));
  }

  if (content.problem_to_solve) {
    children.push(...buildSection("【발명의 내용】", []));
    children.push(...buildSection("【해결하고자 하는 과제】", content.problem_to_solve));
  }

  if (content.solution) {
    children.push(...buildSection("【과제의 해결 수단】", content.solution));
  }

  if (content.effects) {
    children.push(...buildSection("【발명의 효과】", content.effects));
  }

  if (content.drawings_brief) {
    children.push(...buildDrawingsBrief(content.drawings_brief));
  }

  if (content.detailed_description) {
    children.push(...buildSection("【발명을 실시하기 위한 구체적인 내용】", content.detailed_description));
  }

  if (content.symbols) {
    children.push(...buildSymbols(content.symbols));
  }

  // 청구범위 (별도 페이지가 자연스럽도록 페이지 브레이크는 옵션)
  if (content.claims) {
    children.push(...buildClaims(content.claims));
  }

  // 요약서
  if (content.abstract) {
    children.push(...buildSection("【요약서】", []));
    children.push(...buildSection("【요약】",
      Array.isArray(content.abstract) ? content.abstract : [content.abstract]));
  }

  // 대표도
  if (content.metadata && content.metadata.representative_drawing) {
    children.push(...buildSection("【대표도】", [content.metadata.representative_drawing]));
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
            top: 1440, right: 1080, bottom: 1440, left: 1080
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
  runK, bodyPara, claimPara, sectionTitle, buildSection, buildSymbols, buildClaims, buildDrawingsBrief,
  FONT, SIZE, INDENT, SPACING
};
