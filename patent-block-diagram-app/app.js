'use strict'

const svg = document.getElementById('canvas')
const wrap = document.getElementById('wrap')

const FONT = "'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif"
const SHADOW = 5   // 오프셋 음영 두께(px)
const FS = 15      // 폰트 크기
const LH = 20      // 줄 간격
const GRID = 5     // 스냅 격자

let state = { boxes: [], arrows: [], tags: [], nextId: 1 }
let selection = null        // 주 선택 { type: 'box'|'arrow'|'tag', id } — 툴바·텍스트 편집창의 대상
let multi = []              // 선택 전체 (주 선택 포함). Ctrl+A·Shift+클릭으로 여러 개가 된다
let arrowMode = false
let arrowSource = null
let lastArrowStyle = 'straight'
let undoStack = []
let zoom = 1                          // 화면 확대 배율 (도면 데이터에는 영향 없음)
const ZOOM_MIN = 0.25, ZOOM_MAX = 4

const $ = id => document.getElementById(id)
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const snap = v => Math.round(v / GRID) * GRID
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function uid() { return state.nextId++ }

// ---------- 이미지 저장소 ----------
// 이미지 본문(data URL)은 state 밖에 둔다. state 안에 넣으면 실행 취소 스냅샷마다
// 수 MB짜리 base64가 통째로 복사되어 금세 메모리를 잡아먹는다. state 에는 id만 남는다.
// 저장할 때만 참조된 이미지를 _images 로 묶어 파일에 싣는다.
const imageStore = new Map()      // imgId → data URL (원본 문자열)
const blobUrls = new Map()        // imgId → blob URL (렌더용 짧은 주소)

function putImage(dataURL) {
  const id = 'i' + uid()
  imageStore.set(id, dataURL)
  return id
}

// 화면 렌더에는 data URL 대신 blob URL 을 쓴다.
// 드래그 중에는 render()가 초당 수십 번 도는데, 그때마다 수 MB짜리 base64를
// innerHTML 문자열에 이어 붙이면 눈에 띄게 버벅인다.
function imageHref(id) {
  if (blobUrls.has(id)) return blobUrls.get(id)
  const d = imageStore.get(id)
  if (!d) return ''
  const m = /^data:([^;]+);base64,(.*)$/.exec(d)
  if (!m) return d
  const bin = atob(m[2])
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  const u = URL.createObjectURL(new Blob([arr], { type: m[1] }))
  blobUrls.set(id, u)
  return u
}

// 파일에서 읽은 도면은 이미지 본문을 _images 에 달고 온다 — 저장소로 옮기고 state 에서는 뺀다
function adoptImages(s) {
  if (s && s._images) {
    for (const id of Object.keys(s._images)) imageStore.set(id, s._images[id])
    delete s._images
  }
  return s
}

// 저장용 직렬화: 지금 도면이 실제로 쓰는 이미지만 골라 싣는다 (지운 이미지는 파일에 남지 않는다)
function serialize() {
  const used = {}
  for (const b of state.boxes) {
    for (const key of ['imgId', 'origImgId']) {
      if (b[key] && imageStore.has(b[key])) used[b[key]] = imageStore.get(b[key])
    }
  }
  const out = { ...state }
  if (Object.keys(used).length) out._images = used
  return JSON.stringify(out, null, 2)
}

// ---------- 선택 (단일 / 다중) ----------
// selection 은 주 선택(툴바 상태와 텍스트 편집창이 따라간다), multi 는 선택된 전체 목록.
// 하나만 고른 평범한 경우 multi 는 [selection] 한 개짜리다.
function setSelection(s) { selection = s; multi = s ? [s] : [] }
function clearSelection() { selection = null; multi = [] }
function isSelected(type, id) { return multi.some(s => s.type === type && s.id === id) }
function toggleSelection(type, id) {
  const i = multi.findIndex(s => s.type === type && s.id === id)
  if (i >= 0) {
    multi.splice(i, 1)
    if (selection && selection.type === type && selection.id === id) selection = multi[multi.length - 1] || null
  } else {
    selection = { type, id }
    multi.push(selection)
  }
}
function selectAll() {
  multi = [
    ...state.boxes.map(b => ({ type: 'box', id: b.id })),
    ...state.arrows.map(a => ({ type: 'arrow', id: a.id })),
    ...state.tags.map(t => ({ type: 'tag', id: t.id }))
  ]
  selection = multi[0] || null
  render()
}
// 선택된 실제 객체들 (박스/화살표/태그 뒤섞임)
function selectedElements() {
  return multi.map(s => {
    if (s.type === 'box') return boxById(s.id)
    if (s.type === 'arrow') return state.arrows.find(a => a.id === s.id)
    return state.tags.find(t => t.id === s.id)
  }).filter(Boolean)
}

// ---------- z-order (화살표·박스·태그 통합 순서) ----------
function allEls() { return [...state.arrows, ...state.boxes, ...state.tags] }
// 저장 파일 등에 z가 없으면 현재 렌더 순서(화살표→박스→태그)대로 z 부여
function ensureZ() {
  const all = allEls()
  if (all.every(e => typeof e.z === 'number')) return
  let z = 1
  for (const e of all) e.z = z++
}
function zTop() { return allEls().reduce((m, e) => Math.max(m, e.z || 0), 0) }
function zBottom() { return allEls().reduce((m, e) => Math.min(m, e.z || 0), 0) }
function nextZ() { return zTop() + 1 }
function boxById(id) { return state.boxes.find(b => b.id === id) }
function center(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 } }

function pushUndo() {
  undoStack.push(JSON.stringify(state))
  if (undoStack.length > 100) undoStack.shift()
}

function undo() {
  if (!undoStack.length) return
  state = JSON.parse(undoStack.pop())
  clearSelection()
  arrowMode = false
  arrowSource = null
  render()
}

// ---------- 렌더링 ----------

function render() {
  let out = `<defs>
    <marker id="ah" viewBox="0 0 12 10" refX="11" refY="5" markerWidth="6" markerHeight="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L12,5 L0,10 Z" fill="black"/></marker>
    <marker id="ah-sel" viewBox="0 0 12 10" refX="11" refY="5" markerWidth="6" markerHeight="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L12,5 L0,10 Z" fill="#2b7de9"/></marker>
    <pattern id="hatch" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="30" height="30" fill="white"/><line x1="0" y1="0" x2="0" y2="30" stroke="black" stroke-width="0.9"/></pattern>
    <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="white"/><circle cx="3.5" cy="3.5" r="1.1" fill="black"/></pattern>
  </defs>`
  ensureZ()
  const items = []
  state.arrows.forEach(a => items.push({ z: a.z, s: renderArrow(a) }))
  state.boxes.forEach(b => items.push({ z: b.z, s: renderBox(b) }))
  state.tags.forEach(t => items.push({ z: t.z, s: renderTag(t) }))
  items.sort((p, q) => p.z - q.z)   // z 오름차순: 작을수록 아래, 클수록 위
  for (const it of items) out += it.s
  out += endpointHandles()          // 조작 핸들은 항상 최상단
  out += guideOverlay()             // 스마트 가이드는 그보다 더 위 (끄는 중에만 존재)
  svg.innerHTML = out
  fitCanvas()

  $('btn-arrow').classList.toggle('active', arrowMode)
  $('btn-guides').classList.toggle('active', smartGuidesOn)
  if (pickMode && !imageBoxes().length) pickMode = false   // 이미지를 다 지우면 모드도 풀린다
  $('btn-pick').classList.toggle('active', pickMode)
  $('btn-pick').disabled = !imageBoxes().length
  document.body.classList.toggle('pick', pickMode)
  $('btn-img-reset').disabled = !selectedBoxes().some(b => b.shape === 'image' && b.origImgId && b.imgId !== b.origImgId)
  $('btn-style').disabled = !(selection && selection.type === 'arrow')
  const hasArrow = arrowTargets().length > 0
  $('btn-as-down').disabled = !hasArrow
  $('btn-as-up').disabled = !hasArrow
  $('btn-as-reset').disabled = !hasArrow
  $('as-label').textContent = arrowSizeLabel()
  const boxSel = multi.some(s => s.type === 'box')
  $('btn-dash').disabled = !boxSel
  $('btn-frame').disabled = !boxSel
  $('btn-math').disabled = !boxSel
  $('btn-math').classList.toggle('active', boxSel && selectedBoxes().every(b => b.math))
  $('btn-hatch').disabled = !boxSel
  $('btn-hatch').classList.toggle('active', boxSel && selectedBoxes().every(b => b.hatch))
  $('btn-ep-reset').disabled = !(selection && selection.type === 'arrow' &&
    (() => { const a = state.arrows.find(a => a.id === selection.id); return a && (a.fromOff || a.toOff || a.bend) })())
  $('btn-tag').disabled = !(multi.length === 1 && selection && selection.type === 'box')
  $('btn-front').disabled = !multi.length
  $('btn-back').disabled = !multi.length
  $('btn-del').disabled = !multi.length
  const hasText = fontTargets().length > 0
  $('btn-fs-down').disabled = !hasText
  $('btn-fs-up').disabled = !hasText
  $('btn-fs-reset').disabled = !hasText
  $('fs-label').textContent = fontLabel()
  $('sel-label').textContent = multi.length > 1 ? multi.length + '개 선택' : ''
  syncEditField()
}

// 캔버스는 기본 2400x1600이되, 도면이 그보다 크면 내용을 다 담도록 늘린다
// (안 늘리면 오른쪽·아래쪽 요소가 SVG 밖으로 잘려 보이지도, 잡히지도 않는다)
const CANVAS_MIN_W = 2400, CANVAS_MIN_H = 1600, CANVAS_PAD = 120
function fitCanvas() {
  let mx = 0, my = 0
  for (const b of state.boxes) { mx = Math.max(mx, b.x + b.w); my = Math.max(my, b.y + b.h) }
  for (const t of state.tags) {
    const b = boxById(t.boxId)
    if (!b) continue
    const fs = fsOf(t)
    mx = Math.max(mx, b.x + t.dx + textWidth(t.label, fs) / 2 + 10)
    my = Math.max(my, b.y + t.dy + fs)
  }
  const w = Math.max(CANVAS_MIN_W, Math.ceil(mx + CANVAS_PAD))
  const h = Math.max(CANVAS_MIN_H, Math.ceil(my + CANVAS_PAD))
  if (+svg.getAttribute('width') !== w) svg.setAttribute('width', w)
  if (+svg.getAttribute('height') !== h) svg.setAttribute('height', h)
  // wrap 도 같이 늘려야 스크롤 범위가 따라온다 (CSS 고정 크기를 덮어쓴다)
  wrap.style.width = w + 'px'
  wrap.style.height = h + 'px'
}

// 툴바 텍스트 편집창: 선택된 박스의 텍스트 / 태그의 부호를 실시간 편집
function editTarget() {
  if (!selection || multi.length > 1) return null   // 여러 개 선택 중엔 텍스트 편집을 막는다
  if (selection.type === 'box') {
    const b = boxById(selection.id)
    return b && b.shape === 'image' ? null : b      // 이미지 상자에는 글자가 없다
  }
  if (selection.type === 'tag') return state.tags.find(t => t.id === selection.id)
  return null
}

function syncEditField() {
  const et = $('edit-text')
  const target = editTarget()
  et.disabled = !target
  if (document.activeElement === et) return
  et.value = target ? (selection.type === 'box' ? target.text : target.label) : ''
}

function cylRy(b) { return Math.min(14, b.h / 4) }

// 구름 윤곽. 겹쳐 놓은 원 여러 개의 바깥 테두리(합집합)를 실제로 계산해 잇는다.
// 이웃 점을 반원으로 잇는 손쉬운 방법은 골이 깊어 꽃 모양이 되므로 쓰지 않는다.
// 단위 정사각형에서 계산한 뒤 상자 크기로 늘리므로, 상자가 정사각형이 아니면 호도 같은 비율로 늘어난다.
const CLOUD_LOBES = [           // [중심u, 중심v, 반지름] — 타원을 따라 둘러 놓은 혹
  [0.80, 0.50, 0.20], [0.65, 0.69, 0.17], [0.35, 0.69, 0.22],
  [0.20, 0.50, 0.18], [0.35, 0.31, 0.21], [0.65, 0.31, 0.17]
]

// 두 원의 교점 중 바깥쪽(중심에서 먼 쪽)
function outerIntersect(c1, c2) {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1]
  const d = Math.hypot(dx, dy)
  if (!d || d > c1[2] + c2[2]) return { u: (c1[0] + c2[0]) / 2, v: (c1[1] + c2[1]) / 2 }
  const a = (c1[2] * c1[2] - c2[2] * c2[2] + d * d) / (2 * d)
  const hh = Math.sqrt(Math.max(0, c1[2] * c1[2] - a * a))
  const mx = c1[0] + a * dx / d, my = c1[1] + a * dy / d
  const px = -dy / d * hh, py = dx / d * hh
  const A = { u: mx + px, v: my + py }, B = { u: mx - px, v: my - py }
  return Math.hypot(A.u - 0.5, A.v - 0.5) >= Math.hypot(B.u - 0.5, B.v - 0.5) ? A : B
}

function cloudPath(b, ox, oy) {
  const L = CLOUD_LOBES
  const n = L.length
  const J = L.map((_, i) => outerIntersect(L[i], L[(i + 1) % n]))   // 혹 i 와 i+1 이 만나는 점
  const X = p => b.x + ox + p.u * b.w
  const Y = p => b.y + oy + p.v * b.h
  let d = `M ${X(J[n - 1])} ${Y(J[n - 1])}`
  for (let i = 0; i < n; i++) {
    const c = L[i], from = J[(i - 1 + n) % n], to = J[i]
    const a1 = Math.atan2(from.v - c[1], from.u - c[0])
    const a2 = Math.atan2(to.v - c[1], to.u - c[0])
    let delta = a2 - a1
    while (delta < 0) delta += Math.PI * 2
    const large = delta > Math.PI ? 1 : 0
    d += ` A ${c[2] * b.w} ${c[2] * b.h} 0 ${large} 1 ${X(to)} ${Y(to)}`
  }
  return d + ' Z'
}

// 사람(이용자) 아이콘. 머리 원 + 어깨에서 이어지는 상반신 하나로 닫힌 도형.
// 팔을 따로 그리면 몸에서 떨어져 보여 넣지 않는다. 특허 도면 관례대로 음영 없이 선만 그린다
function personSVG(b, stroke) {
  const cx = b.x + b.w / 2
  const r = Math.min(b.w, b.h) * 0.18
  const hy = b.y + r + b.h * 0.05                 // 머리 중심
  const top = hy + r + b.h * 0.09                 // 어깨 꼭대기
  const by = b.y + b.h * 0.84                     // 몸통 아랫선
  const half = b.w * 0.40
  const st = ` fill="white" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"`
  // 아래 양쪽에서 시작해 어깨로 부드럽게 올라붙는 상반신
  const body = `M ${cx - half} ${by} C ${cx - half} ${top + (by - top) * 0.15},` +
    ` ${cx - half * 0.42} ${top}, ${cx} ${top}` +
    ` C ${cx + half * 0.42} ${top}, ${cx + half} ${top + (by - top) * 0.15}, ${cx + half} ${by} Z`
  return `<path d="${body}"${st}/>` +
    `<circle cx="${cx}" cy="${hy}" r="${r}" fill="white" stroke="${stroke}" stroke-width="2"/>`
}

// 도형 하나의 SVG 마크업 (음영용: stroke 없이 검정 채움 + 오프셋)
function shapeSVG(b, ox, oy, fill, stroke) {
  const x = b.x + ox, y = b.y + oy, w = b.w, h = b.h
  const dash = b.dash ? ` stroke-dasharray="12 7"` : ''
  const st = stroke ? ` stroke="${stroke}" stroke-width="${b.lw || 2}"${dash}` : ''
  if (b.shape === 'round') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(14, h / 3)}" fill="${fill}"${st}/>`
  }
  if (b.shape === 'diamond') {
    return `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" fill="${fill}"${st}/>`
  }
  if (b.shape === 'cloud') {
    return `<path d="${cloudPath(b, ox, oy)}" fill="${fill}"${st}/>`
  }
  if (b.shape === 'cylinder') {
    const ry = cylRy(b), rx = w / 2
    const sil = `M ${x} ${y + ry} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} L ${x + w} ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} Z`
    const rim = `M ${x} ${y + ry} A ${rx} ${ry} 0 0 0 ${x + w} ${y + ry}`
    return `<path d="${sil}" fill="${fill}"${st}/>` + (stroke ? `<path d="${rim}" fill="none"${st}/>` : '')
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${st}/>`
}

// 요소별 폰트 크기 (fs 가 없으면 기본값 FS). 줄 간격은 폰트에 비례해 따라간다
function fsOf(el) { return (el && typeof el.fs === 'number') ? el.fs : FS }
function lhOf(el) { return Math.round(fsOf(el) * LH / FS) }

// ---------- 수식(LaTeX) ----------
// MathJax 로 조판한 SVG 조각을 캐시해 둔다. render() 는 조작할 때마다 불리므로
// 매번 조판하면 눈에 띄게 느려진다. 키는 TeX 원문 하나면 된다 —
// 크기는 그릴 때 scale 로 맞추므로 폰트 크기별로 따로 조판하지 않는다.
const mathCache = new Map()

function mathReady() { return !!(window.MathJax && MathJax.tex2svg) }

// TeX → { inner, vb } (vb = [minX, minY, w, h], 1em = 1000 단위)
function mathFragment(tex) {
  const key = String(tex)
  if (mathCache.has(key)) return mathCache.get(key)
  let out = null
  if (mathReady()) {
    try {
      const svg = MathJax.tex2svg(key, { display: true }).querySelector('svg')
      const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number)
      if (svg && vb.length === 4 && vb.every(n => isFinite(n))) {
        out = { inner: svg.innerHTML, vb }
      }
    } catch (e) { out = null }   // TeX 오류는 조용히 글자 렌더로 되돌린다
  }
  mathCache.set(key, out)
  return out
}

// 박스 안에 수식을 가운데 맞춰 그린다. 조판이 실패하면 null 을 돌려 글자 렌더로 넘긴다
function mathSVG(b, col) {
  const f = mathFragment(b.text)
  if (!f) return null
  const s = fsOf(b) / 1000
  const w = f.vb[2] * s, h = f.vb[3] * s
  const cy = b.textTop ? b.y + 12 + h / 2 : b.y + b.h / 2
  const x0 = b.x + b.w / 2 - w / 2, y0 = cy - h / 2
  // color 를 지정해 두면 MathJax 가 붙인 fill="currentColor" 가 여기를 따라온다
  return `<g transform="translate(${x0 - s * f.vb[0]} ${y0 - s * f.vb[1]}) scale(${s})"` +
    ` style="color:${col}">${f.inner}</g>`
}

// 조판기가 늦게 뜨면 그때 한 번 다시 그린다
window.addEventListener('mathjax-ready', () => { mathCache.clear(); render() })

function renderBox(b) {
  const sel = isSelected('box', b.id)
  const src = arrowSource === b.id
  const stroke = src ? '#e2723a' : (sel ? '#2b7de9' : 'black')
  // 이미지 상자: 테두리·음영·글자 없이 그림만 놓는다. 선택 중일 때만 파선 안내틀을 덧그린다
  // (내보내기 직전에 선택이 풀리므로 PNG 에는 안 나온다)
  if (b.shape === 'image') {
    return `<g data-type="box" data-id="${b.id}" class="el">
      <image href="${imageHref(b.imgId)}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" preserveAspectRatio="none"/>
      ${sel || src ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="4 4"/>` : ''}
      ${sel && multi.length === 1 ? `<rect data-type="resize" data-id="${b.id}" x="${b.x + b.w - 6}" y="${b.y + b.h - 6}" width="12" height="12" fill="#2b7de9"/>` : ''}
    </g>`
  }
  // 사람 아이콘: 음영 없이 선만 그리고, 글자가 있으면 아이콘 아래에 놓는다
  if (b.shape === 'person') {
    const fs0 = fsOf(b)
    const label = String(b.text).trim()
      ? `<text x="${b.x + b.w / 2}" y="${b.y + b.h - 2}" text-anchor="middle" font-size="${fs0}" font-weight="bold">${esc(b.text)}</text>`
      : ''
    return `<g data-type="box" data-id="${b.id}" class="el">
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="transparent"/>
      ${personSVG(b, stroke)}
      ${label}
      ${sel && multi.length === 1 ? `<rect data-type="resize" data-id="${b.id}" x="${b.x + b.w - 6}" y="${b.y + b.h - 6}" width="12" height="12" fill="#2b7de9"/>` : ''}
    </g>`
  }
  const mathBody = b.math ? mathSVG(b, sel ? '#2b7de9' : '#000') : null
  const lines = String(b.text).split('\n')
  const fs = fsOf(b), lh = lhOf(b)
  // textTop: 다른 박스를 품는 컨테이너용 — 글자를 가운데가 아니라 위쪽에 붙인다
  // 구름은 몸통이 아래쪽에 몰려 있어 글자를 조금 내려 잡는다
  const cy = b.textTop ? b.y + fs + 7
    : b.shape === 'cylinder' ? b.y + cylRy(b) + b.h / 2
    : b.shape === 'cloud' ? b.y + b.h * 0.58
    : b.y + b.h / 2
  const y0 = cy - (lines.length - 1) * lh / 2
  const texts = lines.map((ln, i) =>
    `<text x="${b.x + b.w / 2}" y="${y0 + i * lh}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="bold">${esc(ln)}</text>`
  ).join('')
  // noFrame: 테두리·음영·채움 없는 순수 글자 상자 (도면 주석·라벨용).
  // 그려지는 게 글자뿐이라 잡을 곳이 없으므로 투명 사각형을 깔아 클릭 영역을 만든다.
  // 선택 중일 때만 파선 안내틀을 덧그린다 — 내보내기 직전에 선택이 해제되므로 PNG에는 안 나온다.
  const body = b.noFrame
    ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="transparent"/>` +
      (sel || src ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="4 4"/>` : '')
    // 구름은 특허 도면 관례대로 음영 없이 선만 그린다 (noShadow 로 다른 도형도 끌 수 있다)
    : (b.dash || b.noShadow || b.shape === 'cloud' ? '' : shapeSVG(b, SHADOW, SHADOW, 'black', null)) +
      shapeSVG(b, 0, 0, b.dash ? 'none' : (b.hatch ? (b.hatch === 'dot' ? 'url(#dots)' : 'url(#hatch)') : 'white'), stroke)
  return `<g data-type="box" data-id="${b.id}" class="el">
    ${body}
    ${mathBody || texts}
    ${sel && multi.length === 1 ? `<rect data-type="resize" data-id="${b.id}" x="${b.x + b.w - 6}" y="${b.y + b.h - 6}" width="12" height="12" fill="#2b7de9"/>` : ''}
  </g>`
}

// 직선 화살표: 두 박스 중심을 잇는 선이 테두리와 만나는 점
function borderPoint(b, p) {
  const c = center(b)
  const dx = p.x - c.x, dy = p.y - c.y
  if (!dx && !dy) return c
  if (b.shape === 'diamond') {
    const k = Math.abs(dx) / (b.w / 2) + Math.abs(dy) / (b.h / 2)
    return { x: c.x + dx / k, y: c.y + dy / k }
  }
  const sx = dx !== 0 ? (b.w / 2) / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? (b.h / 2) / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  return { x: c.x + dx * s, y: c.y + dy * s }
}

// 직각 화살표의 중간 꺾임 위치. 양 끝점 사이를 0~1로 나눈 비율이며 손대지 않았으면 한가운데(0.5).
// 절대좌표가 아니라 비율로 두는 이유 — 박스를 옮기거나 크기를 바꿔도 꺾임이 비례해서 따라오게 하려고
// (PowerPoint 의 꺾인 연결선 조절점과 같은 방식). 0~1 밖으로도 끌 수 있고, 그때는 선이 되돌아 나간다.
function bendT(a, axis) {
  return (a && a.bend && a.bend.axis === axis && typeof a.bend.t === 'number') ? a.bend.t : 0.5
}

// 자동 라우팅되는 직각 경로. 꺾임점 목록과 함께, 꺾임 조절에 필요한 정보를 같이 낸다.
//   axis   꺾임이 움직이는 방향 ('x' = 가운데 세로 구간이 좌우로, 'y' = 가로 구간이 위아래로)
//   v1,v2  비율 t=0 / t=1 에 해당하는 좌표 (박스를 옮겨도 비율이 유지되는 기준)
//   v      지금의 꺾임 좌표
function orthoRoute(a, s, t) {
  const sc = center(s), tc = center(t)
  if (Math.abs(tc.x - sc.x) >= Math.abs(tc.y - sc.y)) {
    const x1 = tc.x >= sc.x ? s.x + s.w : s.x
    const x2 = tc.x >= sc.x ? t.x : t.x + t.w
    if (sc.y === tc.y) return { pts: [{ x: x1, y: sc.y }, { x: x2, y: tc.y }] }
    const mx = x1 + (x2 - x1) * bendT(a, 'x')
    // 꺾임 x가 박스의 가로 범위 안까지 들어오면 좌·우변이 아니라 위·아래변에 붙인다.
    // 안 그러면 마지막 가로 구간이 화살촉보다 짧아져 화살촉이 엉뚱하게 옆을 향한다.
    const inS = mx >= s.x && mx <= s.x + s.w
    const inT = mx >= t.x && mx <= t.x + t.w
    const down = tc.y >= sc.y
    const pts = [inS ? { x: mx, y: down ? s.y + s.h : s.y } : { x: x1, y: sc.y }]
    if (!inS) pts.push({ x: mx, y: sc.y })
    if (!inT) pts.push({ x: mx, y: tc.y })
    pts.push(inT ? { x: mx, y: down ? t.y : t.y + t.h } : { x: x2, y: tc.y })
    return { pts, axis: 'x', v1: x1, v2: x2, v: mx }
  }
  const y1 = tc.y >= sc.y ? s.y + s.h : s.y
  const y2 = tc.y >= sc.y ? t.y : t.y + t.h
  if (sc.x === tc.x) return { pts: [{ x: sc.x, y: y1 }, { x: tc.x, y: y2 }] }
  const my = y1 + (y2 - y1) * bendT(a, 'y')
  const inS = my >= s.y && my <= s.y + s.h
  const inT = my >= t.y && my <= t.y + t.h
  const right = tc.x >= sc.x
  const pts = [inS ? { x: right ? s.x + s.w : s.x, y: my } : { x: sc.x, y: y1 }]
  if (!inS) pts.push({ x: sc.x, y: my })
  if (!inT) pts.push({ x: tc.x, y: my })
  pts.push(inT ? { x: right ? t.x : t.x + t.w, y: my } : { x: tc.x, y: y2 })
  return { pts, axis: 'y', v1: y1, v2: y2, v: my }
}

// 손으로 옮긴 끝점(fromOff/toOff)은 박스 좌상단 기준 상대좌표 → 박스를 옮겨도 따라온다
function manualPoint(off, b) {
  return off ? { x: b.x + off.dx, y: b.y + off.dy } : null
}

// 끝점이 손으로 지정된 경우의 직각 경로 (꺾임 비율은 자동 경로와 똑같이 적용된다).
// 끝점이 박스가 아니라 점으로 못박혀 있으므로 진입면을 다시 고르지는 않는다.
function orthoRouteManual(p0, p1, a) {
  if (p0.x === p1.x || p0.y === p1.y) return { pts: [p0, p1] }
  if (Math.abs(p1.x - p0.x) >= Math.abs(p1.y - p0.y)) {
    const mx = p0.x + (p1.x - p0.x) * bendT(a, 'x')
    return { pts: [p0, { x: mx, y: p0.y }, { x: mx, y: p1.y }, p1], axis: 'x', v1: p0.x, v2: p1.x, v: mx }
  }
  const my = p0.y + (p1.y - p0.y) * bendT(a, 'y')
  return { pts: [p0, { x: p0.x, y: my }, { x: p1.x, y: my }, p1], axis: 'y', v1: p0.y, v2: p1.y, v: my }
}

// 길이 0인 구간을 걷어낸다. 남겨두면 화살촉 방향(marker orient)이 그 구간을 따라가 제멋대로 돈다
function dedupePoints(pts) {
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = out[out.length - 1]
    if (Math.abs(p.x - q.x) > 0.01 || Math.abs(p.y - q.y) > 0.01) out.push(p)
  }
  return out.length > 1 ? out : pts.slice(0, 2)
}

// 화살표 한 개의 경로 + 꺾임 정보 (끝점을 손으로 옮겼으면 그 점을 그대로 쓴다)
function arrowRoute(a, s, t) {
  const fp = manualPoint(a.fromOff, s)
  const tp = manualPoint(a.toOff, t)
  let r
  // via: 경유점(절대좌표) 목록. 다른 블록을 피해 여백으로 돌아가는 회귀선처럼
  // 자동 라우팅으로는 나오지 않는 경로를 못박을 때 쓴다. 지정하면 꺾임 계산을 하지 않는다.
  if (a.via && a.via.length) {
    const v = a.via.map(p => ({ x: p.x, y: p.y }))
    const p0 = fp || borderPoint(s, v[0])
    const p1 = tp || borderPoint(t, v[v.length - 1])
    return { pts: dedupePoints([p0, ...v, p1]) }
  }
  if (!fp && !tp) {
    r = a.style === 'ortho' ? orthoRoute(a, s, t)
      : { pts: [borderPoint(s, center(t)), borderPoint(t, center(s))] }
  } else {
    const p0 = fp || borderPoint(s, tp)    // 한쪽만 수동이면 나머지는 그 점을 향하는 테두리점
    const p1 = tp || borderPoint(t, fp)
    r = a.style === 'ortho' ? orthoRouteManual(p0, p1, a) : { pts: [p0, p1] }
  }
  r.pts = dedupePoints(r.pts)
  return r
}

function arrowPath(a, s, t) { return arrowRoute(a, s, t).pts }

function renderArrow(a) {
  const s = boxById(a.from), t = boxById(a.to)
  if (!s || !t) return ''
  const sel = isSelected('arrow', a.id)
  const pts = arrowPath(a, s, t)
  const d = 'M ' + pts.map(p => `${p.x} ${p.y}`).join(' L ')
  const col = sel ? '#2b7de9' : 'black'
  const lw = arrowWidth(a)
  return `<g data-type="arrow" data-id="${a.id}" class="el">
    <path d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(14, lw + 12)}"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="${lw}"${a.dash ? ` stroke-dasharray="${lw * 5.5} ${lw * 3.5}"` : ''} marker-end="url(#${sel ? 'ah-sel' : 'ah'})"/>
  </g>`
}

// 선택된 화살표의 끝점 핸들 — 박스에 가리지 않도록 z와 무관하게 항상 맨 위에 그린다
function endpointHandles() {
  if (multi.length !== 1 || !selection || selection.type !== 'arrow') return ''
  const a = state.arrows.find(a => a.id === selection.id)
  if (!a) return ''
  const s = boxById(a.from), t = boxById(a.to)
  if (!s || !t) return ''
  const pts = arrowPath(a, s, t)
  const h = (p, end) =>
    `<rect data-type="ep" data-id="${a.id}" data-end="${end}" x="${p.x - 6}" y="${p.y - 6}" width="12" height="12" fill="white" stroke="#2b7de9" stroke-width="2"/>`
  return bendHandle(a, s, t) + h(pts[0], 'from') + h(pts[pts.length - 1], 'to')
}

// 중간 꺾임 손잡이 — 옮길 수 있는 구간이 있는 직각 화살표에만 나온다.
// 그 구간 위에 굵은 투명선을 깔아 선 자체를 잡아끌 수 있게 하고, 한가운데에 주황 손잡이를 얹는다.
function bendHandle(a, s, t) {
  const g = bendGeom(a, s, t)
  if (!g) return ''
  const { p1, p2, axis, mx, my } = g
  const grip = axis === 'x'
    ? `<rect x="${mx - 4}" y="${my - 9}" width="8" height="18" rx="3" fill="#f0a000" stroke="white" stroke-width="1.5"/>`
    : `<rect x="${mx - 9}" y="${my - 4}" width="18" height="8" rx="3" fill="#f0a000" stroke="white" stroke-width="1.5"/>`
  return `<g data-type="bend" data-id="${a.id}" data-axis="${axis}">
    <path d="M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}" fill="none" stroke="transparent" stroke-width="14"/>
    ${grip}
  </g>`
}

// 꺾임 손잡이를 그릴 수 있는지 판정하고 필요한 좌표를 모아준다.
// axis 'x' = 옮길 구간이 세로선이라 좌우로 움직인다, 'y' = 가로선이라 위아래로 움직인다.
// 진입면이 바뀌어 점이 2~3개로 줄어든 경로에서도 그 구간을 찾아낸다.
function bendGeom(a, s, t) {
  const r = arrowRoute(a, s, t)
  if (!r.axis) return null
  const span = r.v2 - r.v1
  if (!span) return null                              // 양 끝이 같은 좌표면 비율을 잡을 수 없다
  const along = (p, q) => r.axis === 'x'
    ? Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) > 0.01
    : Math.abs(q.y - p.y) < 0.01 && Math.abs(q.x - p.x) > 0.01
  const i = r.pts.findIndex((p, k) => k + 1 < r.pts.length && along(p, r.pts[k + 1]))
  if (i < 0) return null
  const p1 = r.pts[i], p2 = r.pts[i + 1]
  return { p1, p2, axis: r.axis, span, v1: r.v1, v0: r.v, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 }
}

// 부호 태그가 박스 테두리에 닿는 지점
function nearestBorderPoint(b, p) {
  if (b.shape === 'diamond') return borderPoint(b, p)
  const x = clamp(p.x, b.x, b.x + b.w)
  const y = clamp(p.y, b.y, b.y + b.h)
  if (x !== p.x || y !== p.y) return { x, y }
  const dl = p.x - b.x, dr = b.x + b.w - p.x, dt = p.y - b.y, db = b.y + b.h - p.y
  const m = Math.min(dl, dr, dt, db)
  if (m === dl) return { x: b.x, y: p.y }
  if (m === dr) return { x: b.x + b.w, y: p.y }
  if (m === dt) return { x: p.x, y: b.y }
  return { x: p.x, y: b.y + b.h }
}

// 글자 실제 폭 측정 (지시선을 부호 글자에 물리지 않게 물러나게 하려면 필요)
const measureCtx = document.createElement('canvas').getContext('2d')
function textWidth(s, fs) {
  measureCtx.font = `bold ${fs}px ${FONT}`
  return measureCtx.measureText(String(s)).width
}

// 부호 글자를 감싸는 상자의 경계까지 거리 — 방향 (ux,uy)로 나갈 때 얼마나 물러나야 하는가.
// 고정값(예전 14px)을 쓰면 'S150' 처럼 넓은 부호에서 선이 글자를 파고든다.
function labelBackoff(label, fs, ux, uy) {
  const halfW = textWidth(label, fs) / 2 + 5   // 좌우 여백 5px
  const halfH = fs / 2 + 4                     // 상하 여백 4px
  const sx = ux !== 0 ? halfW / Math.abs(ux) : Infinity
  const sy = uy !== 0 ? halfH / Math.abs(uy) : Infinity
  return Math.min(sx, sy)
}

function renderTag(tg) {
  const b = boxById(tg.boxId)
  if (!b) return ''
  const sel = isSelected('tag', tg.id)
  const col = sel ? '#2b7de9' : 'black'
  const fs = fsOf(tg)
  const L = { x: b.x + tg.dx, y: b.y + tg.dy }       // 부호 숫자 위치
  const A = nearestBorderPoint(b, L)                  // 박스 테두리 접점
  const vx = L.x - A.x, vy = L.y - A.y
  const len = Math.hypot(vx, vy) || 1
  const ux = vx / len, uy = vy / len
  const back = labelBackoff(tg.label, fs, ux, uy)     // 글자 폭만큼 물러난다
  // ul: 전체를 지시하는 부호(1000, 2000)는 특허 도면 관례상 밑줄을 긋는다.
  // text-decoration="underline" 은 알파벳 기준선을 따라가는데 여기서는 dominant-baseline 이
  // central 이라 줄이 글자 '위'로 올라간다. 그래서 선을 직접 그린다.
  const ulW = textWidth(tg.label, fs)
  const ulY = L.y + fs * 0.46
  const ul = tg.ul
    ? `<line x1="${L.x - ulW / 2}" y1="${ulY}" x2="${L.x + ulW / 2}" y2="${ulY}" stroke="${col}" stroke-width="${Math.max(1.5, fs / 14)}"/>`
    : ''
  const text = `<text x="${L.x}" y="${L.y}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="bold" fill="${col}">${esc(tg.label)}</text>${ul}`
  // 부호를 박스에 바짝 붙여 놓으면 지시선이 들어갈 자리가 없다 — 이때는 선을 그리지 않는다
  if (len - back < 6) return `<g data-type="tag" data-id="${tg.id}" class="el">${text}</g>`
  const end = { x: L.x - ux * back, y: L.y - uy * back }
  const l2 = len - back
  const amp = Math.min(7, l2 / 3)
  const nx = -uy, ny = ux
  const c1 = { x: A.x + ux * l2 / 3 + nx * amp, y: A.y + uy * l2 / 3 + ny * amp }
  const c2 = { x: A.x + ux * l2 * 2 / 3 - nx * amp, y: A.y + uy * l2 * 2 / 3 - ny * amp }
  return `<g data-type="tag" data-id="${tg.id}" class="el">
    <path d="M ${A.x} ${A.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}" fill="none" stroke="${col}" stroke-width="1.5"/>
    ${text}
  </g>`
}

// ---------- 스마트 가이드 (이동 중 정렬·등간격 안내) ----------
// PowerPoint 의 스마트 가이드와 같은 동작. 끌고 있는 도형의 가장자리·중심이 다른 도형과
// 맞아떨어지면 붉은 파선이 뜨면서 그 자리에 붙고, 좌우(또는 위아래) 간격이 같아지는 순간에는
// 양끝 화살표로 등간격을 알려준다. Alt 를 누른 채 끌면 붙지 않는다.

const SNAP_TOL = 6        // 이 거리 안이면 붙는다 (화면 기준. 확대 배율로 나눠 체감을 일정하게)
let smartGuidesOn = true
let guideLines = []       // { type: 'v'|'h', at, a, b }
let guideSpans = []       // { type: 'x'|'y', from, to, at }

function clearGuides() { guideLines = []; guideSpans = [] }

// 주축/부축 필드 이름표. axis 'x' = 가로 방향으로 재는 경우
function ax(axis) {
  return axis === 'x'
    ? { p: 'x', s: 'w', q: 'y', t: 'h', r1: 'x1', r2: 'x2', c1: 'y1', c2: 'y2' }
    : { p: 'y', s: 'h', q: 'x', t: 'w', r1: 'y1', r2: 'y2', c1: 'x1', c2: 'x2' }
}

// 끌고 있는 도형들을 하나로 묶은 사각형
function movingRect(movers, dx, dy) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const o of movers) {
    x1 = Math.min(x1, o.ox + dx); y1 = Math.min(y1, o.oy + dy)
    x2 = Math.max(x2, o.ox + dx + o.b.w); y2 = Math.max(y2, o.oy + dy + o.b.h)
  }
  return { x1, y1, x2, y2 }
}

// 가장자리·중심 맞춤. 가장 가까운 한 곳만 고른다
function alignOn(R, statics, axis, tol) {
  const mv = axis === 'x' ? [R.x1, (R.x1 + R.x2) / 2, R.x2] : [R.y1, (R.y1 + R.y2) / 2, R.y2]
  let best = null
  for (const s of statics) {
    const sv = axis === 'x' ? [s.x, s.x + s.w / 2, s.x + s.w] : [s.y, s.y + s.h / 2, s.y + s.h]
    for (const v of sv) for (const m of mv) {
      const d = v - m
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: v }
    }
  }
  return best
}

// 안내선을 어디부터 어디까지 그릴지 — 맞물린 도형들을 모두 덮도록 늘린다
function alignSpan(R, statics, axis, at) {
  let a = axis === 'x' ? R.y1 : R.x1
  let b = axis === 'x' ? R.y2 : R.x2
  for (const s of statics) {
    const vals = axis === 'x' ? [s.x, s.x + s.w / 2, s.x + s.w] : [s.y, s.y + s.h / 2, s.y + s.h]
    if (!vals.some(v => Math.abs(v - at) < 0.01)) continue
    a = Math.min(a, axis === 'x' ? s.y : s.x)
    b = Math.max(b, axis === 'x' ? s.y + s.h : s.x + s.w)
  }
  return { a: a - 14, b: b + 14 }
}

// 등간격. 두 가지를 본다
//   ① 양옆 이웃과의 간격이 같아지는 자리 (가운데 끼우기)
//   ② 그 줄에 이미 있는 간격과 같아지는 자리 (3개 이상 나란히 놓을 때)
function spacingOn(R, statics, axis, tol) {
  const A = ax(axis)
  const row = statics.filter(s => s[A.q] < R[A.c2] && s[A.q] + s[A.t] > R[A.c1])   // 같은 줄
  if (!row.length) return null
  const lo = row.filter(s => s[A.p] + s[A.s] <= R[A.r1] + tol)
    .sort((a, b) => (b[A.p] + b[A.s]) - (a[A.p] + a[A.s]))[0]
  const hi = row.filter(s => s[A.p] >= R[A.r2] - tol).sort((a, b) => a[A.p] - b[A.p])[0]
  const cands = []
  if (lo && hi) {
    const gL = R[A.r1] - (lo[A.p] + lo[A.s])
    const gR = hi[A.p] - R[A.r2]
    if (gL > 0 && gR > 0 && Math.abs(gR - gL) <= tol * 2) cands.push({ d: (gR - gL) / 2, lo, hi })
  }
  const sorted = row.slice().sort((a, b) => a[A.p] - b[A.p])
  for (let i = 0; i + 1 < sorted.length; i++) {
    const g = sorted[i + 1][A.p] - (sorted[i][A.p] + sorted[i][A.s])
    if (g <= 1) continue
    // 기준 간격은 고정 도형끼리의 간격이고 새로 만드는 간격은 고정 도형과 이동 도형 사이라
    // 둘이 겹칠 일이 없다. 이웃이 곧 기준 간격의 한쪽 끝인 경우(A B 다음에 C를 붙이는 흔한 경우)를
    // 빼면 정작 3개 나란히 놓기가 동작하지 않는다
    const ref = { a: sorted[i], b: sorted[i + 1], g }
    if (lo) {
      const d = (lo[A.p] + lo[A.s] + g) - R[A.r1]
      if (Math.abs(d) <= tol) cands.push({ d, lo, ref })
    }
    if (hi) {
      const d = (hi[A.p] - g) - R[A.r2]
      if (Math.abs(d) <= tol) cands.push({ d, hi, ref })
    }
  }
  if (!cands.length) return null
  return cands.reduce((m, c) => Math.abs(c.d) < Math.abs(m.d) ? c : m)
}

// 붙은 뒤 위치를 기준으로 등간격 화살표를 놓을 자리를 만든다
function spacingMarks(R2, cand, axis) {
  const A = ax(axis)
  const at = (R2[A.c1] + R2[A.c2]) / 2
  const out = []
  if (cand.lo) out.push({ type: axis, from: cand.lo[A.p] + cand.lo[A.s], to: R2[A.r1], at })
  if (cand.hi) out.push({ type: axis, from: R2[A.r2], to: cand.hi[A.p], at })
  if (cand.ref) {
    // 기준이 된 기존 간격도 같이 보여 준다 (왜 여기서 멈췄는지 알 수 있게)
    const r = cand.ref
    const lo2 = Math.max(r.a[A.q], r.b[A.q])
    const hi2 = Math.min(r.a[A.q] + r.a[A.t], r.b[A.q] + r.b[A.t])
    out.push({ type: axis, from: r.a[A.p] + r.a[A.s], to: r.b[A.p], at: (lo2 + hi2) / 2 })
  }
  return out
}

// 이동량을 받아 최종 이동량을 낸다. 붙을 곳이 있으면 격자 스냅 대신 그 자리로 정확히 붙인다
function smartAdjust(movers, dx, dy, ev) {
  clearGuides()
  if (!movers.length) return { dx, dy }
  // 격자 스냅은 대표 도형 하나로만 계산한다. 도형마다 따로 반올림하면 서로의 간격이 어긋난다
  const gridDx = snap(movers[0].ox + dx) - movers[0].ox
  const gridDy = snap(movers[0].oy + dy) - movers[0].oy
  if (!smartGuidesOn || (ev && ev.altKey)) return { dx: gridDx, dy: gridDy }

  const tol = SNAP_TOL / zoom
  const movingIds = new Set(movers.map(o => o.b.id))
  const statics = state.boxes.filter(b => !movingIds.has(b.id))
  if (!statics.length) return { dx: gridDx, dy: gridDy }

  const R = movingRect(movers, dx, dy)
  const pick = axis => {
    const a = alignOn(R, statics, axis, tol)
    const sp = spacingOn(R, statics, axis, tol)
    if (a && sp) return Math.abs(sp.d) < Math.abs(a.d) - 0.01 ? { sp } : { a }
    return a ? { a } : (sp ? { sp } : null)
  }
  const px = pick('x'), py = pick('y')
  const fdx = px ? dx + (px.a ? px.a.d : px.sp.d) : gridDx
  const fdy = py ? dy + (py.a ? py.a.d : py.sp.d) : gridDy

  const R2 = movingRect(movers, fdx, fdy)
  if (px && px.a) {
    const s = alignSpan(R2, statics, 'x', px.a.at)
    guideLines.push({ type: 'v', at: px.a.at, a: s.a, b: s.b })
  }
  if (py && py.a) {
    const s = alignSpan(R2, statics, 'y', py.a.at)
    guideLines.push({ type: 'h', at: py.a.at, a: s.a, b: s.b })
  }
  if (px && px.sp) guideSpans.push(...spacingMarks(R2, px.sp, 'x'))
  if (py && py.sp) guideSpans.push(...spacingMarks(R2, py.sp, 'y'))
  return { dx: fdx, dy: fdy }
}

const GUIDE_COLOR = '#e8443a'

function guideOverlay() {
  if (!guideLines.length && !guideSpans.length) return ''
  let out = ''
  for (const g of guideLines) {
    const d = g.type === 'v' ? `M ${g.at} ${g.a} L ${g.at} ${g.b}` : `M ${g.a} ${g.at} L ${g.b} ${g.at}`
    out += `<path d="${d}" fill="none" stroke="${GUIDE_COLOR}" stroke-width="1" stroke-dasharray="5 4"/>`
  }
  for (const s of guideSpans) out += spacingMark(s)
  return out
}

// 등간격 표시: 양끝에 화살촉과 눈금이 달린 선
function spacingMark(s) {
  const A = 4, C = 5
  if (Math.abs(s.to - s.from) < 2) return ''
  if (s.type === 'x') {
    const y = s.at
    return `<path d="M ${s.from} ${y} L ${s.to} ${y}" fill="none" stroke="${GUIDE_COLOR}" stroke-width="1"/>` +
      `<path d="M ${s.from} ${y - C} L ${s.from} ${y + C} M ${s.to} ${y - C} L ${s.to} ${y + C}" fill="none" stroke="${GUIDE_COLOR}" stroke-width="1"/>` +
      `<path d="M ${s.from} ${y} l ${A} ${-A} l 0 ${2 * A} Z" fill="${GUIDE_COLOR}"/>` +
      `<path d="M ${s.to} ${y} l ${-A} ${-A} l 0 ${2 * A} Z" fill="${GUIDE_COLOR}"/>`
  }
  const x = s.at
  return `<path d="M ${x} ${s.from} L ${x} ${s.to}" fill="none" stroke="${GUIDE_COLOR}" stroke-width="1"/>` +
    `<path d="M ${x - C} ${s.from} L ${x + C} ${s.from} M ${x - C} ${s.to} L ${x + C} ${s.to}" fill="none" stroke="${GUIDE_COLOR}" stroke-width="1"/>` +
    `<path d="M ${x} ${s.from} l ${-A} ${A} l ${2 * A} 0 Z" fill="${GUIDE_COLOR}"/>` +
    `<path d="M ${x} ${s.to} l ${-A} ${-A} l ${2 * A} 0 Z" fill="${GUIDE_COLOR}"/>`
}

// ---------- 조작 ----------

// 화면 좌표 → 캔버스 좌표 (확대 배율 보정)
function pt(e) {
  const r = svg.getBoundingClientRect()
  return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }
}

function drag(e0, onMove) {
  let pushed = false
  const p0 = pt(e0)
  const move = ev => {
    const p = pt(ev)
    if (!pushed && (Math.abs(p.x - p0.x) > 2 || Math.abs(p.y - p0.y) > 2)) {
      pushUndo()
      pushed = true
    }
    if (pushed) { onMove(p.x - p0.x, p.y - p0.y, ev); render() }
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    if (guideLines.length || guideSpans.length) { clearGuides(); render() }   // 손을 떼면 안내선을 지운다
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

// mousedown 시 re-render로 클릭 대상이 파괴되어 브라우저 dblclick이 발생하지 않으므로 직접 감지
let lastDown = { t: 0, x: 0, y: 0 }

svg.addEventListener('mousedown', e => {
  const g = e.target.closest('[data-type]')

  // 투명색 지정 모드: 이미지의 한 점을 누르면 그 색을 없앤다. 여러 색을 잇달아 찍을 수 있게
  // 모드는 유지하고, Escape 나 버튼 재클릭으로 푼다
  if (pickMode) {
    const b = g && g.dataset.type === 'box' ? boxById(+g.dataset.id) : null
    if (b && b.shape === 'image') {
      const p = pt(e)
      setSelection({ type: 'box', id: b.id })
      render()
      makeColorTransparent(b, p.x, p.y)
    } else {
      status('이미지 위를 클릭하세요.')
    }
    return
  }

  if (arrowMode) {
    if (g && g.dataset.type === 'box') {
      const id = +g.dataset.id
      if (arrowSource == null) {
        arrowSource = id
      } else if (arrowSource !== id) {
        pushUndo()
        const a = { id: uid(), from: arrowSource, to: id, style: lastArrowStyle, z: nextZ() }
        state.arrows.push(a)
        arrowMode = false
        arrowSource = null
        setSelection({ type: 'arrow', id: a.id })
      }
      render()
    }
    return
  }

  const p = pt(e)
  const now = Date.now()
  const isDbl = now - lastDown.t < 400 && Math.abs(p.x - lastDown.x) < 6 && Math.abs(p.y - lastDown.y) < 6
  lastDown = { t: now, x: p.x, y: p.y }
  if (isDbl) {
    lastDown.t = 0
    // 기본 동작(포커스를 SVG로 옮김)을 막지 않으면, 방금 띄운 편집창이 곧바로 blur 되어 사라진다
    e.preventDefault()
    if (!g) {
      pushUndo()
      const b = { id: uid(), x: snap(p.x - 80), y: snap(p.y - 30), w: 160, h: 60, text: '블록', z: nextZ() }
      state.boxes.push(b)
      setSelection({ type: 'box', id: b.id })
      render()
      editBoxText(b)
    } else if (g.dataset.type === 'box') {
      const b = boxById(+g.dataset.id)
      if (b.shape !== 'image') editBoxText(b)   // 이미지 상자에는 글자가 없다
    } else if (g.dataset.type === 'tag') {
      editTagLabel(state.tags.find(t => t.id === +g.dataset.id))
    }
    return
  }

  if (!g) { clearSelection(); render(); return }
  const type = g.dataset.type
  const id = +g.dataset.id

  if (type === 'resize') {
    const b = boxById(id)
    const ow = b.w, oh = b.h
    drag(e, (dx, dy) => {
      b.w = Math.max(40, snap(ow + dx))
      b.h = Math.max(30, snap(oh + dy))
    })
    return
  }

  // 화살표 끝점 핸들: 잡아끌면 그 지점으로 끝점이 고정된다 (기준 박스의 상대좌표로 저장)
  if (type === 'ep') {
    const a = state.arrows.find(a => a.id === id)
    const end = g.dataset.end                      // 'from' | 'to'
    const b = boxById(end === 'from' ? a.from : a.to)
    const key = end === 'from' ? 'fromOff' : 'toOff'
    const pts = arrowPath(a, boxById(a.from), boxById(a.to))
    const p0 = end === 'from' ? pts[0] : pts[pts.length - 1]
    const ox = p0.x - b.x, oy = p0.y - b.y
    drag(e, (dx, dy) => {
      a[key] = { dx: snap(ox + dx), dy: snap(oy + dy) }
    })
    return
  }

  // 중간 꺾임 손잡이: 가운데 구간을 통째로 평행 이동한다 (저장은 양 끝점 사이의 비율로)
  if (type === 'bend') {
    const a = state.arrows.find(a => a.id === id)
    const axis = g.dataset.axis
    const bg = bendGeom(a, boxById(a.from), boxById(a.to))
    if (!bg) return
    drag(e, (dx, dy) => {
      const v = snap(bg.v0 + (axis === 'x' ? dx : dy))
      a.bend = { axis, t: (v - bg.v1) / bg.span }
    })
    return
  }

  if (e.shiftKey) {
    // Shift+클릭: 선택에 더하거나 뺀다 (드래그는 하지 않는다)
    toggleSelection(type, id)
    render()
    return
  }
  // 이미 선택된 것을 잡으면 선택을 유지한 채 묶음 전체를 끈다
  if (!isSelected(type, id)) setSelection({ type, id })
  else selection = { type, id }
  render()

  // 선택된 박스·태그를 함께 옮긴다 (화살표는 양 끝 박스를 따라가므로 대상 아님)
  const boxes = multi.filter(s => s.type === 'box').map(s => ({ b: boxById(s.id) })).filter(o => o.b)
  const tags = multi.filter(s => s.type === 'tag').map(s => ({ t: state.tags.find(t => t.id === s.id) })).filter(o => o.t)
  if (type === 'box' || type === 'tag') {
    boxes.forEach(o => { o.ox = o.b.x; o.oy = o.b.y })
    // 함께 옮겨지는 박스에 딸린 태그는 dx/dy가 상대좌표라 자동으로 따라온다 (이중 이동 방지)
    const movingBoxIds = new Set(boxes.map(o => o.b.id))
    const freeTags = tags.filter(o => !movingBoxIds.has(o.t.boxId))
    freeTags.forEach(o => { o.odx = o.t.dx; o.ody = o.t.dy })
    drag(e, (dx, dy, ev) => {
      // 스마트 가이드가 붙을 곳을 찾으면 격자 스냅 대신 그 자리로 정확히 옮긴다
      const g = smartAdjust(boxes, dx, dy, ev)
      boxes.forEach(o => { o.b.x = o.ox + g.dx; o.b.y = o.oy + g.dy })
      freeTags.forEach(o => { o.t.dx = o.odx + dx; o.t.dy = o.ody + dy })
    })
  }
})

function editBoxText(b) {
  const ta = document.createElement('textarea')
  ta.className = 'overlay-edit'
  Object.assign(ta.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' })
  ta.value = b.text
  let done = false, cancel = false
  const commit = () => {
    if (done) return
    done = true
    if (!cancel && ta.value !== b.text) { pushUndo(); b.text = ta.value }
    ta.remove()
    render()
  }
  // 편집창은 mousedown 처리 도중에 만들어지므로, 그 mousedown 의 기본 포커스 처리가 뒤늦게
  // 들어와 한 번 blur 시킨다. ready 가 서기 전의 blur 는 무시하고 다음 프레임에 다시 focus 한다
  let ready = false
  const arm = () => { ready = true }
  ta.addEventListener('blur', () => { if (ready) commit() })
  ta.addEventListener('input', arm)
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { cancel = true; ready = true; ta.blur() }
    else arm()
    ev.stopPropagation()
  })
  wrap.appendChild(ta)
  ta.focus()
  ta.select()
  // 창이 가려져 있으면 rAF 가 안 도는 경우가 있어 타이머로도 무장한다
  setTimeout(() => { if (!done && document.activeElement !== ta) { ta.focus(); ta.select() } ; arm() }, 0)
}

function editTagLabel(tg) {
  const b = boxById(tg.boxId)
  const inp = document.createElement('input')
  inp.className = 'overlay-edit'
  Object.assign(inp.style, { left: (b.x + tg.dx - 35) + 'px', top: (b.y + tg.dy - 14) + 'px', width: '70px', height: '28px', paddingTop: '0' })
  inp.value = tg.label
  let done = false, cancel = false
  const commit = () => {
    if (done) return
    done = true
    if (!cancel && inp.value !== tg.label) { pushUndo(); tg.label = inp.value }
    inp.remove()
    render()
  }
  let ready = false
  const arm = () => { ready = true }
  inp.addEventListener('blur', () => { if (ready) commit() })
  inp.addEventListener('input', arm)
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { cancel = true; ready = true; inp.blur() }
    else if (ev.key === 'Enter') { ready = true; inp.blur() }
    else arm()
    ev.stopPropagation()
  })
  wrap.appendChild(inp)
  inp.focus()
  inp.select()
  setTimeout(() => { if (!done && document.activeElement !== inp) { inp.focus(); inp.select() } ; arm() }, 0)
}

// ---------- 툴바 동작 ----------

const SHAPE_DEFAULTS = {
  rect: { w: 160, h: 60 },
  round: { w: 160, h: 60 },
  diamond: { w: 160, h: 90 },
  cylinder: { w: 140, h: 90 },
  cloud: { w: 190, h: 120 },
  person: { w: 120, h: 130 },
  text: { w: 180, h: 40 }
}

function addBox(shape = 'rect') {
  pushUndo()
  const n = state.boxes.length
  const d = SHAPE_DEFAULTS[shape] || SHAPE_DEFAULTS.rect
  // 'text' 는 도형이 아니라 테두리 없는 글자 상자 — 실제 shape 는 rect 로 두고 noFrame 을 켠다
  const isText = shape === 'text'
  const b = {
    id: uid(), x: 80 + (n % 5) * 30, y: 80 + (n % 5) * 30, w: d.w, h: d.h,
    text: isText ? '텍스트' : (shape === 'person' ? '' : shape === 'cloud' ? '네트워크' : '블록'),
    shape: isText ? 'rect' : shape, z: nextZ()
  }
  if (isText) b.noFrame = true
  state.boxes.push(b)
  setSelection({ type: 'box', id: b.id })
  render()
}

// ---------- 이미지 삽입 ----------

const IMG_MAX = 700   // 처음 놓을 때의 최대 변 길이. 원본이 크면 비율을 지키며 줄여 넣는다

function insertImage(dataURL, at) {
  const im = new Image()
  im.onload = () => {
    const k = Math.min(1, IMG_MAX / Math.max(im.naturalWidth, im.naturalHeight))
    pushUndo()
    const id = putImage(dataURL)
    const p = at || { x: 120, y: 120 }
    const b = {
      id: uid(), x: snap(p.x), y: snap(p.y),
      w: Math.max(20, Math.round(im.naturalWidth * k)),
      h: Math.max(20, Math.round(im.naturalHeight * k)),
      text: '', shape: 'image', imgId: id, origImgId: id, z: nextZ()
    }
    state.boxes.push(b)
    setSelection({ type: 'box', id: b.id })
    render()
  }
  im.onerror = () => alert('이미지를 읽을 수 없습니다.')
  im.src = dataURL
}

async function pickImageFile() {
  if (window.api && window.api.loadImage) {
    const d = await window.api.loadImage()
    if (d) insertImage(d)
    return
  }
  const i = document.createElement('input')
  i.type = 'file'
  i.accept = 'image/*'
  i.onchange = () => {
    const f = i.files[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => insertImage(r.result)
    r.readAsDataURL(f)
  }
  i.click()
}

// 파일을 캔버스에 끌어다 놓으면 그 자리에 들어간다 (기본 동작은 창이 그 파일로 이동해버리므로 막는다)
for (const el of [window, wrap]) {
  el.addEventListener('dragover', e => e.preventDefault())
}
wrap.addEventListener('drop', e => {
  e.preventDefault()
  const f = [...(e.dataTransfer ? e.dataTransfer.files : [])].find(f => /^image\//.test(f.type))
  if (!f) return
  const p = pt(e)
  const r = new FileReader()
  r.onload = () => insertImage(r.result, { x: p.x - 20, y: p.y - 20 })
  r.readAsDataURL(f)
})
window.addEventListener('drop', e => e.preventDefault())

// ---------- 투명색 지정 ----------

let pickMode = false   // 켜 두고 이미지의 한 점을 누르면 그 색이 사라진다

function tolerance() { return clamp(parseInt($('tol').value, 10) || 0, 0, 255) }

// 잠깐 뜨는 안내문 (선택 개수 표시와 자리를 나눠 쓰지 않도록 별도 칸)
let msgTimer = null
function status(text) {
  $('msg').textContent = text
  clearTimeout(msgTimer)
  msgTimer = setTimeout(() => { $('msg').textContent = '' }, 4000)
}

// 누른 점의 색과 같은 색(허용오차 안)을 이미지 전체에서 투명하게 만든다.
// 원본을 고치지 않고 새 이미지를 만들어 갈아 끼우므로 실행 취소·원본 복원이 그대로 된다.
function makeColorTransparent(b, px, py) {
  const src = imageStore.get(b.imgId)
  if (!src) return
  const im = new Image()
  im.onload = () => {
    const c = document.createElement('canvas')
    c.width = im.naturalWidth
    c.height = im.naturalHeight
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(im, 0, 0)
    // 화면 좌표 → 이미지 픽셀 좌표. 상자를 늘려 놨으면 그 비율만큼 되돌린다
    const ix = clamp(Math.floor((px - b.x) / b.w * c.width), 0, c.width - 1)
    const iy = clamp(Math.floor((py - b.y) / b.h * c.height), 0, c.height - 1)
    const img = ctx.getImageData(0, 0, c.width, c.height)
    const a = img.data
    const o = (iy * c.width + ix) * 4
    if (a[o + 3] === 0) { status('이미 투명한 지점입니다.'); return }
    const tr = a[o], tg = a[o + 1], tb = a[o + 2]
    const tol = tolerance()
    const lim = tol * tol * 3          // 채널별 허용오차를 RGB 제곱거리 기준으로
    let n = 0
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] === 0) continue
      const dr = a[i] - tr, dg = a[i + 1] - tg, db = a[i + 2] - tb
      if (dr * dr + dg * dg + db * db <= lim) { a[i + 3] = 0; n++ }
    }
    if (!n) { status('바뀐 픽셀이 없습니다. 허용오차를 올려 보세요.'); return }
    ctx.putImageData(img, 0, 0)
    pushUndo()
    b.imgId = putImage(c.toDataURL('image/png'))
    render()
    status(`rgb(${tr},${tg},${tb}) ±${tol} → ${n.toLocaleString()}픽셀 투명 처리`)
  }
  im.onerror = () => status('이미지를 다시 읽지 못했습니다.')
  im.src = src
}

// 투명 처리 전 원본으로 되돌린다 (여러 번 찍은 뒤 한 번에 원위치)
function restoreImages() {
  const bs = selectedBoxes().filter(b => b.shape === 'image' && b.origImgId && b.imgId !== b.origImgId)
  if (!bs.length) return
  pushUndo()
  for (const b of bs) b.imgId = b.origImgId
  render()
  status('원본 이미지로 되돌렸습니다.')
}

function imageBoxes() { return state.boxes.filter(b => b.shape === 'image') }

function nextLabel() {
  const used = new Set(state.tags.map(t => t.label))
  let n = 100
  while (used.has(String(n))) n += 10
  return String(n)
}

function addTag() {
  if (!selection || selection.type !== 'box') return
  pushUndo()
  const b = boxById(selection.id)
  const tg = { id: uid(), boxId: b.id, label: nextLabel(), dx: b.w + 45, dy: -18, z: nextZ() }
  state.tags.push(tg)
  setSelection({ type: 'tag', id: tg.id })
  render()
}

// 선택한 박스의 테두리를 실선 ⇄ 점선 (점선 박스는 음영·흰 채움 없이 경계만 그린다 — 폐쇄망 같은 영역 표시용)
function selectedBoxes() { return multi.filter(s => s.type === 'box').map(s => boxById(s.id)).filter(Boolean) }

function toggleDash() {
  const boxes = selectedBoxes()
  if (!boxes.length) return
  pushUndo()
  // 섞여 있으면 전부 점선으로 맞춘다 (모두 점선일 때만 실선으로 되돌린다)
  const to = !boxes.every(b => b.dash)
  for (const b of boxes) { b.dash = to; if (to) delete b.noFrame }
  render()
}

// 테두리 자체를 없앤 투명 글자 상자로 전환 (음영·채움·선 모두 사라지고 글자만 남는다)
function toggleFrame() {
  const boxes = selectedBoxes()
  if (!boxes.length) return
  pushUndo()
  const to = !boxes.every(b => b.noFrame)
  for (const b of boxes) {
    if (to) { b.noFrame = true; delete b.dash }
    else delete b.noFrame
  }
  render()
}

// 박스 안쪽 채움을 흰칠 → 빗금(해치) → 점무늬 → 흰칠 순으로 돌린다. 표 머리행·합계행처럼
// 굵은 테두리 대신 면으로 강조할 때 쓴다. 글자가 겹쳐 읽기 어려우면 점무늬가 가장 연하다.
// (점선·테두리 없음은 채움 자체가 없으므로 해치를 켜면 실선 틀로 되돌린다)
const FILL_CYCLE = [null, true, 'dot']
function cycleHatch() {
  const boxes = selectedBoxes()
  if (!boxes.length) return
  pushUndo()
  const cur = boxes.every(b => b.hatch === boxes[0].hatch) ? (boxes[0].hatch || null) : null
  const next = FILL_CYCLE[(FILL_CYCLE.indexOf(cur) + 1) % FILL_CYCLE.length]
  for (const b of boxes) {
    if (next) { b.hatch = next; delete b.dash; delete b.noFrame }
    else delete b.hatch
  }
  status(next === true ? '채움: 빗금' : next === 'dot' ? '채움: 점무늬' : '채움: 흰칠')
  render()
}

// 박스 글자를 LaTeX 수식으로 조판 ⇄ 보통 글자. 텍스트 칸의 내용이 그대로 TeX 원문이 된다
function toggleMath() {
  const boxes = selectedBoxes()
  if (!boxes.length) return
  pushUndo()
  const to = !boxes.every(b => b.math)
  for (const b of boxes) { if (to) b.math = true; else delete b.math }
  render()
}

// 손으로 옮긴 끝점·중간 꺾임을 버리고 자동 계산(박스 중심 기준, 꺾임은 한가운데)으로 되돌린다
function resetEndpoints() {
  if (!selection || selection.type !== 'arrow') return
  const a = state.arrows.find(a => a.id === selection.id)
  if (!a.fromOff && !a.toOff && !a.bend) return
  pushUndo()
  delete a.fromOff
  delete a.toOff
  delete a.bend
  render()
}

function toggleStyle() {
  if (!selection || selection.type !== 'arrow') return
  pushUndo()
  const a = state.arrows.find(a => a.id === selection.id)
  a.style = a.style === 'ortho' ? 'straight' : 'ortho'
  lastArrowStyle = a.style
  render()
}

function deleteSelection() {
  if (!multi.length) return
  pushUndo()
  const boxIds = new Set(multi.filter(s => s.type === 'box').map(s => s.id))
  const arrowIds = new Set(multi.filter(s => s.type === 'arrow').map(s => s.id))
  const tagIds = new Set(multi.filter(s => s.type === 'tag').map(s => s.id))
  state.boxes = state.boxes.filter(b => !boxIds.has(b.id))
  // 지워진 박스에 붙어 있던 화살표·태그도 함께 사라진다
  state.arrows = state.arrows.filter(a => !arrowIds.has(a.id) && !boxIds.has(a.from) && !boxIds.has(a.to))
  state.tags = state.tags.filter(t => !tagIds.has(t.id) && !boxIds.has(t.boxId))
  clearSelection()
  render()
}

// 선택 요소를 종류 구분 없이 전체 최상단/최하단으로 이동 (통합 z-order)
function reorderSelection(dir) {
  if (!multi.length) return
  ensureZ()
  const els = selectedElements()
  if (!els.length) return
  pushUndo()
  // 여러 개를 함께 옮길 때도 자기들끼리의 상하 관계는 유지한다
  els.sort((p, q) => p.z - q.z)
  if (dir === 'front') { let z = zTop() + 1; for (const el of els) el.z = z++ }
  else { let z = zBottom() - els.length; for (const el of els) el.z = z++ }
  render()
}

// ---------- 글자 크기 ----------

const FS_MIN = 8, FS_MAX = 72
// 텍스트를 가진 선택 요소 (박스·태그). 화살표는 글자가 없다
function fontTargets() {
  return selectedElements().filter(el => el && el.shape !== 'image' && ('text' in el || 'label' in el))
}
function changeFontSize(delta) {
  const els = fontTargets()
  if (!els.length) return
  pushUndo()
  for (const el of els) el.fs = clamp(fsOf(el) + delta, FS_MIN, FS_MAX)
  render()
}
function resetFontSize() {
  const els = fontTargets()
  if (!els.length) return
  pushUndo()
  for (const el of els) delete el.fs
  render()
}
// 툴바 표시: 선택된 것들의 크기가 제각각이면 "혼합"
function fontLabel() {
  const els = fontTargets()
  if (!els.length) return '-'
  const sizes = new Set(els.map(fsOf))
  return sizes.size === 1 ? String([...sizes][0]) : '혼합'
}

// ---------- 화살표 크기 ----------

// lw 하나로 선 굵기와 markerUnits="strokeWidth" 화살촉 크기를 함께 제어한다.
// lw가 없는 화살표는 기본 굵기 4를 사용한다.
const ARROW_WIDTH_DEFAULT = 4, ARROW_WIDTH_MIN = 1, ARROW_WIDTH_MAX = 12
function arrowWidth(a) {
  return (a && typeof a.lw === 'number') ? clamp(a.lw, ARROW_WIDTH_MIN, ARROW_WIDTH_MAX) : ARROW_WIDTH_DEFAULT
}
function arrowTargets() {
  return multi
    .filter(s => s.type === 'arrow')
    .map(s => state.arrows.find(a => a.id === s.id))
    .filter(Boolean)
}
function changeArrowSize(delta) {
  const arrows = arrowTargets()
  if (!arrows.length) return
  pushUndo()
  for (const a of arrows) a.lw = clamp(arrowWidth(a) + delta, ARROW_WIDTH_MIN, ARROW_WIDTH_MAX)
  render()
}
function resetArrowSize() {
  const arrows = arrowTargets()
  if (!arrows.length) return
  pushUndo()
  for (const a of arrows) delete a.lw
  render()
}
function arrowSizeLabel() {
  const arrows = arrowTargets()
  if (!arrows.length) return '-'
  const sizes = new Set(arrows.map(arrowWidth))
  return sizes.size === 1 ? String([...sizes][0]) : '혼합'
}

// ---------- 복사 / 붙여넣기 ----------

let clipboard = null      // { type: 'box'|'tag', data, count } — 앱 안에서 복사한 요소
let sysClipSeen = null    // 앱 안에서 복사하던 시점의 시스템 클립보드 그림 (지문)

// 시스템 클립보드 그림의 값싼 지문. 원본을 통째로 들고 있지 않으려고 앞뒤 조각만 쓴다
function clipFingerprint(d) {
  return d ? d.length + '|' + d.slice(0, 64) + '|' + d.slice(-64) : null
}

async function systemClipImage() {
  if (!window.api || !window.api.clipboardImage) return null
  return await window.api.clipboardImage()
}

async function copySelection() {
  if (!selection) return
  // 이 시점의 시스템 클립보드를 기억해 둔다. 붙여넣을 때 "그 뒤에 그림을 새로 복사했는가"를
  // 이걸로 가른다 — 안 그러면 앱 안에서 블록을 복사해도 클립보드에 남아 있던 캡처가 끼어든다
  sysClipSeen = clipFingerprint(await systemClipImage())
  if (selection.type === 'box') {
    const b = boxById(selection.id)
    if (b) clipboard = { type: 'box', data: JSON.parse(JSON.stringify(b)), count: 0 }
  } else if (selection.type === 'tag') {
    const t = state.tags.find(t => t.id === selection.id)
    if (t) clipboard = { type: 'tag', data: JSON.parse(JSON.stringify(t)), count: 0 }
  }
}

// 붙여넣기 규칙: 마지막에 복사한 것이 이긴다.
//   시스템 클립보드의 그림이 앱 안에서 복사한 뒤에 새로 들어온 것이면 그 그림을,
//   아니면 앱 안에서 복사한 요소를 넣는다. 앱 안에서 복사한 적이 없으면 그림을 넣는다.
// forceImage 는 Ctrl+Shift+V — 무조건 시스템 클립보드의 그림.
async function pasteClipboard(forceImage) {
  const d = await systemClipImage()
  const fresh = d && clipFingerprint(d) !== sysClipSeen   // 앱 복사 이후에 새로 복사된 그림인가
  if (d && (forceImage || fresh || !clipboard)) { insertImage(d); return }
  if (!clipboard) return
  if (clipboard.type === 'tag' && !boxById(clipboard.data.boxId)) return
  pushUndo()
  clipboard.count++
  const off = 20 * clipboard.count
  if (clipboard.type === 'box') {
    const b = { ...clipboard.data, id: uid(), x: clipboard.data.x + off, y: clipboard.data.y + off, z: nextZ() }
    state.boxes.push(b)
    setSelection({ type: 'box', id: b.id })
  } else {
    const t = { ...clipboard.data, id: uid(), dx: clipboard.data.dx + off, dy: clipboard.data.dy + off, label: nextLabel(), z: nextZ() }
    state.tags.push(t)
    setSelection({ type: 'tag', id: t.id })
  }
  render()
}

// ---------- 저장 / 열기 / 내보내기 ----------

async function save(saveAs = false) {
  const data = serialize()
  if (window.api) {
    await window.api.saveJSON(data, saveAs)
  } else {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    a.download = '도면.json'
    a.click()
  }
}

async function load() {
  let text = null
  if (window.api) {
    text = await window.api.loadJSON()
  } else {
    text = await new Promise(res => {
      const i = document.createElement('input')
      i.type = 'file'
      i.accept = '.json'
      i.onchange = () => {
        const f = i.files[0]
        if (!f) return res(null)
        const r = new FileReader()
        r.onload = () => res(r.result)
        r.readAsText(f)
      }
      i.click()
    })
  }
  applyLoaded(text)
}

// 파일 내용(JSON 텍스트)을 현재 도면으로 적용
function applyLoaded(text) {
  if (!text) return
  try {
    const s = adoptImages(JSON.parse(text))
    if (!Array.isArray(s.boxes)) throw new Error('bad file')
    pushUndo()
    state = s
    clearSelection()
    arrowMode = false
    arrowSource = null
    pickMode = false
    render()
  } catch {
    alert('파일을 읽을 수 없습니다.')
  }
}

// 파일을 더블클릭해 실행한 경우: 메인 프로세스가 내용을 보내준다
if (window.api && window.api.onOpenFile) window.api.onOpenFile(applyLoaded)

function renderPNGDataURL(scale) {
  return new Promise((resolve, reject) => {
    const prevSel = selection, prevMulti = multi, prevSrc = arrowSource
    clearSelection()
    arrowSource = null
    clearGuides()      // 안내선은 도면이 아니다 — 내보내는 그림에 섞이지 않게
    render()
    const bb = svg.getBBox()
    // 화면용 blob URL 은 독립 SVG 안에서 열리지 않는다 — 내보낼 때만 본문(data URL)으로 되돌린다
    let inner = svg.innerHTML
    for (const [id, u] of blobUrls) {
      if (inner.indexOf(u) >= 0) inner = inner.split(u).join(imageStore.get(id))
    }
    selection = prevSel
    multi = prevMulti
    arrowSource = prevSrc
    render()

    const m = 20
    const x = bb.x - m, y = bb.y - m, w = bb.width + 2 * m, h = bb.height + 2 * m
    const str = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}" font-family="${esc(FONT)}">` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/>` + inner + `</svg>`

    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = Math.round(w * scale)
      c.height = Math.round(h * scale)
      const ctx = c.getContext('2d')
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str)
  })
}

async function exportPNG() {
  if (!state.boxes.length) return
  const dataURL = await renderPNGDataURL(3)
  if (window.api) {
    await window.api.exportPNG(dataURL)
  } else {
    const a = document.createElement('a')
    a.href = dataURL
    a.download = '도면.png'
    a.click()
  }
}

// ---------- 확대 / 축소 (Ctrl + 휠) ----------

// 커서 아래의 도면 지점이 제자리에 머물도록 스크롤을 보정하며 배율 변경
function setZoom(z, clientX, clientY) {
  const sc = $('scroll')
  z = clamp(Math.round(z * 100) / 100, ZOOM_MIN, ZOOM_MAX)
  if (z === zoom) return
  const r = sc.getBoundingClientRect()
  // 커서 위치를 기준으로 삼되, 좌표가 없으면 보이는 영역의 중앙을 기준으로
  const vx = clientX == null ? r.width / 2 : clientX - r.left
  const vy = clientY == null ? r.height / 2 : clientY - r.top
  const cx = (sc.scrollLeft + vx) / zoom     // 커서 아래의 캔버스 좌표
  const cy = (sc.scrollTop + vy) / zoom

  zoom = z
  wrap.style.zoom = z
  $('zoom-label').textContent = Math.round(z * 100) + '%'

  sc.scrollLeft = cx * z - vx
  sc.scrollTop = cy * z - vy
}

$('scroll').addEventListener('wheel', e => {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY)
}, { passive: false })

// ---------- 키보드 / 버튼 배선 ----------

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection() }
  else if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo() }
  else if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); selectAll() }
  else if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); copySelection() }
  else if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); pasteClipboard(e.shiftKey) }
  else if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(e.shiftKey) }
  else if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); setZoom(1) }
  else if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(zoom * 1.1) }
  else if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); setZoom(zoom / 1.1) }
  else if ((e.metaKey || e.ctrlKey) && e.key === ']') { e.preventDefault(); reorderSelection('front') }
  else if ((e.metaKey || e.ctrlKey) && e.key === '[') { e.preventDefault(); reorderSelection('back') }
  else if (e.key === 'Escape') { arrowMode = false; arrowSource = null; pickMode = false; clearSelection(); render() }
})

{
  const et = $('edit-text')
  let pushed = false
  et.addEventListener('focus', () => { pushed = false })
  et.addEventListener('input', () => {
    const target = editTarget()
    if (!target) return
    if (!pushed) { pushUndo(); pushed = true }
    if (selection.type === 'box') target.text = et.value
    else target.label = et.value
    render()
  })
  et.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') et.blur()
    ev.stopPropagation()
  })
}

$('btn-box').onclick = () => addBox('rect')
$('btn-round').onclick = () => addBox('round')
$('btn-diamond').onclick = () => addBox('diamond')
$('btn-cyl').onclick = () => addBox('cylinder')
$('btn-cloud').onclick = () => addBox('cloud')
$('btn-person').onclick = () => addBox('person')
$('btn-text').onclick = () => addBox('text')
$('btn-guides').onclick = () => {
  smartGuidesOn = !smartGuidesOn
  clearGuides()
  render()
  status(smartGuidesOn ? '스마트 가이드 켬 (Alt를 누른 채 끌면 잠시 해제)' : '스마트 가이드 끔')
}
$('btn-image').onclick = pickImageFile
$('btn-pick').onclick = () => {
  pickMode = !pickMode
  arrowMode = false
  arrowSource = null
  render()
  status(pickMode ? '이미지에서 없앨 색을 클릭하세요 (Escape로 해제)' : '')
}
$('btn-img-reset').onclick = restoreImages
$('btn-arrow').onclick = () => { arrowMode = !arrowMode; arrowSource = null; pickMode = false; render() }
$('btn-tag').onclick = addTag
$('btn-style').onclick = toggleStyle
$('btn-as-down').onclick = () => changeArrowSize(-1)
$('btn-as-up').onclick = () => changeArrowSize(1)
$('btn-as-reset').onclick = resetArrowSize
$('btn-dash').onclick = toggleDash
$('btn-math').onclick = toggleMath
$('btn-hatch').onclick = cycleHatch
$('btn-frame').onclick = toggleFrame
$('btn-ep-reset').onclick = resetEndpoints
$('btn-fs-down').onclick = () => changeFontSize(-1)
$('btn-fs-up').onclick = () => changeFontSize(1)
$('btn-fs-reset').onclick = resetFontSize
$('btn-front').onclick = () => reorderSelection('front')
$('btn-back').onclick = () => reorderSelection('back')
$('btn-del').onclick = deleteSelection
$('btn-save').onclick = save
$('btn-open').onclick = load
$('btn-png').onclick = exportPNG

render()

// 개발/테스트용 훅
window._app = {
  get state() { return state },
  set state(s) { adoptImages(s); state = s; render() },
  // 자동 테스트용 완전 초기화 — 도면뿐 아니라 실행 취소 기록·선택·모드까지 지운다.
  // state 만 비우면 Ctrl+Z 한 번에 테스트 데이터가 되살아난다.
  reset() {
    state = { boxes: [], arrows: [], tags: [], nextId: 1 }
    undoStack = []
    clipboard = null
    sysClipSeen = null
    clearSelection()
    arrowMode = false
    arrowSource = null
    pickMode = false
    clearGuides()
    $('msg').textContent = ''
    render()
  },
  get guides() { return { lines: guideLines, spans: guideSpans } },
  get smartGuidesOn() { return smartGuidesOn },
  set smartGuidesOn(v) { smartGuidesOn = v; clearGuides(); render() },
  render,
  renderPNGDataURL,
  serialize,
  putImage,
  insertImage,
  makeColorTransparent,
  imageStore,
  get pickMode() { return pickMode },
  set pickMode(v) { pickMode = v; render() }
}
