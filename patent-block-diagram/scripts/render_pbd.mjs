// .pbd 도면을 실행 중인 "특허 블록도 에디터"(CDP 포트 9222)에 주입하고 PNG로 내보낸다.
//
//   node render_pbd.mjs <입력.pbd> <출력.png> [scale=2]
//
// 전제: 앱이 --remote-debugging-port=9222 로 떠 있어야 한다.
//   cd <APP_DIR> && ./node_modules/.bin/electron.cmd . --remote-debugging-port=9222 &
//
// scale 2 = 검토용 미리보기, 3 = 출원 제출용 고해상도.
import fs from 'fs'

const [src, out, scaleArg] = process.argv.slice(2)
const scale = Number(scaleArg) || 2
if (!src || !out) {
  console.error('usage: node render_pbd.mjs <입력.pbd> <출력.png> [scale]')
  process.exit(1)
}

// 포트는 PBD_PORT 로 바꿀 수 있다. 사용자 창을 빼앗지 않으려면 --user-data-dir 로 띄운
// 전용 인스턴스(예: 9333)를 쓴다 — SKILL.md "앱 위치와 실행" 경고 참조
const PORT = process.env.PBD_PORT || 9222
const list = await (await fetch('http://localhost:' + PORT + '/json/list')).json()
const page = list.find(t => t.type === 'page')
if (!page) { console.error('앱이 떠 있지 않다 (CDP 9222 응답 없음)'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.onmessage = e => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise(res => {
  const i = ++id
  pending.set(i, res)
  ws.send(JSON.stringify({ id: i, method, params }))
})
const evalJS = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}
await new Promise(r => ws.onopen = r)

// 도면 주입 (에디터 캔버스에 실제로 그려진다 — 이후 사람이 이어서 편집 가능)
const stateJSON = fs.readFileSync(src, 'utf-8')
const n = await evalJS(`window._app.state = ${stateJSON}; _app.state.boxes.length`)
console.log('주입 완료: 박스', n, '개')

// 앱 자체 내보내기 함수로 PNG 생성 (흰 배경, 여백 20px, getBBox 기준 크롭)
const dataURL = await evalJS(`window._app.renderPNGDataURL(${scale})`, true)
if (typeof dataURL !== 'string' || !dataURL.startsWith('data:image/png')) {
  throw new Error('PNG 생성 실패: ' + String(dataURL).slice(0, 200))
}
fs.writeFileSync(out, Buffer.from(dataURL.split(',')[1], 'base64'))
console.log('PNG 저장:', out, fs.statSync(out).size, 'bytes (scale=' + scale + ')')
ws.close()
