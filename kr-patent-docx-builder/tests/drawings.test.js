const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const JSZip = require("jszip");
const { xml2js } = require("xml-js");

const builder = path.resolve(__dirname, "../scripts/build_kr_patent.js");
const wide = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAwAAAADCAIAAAAoQXllAAAAFElEQVR4nGP8//8/AyHARFAFsYoAR4QDA2tRdrQAAAAASUVORK5CYII=", "base64");
const tall = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAMAAAASCAIAAAARwPPWAAAAFElEQVR4nGP8//8/AxgwQaghwAIAIWQDIQcar5YAAAAASUVORK5CYII=", "base64");

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "patent-drawings-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "도면"));
  fs.writeFileSync(path.join(dir, "도면", "가로.png"), wide);
  fs.writeFileSync(path.join(dir, "도면", "세로.png"), tall);
  return dir;
}

function build(dir, content) {
  const input = path.join(dir, "content.json");
  const output = path.join(dir, "result.docx");
  fs.writeFileSync(input, JSON.stringify(content));
  const result = spawnSync(process.execPath, [builder, "--content", input, "--output", output], {
    cwd: os.tmpdir(), encoding: "utf8"
  });
  return { ...result, output };
}

test("CLI embeds relative and absolute figure paths with aspect ratio and page bounds", async t => {
  const dir = setup(t);
  const result = build(dir, {
    invention_title: "도면 삽입 검증",
    layout: { margin: { left: 1800, right: 1800, top: 1800, bottom: 1800 } },
    figures: [
      { num: 2, path: "도면/가로.png", caption: "가로 도면" },
      { num: 4, path: path.join(dir, "도면", "세로.png"), caption: "세로 도면" }
    ]
  });
  assert.equal(result.status, 0, result.stderr);
  const zip = await JSZip.loadAsync(fs.readFileSync(result.output));
  const media = zip.file(/^word\/media\/[^/]+$/);
  assert.equal(media.length, 2, "both drawings must be embedded, not just captions");
  const images = await Promise.all(media.map(f => f.async("nodebuffer")));
  assert.ok(images.some(data => data.equals(wide)));
  assert.ok(images.some(data => data.equals(tall)));
  const xml = await zip.file("word/document.xml").async("string");
  const doc = xml2js(xml, { compact: true });
  const paragraphs = doc["w:document"]["w:body"]["w:p"];
  const drawings = paragraphs.filter(p => p["w:r"]?.["w:drawing"]);
  assert.equal(drawings.length, 2);
  drawings.forEach((p, i) => {
    assert.equal(p["w:pPr"]["w:jc"]._attributes["w:val"], "center");
    const extent = p["w:r"]["w:drawing"]["wp:inline"]["wp:extent"]._attributes;
    const width = Number(extent.cx), height = Number(extent.cy);
    assert.ok(width <= (11906 - 3600) * 635 + 1);
    assert.ok(height <= (16838 - 3600 - 2400 - 600 - 240) * 635 + 1);
    assert.ok(Math.abs(width / height - [4, 1 / 6][i]) < 0.001);
  });
  assert.match(xml, /【도면 2】/);
  assert.match(xml, /【도면 4】/);
  assert.equal((xml.match(/<w:pageBreakBefore\/>/g) || []).length, 2);
  const rels = await zip.file("word/_rels/document.xml.rels").async("string");
  assert.equal((rels.match(/relationships\/image/g) || []).length, 2);
});

test("caption-only figures remain supported", async t => {
  const result = build(setup(t), { figures: [{ num: 1, caption: "기존 캡션" }] });
  assert.equal(result.status, 0, result.stderr);
  const zip = await JSZip.loadAsync(fs.readFileSync(result.output));
  assert.equal(zip.file(/^word\/media\/[^/]+$/).length, 0);
  assert.match(await zip.file("word/document.xml").async("string"), /기존 캡션/);
});

test("a missing or invalid drawing fails without writing an incomplete document", t => {
  const dir = setup(t);
  for (const file of ["missing.png", "invalid.png"]) {
    if (file === "invalid.png") fs.writeFileSync(path.join(dir, file), "not an image");
    const result = build(dir, { figures: [{ num: 7, path: file }] });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /도면 7/);
    assert.match(result.stderr, new RegExp(file.replace(".", "\\.")));
    assert.equal(fs.existsSync(result.output), false);
  }
});
