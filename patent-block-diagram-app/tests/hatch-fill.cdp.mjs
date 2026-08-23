import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const port = 9321 + Math.floor(Math.random() * 300)
const profile = await mkdtemp(path.join(tmpdir(), 'patent-block-diagram-test-'))
const child = spawn(electron, ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], {
  cwd: root,
  stdio: 'ignore',
  windowsHide: true
})

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function pageInfo() {
  for (let i = 0; i < 80; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = pages.find(p => p.type === 'page' && p.url.includes('index.html'))
      if (page) return page
    } catch {}
    await wait(100)
  }
  throw new Error('Electron test page did not start')
}

const page = await pageInfo()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let seq = 0
const pending = new Map()
ws.addEventListener('message', event => {
  const msg = JSON.parse(event.data)
  if (!msg.id || !pending.has(msg.id)) return
  const { resolve, reject } = pending.get(msg.id)
  pending.delete(msg.id)
  msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
})

function cdp(method, params = {}) {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}

for (let i = 0; i < 80; i++) {
  if (await evaluate(`typeof window._app === 'object'`)) break
  if (i === 79) throw new Error('Application script did not become ready')
  await wait(100)
}

try {
  await evaluate(`window.bodyFill = () => {
    const rects = [...document.querySelectorAll('[data-type="box"][data-id="1"] rect')]
    const body = rects.find(r => r.getAttribute('fill') === 'white' || r.getAttribute('fill').startsWith('url('))
    return body ? body.getAttribute('fill') : null
  }`)

  await evaluate(`(() => {
    _app.reset()
    _app.state = {
      boxes: [
        { id: 1, x: 100, y: 100, w: 200, h: 80, text: '머리행', z: 10 },
        { id: 2, x: 100, y: 200, w: 200, h: 80, text: '본문행', z: 10 }
      ],
      arrows: [], tags: [], nextId: 3
    }
    document.querySelector('[data-type="box"][data-id="1"] rect').dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX: 200, clientY: 140 })
    )
  })()`)

  const initial = await evaluate(`({
    disabled: document.getElementById('btn-hatch').disabled,
    active: document.getElementById('btn-hatch').classList.contains('active'),
    fill: bodyFill()
  })`)
  assert.deepEqual(initial, { disabled: false, active: false, fill: 'white' })

  const hatched = await evaluate(`(() => {
    document.getElementById('btn-hatch').click()
    return {
      flag: _app.state.boxes[0].hatch,
      untouched: Object.hasOwn(_app.state.boxes[1], 'hatch'),
      active: document.getElementById('btn-hatch').classList.contains('active'),
      fill: bodyFill(),
      pattern: !!document.getElementById('hatch') && !!document.getElementById('dots')
    }
  })()`)
  assert.deepEqual(hatched, { flag: true, untouched: false, active: true, fill: 'url(#hatch)', pattern: true })

  // 해치를 켜면 점선·테두리없음은 풀린다 (채움이 없는 상태와 공존할 수 없다)
  const exclusive = await evaluate(`(() => {
    _app.state.boxes[0].dash = true
    _app.state.boxes[0].noFrame = true
    delete _app.state.boxes[0].hatch
    _app.render()
    document.getElementById('btn-hatch').click()
    const b = _app.state.boxes[0]
    return { hatch: b.hatch === true, dash: Object.hasOwn(b, 'dash'), noFrame: Object.hasOwn(b, 'noFrame') }
  })()`)
  assert.deepEqual(exclusive, { hatch: true, dash: false, noFrame: false })

  const dotted = await evaluate(`(() => {
    document.getElementById('btn-hatch').click()
    return { flag: _app.state.boxes[0].hatch, fill: bodyFill() }
  })()`)
  assert.deepEqual(dotted, { flag: 'dot', fill: 'url(#dots)' })

  const off = await evaluate(`(() => {
    document.getElementById('btn-hatch').click()
    return {
      hasOwn: Object.hasOwn(_app.state.boxes[0], 'hatch'),
      active: document.getElementById('btn-hatch').classList.contains('active'),
      fill: bodyFill()
    }
  })()`)
  assert.deepEqual(off, { hasOwn: false, active: false, fill: 'white' })

  const undone = await evaluate(`(() => {
    document.getElementById('btn-hatch').click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    return Object.hasOwn(_app.state.boxes[0], 'hatch')
  })()`)
  assert.equal(undone, false)

  if (process.env.VISUAL_OUTPUT) {
    const dataURL = await evaluate(`(() => {
      _app.state.boxes[0].hatch = true
      _app.render()
      return _app.renderPNGDataURL(2)
    })()`)
    await writeFile(process.env.VISUAL_OUTPUT, Buffer.from(dataURL.split(',')[1], 'base64'))
  }

  console.log('hatch fill behavior: ok')
} finally {
  ws.close()
  child.kill()
}
