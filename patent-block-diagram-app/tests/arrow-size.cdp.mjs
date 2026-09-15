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
  await evaluate(`(() => {
    _app.reset()
    _app.state = {
      boxes: [
        { id: 1, x: 100, y: 100, w: 160, h: 60, text: 'A', z: 10 },
        { id: 2, x: 420, y: 100, w: 160, h: 60, text: 'B', z: 10 }
      ],
      arrows: [{ id: 3, from: 1, to: 2, style: 'straight', z: 2 }],
      tags: [], nextId: 4
    }
    document.querySelector('[data-type="arrow"] path').dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 130 })
    )
  })()`)

  const initial = await evaluate(`({
    label: document.getElementById('as-label')?.textContent,
    disabled: document.getElementById('btn-as-up')?.disabled,
    stroke: document.querySelector('[data-type="arrow"] path:nth-child(2)')?.getAttribute('stroke-width')
  })`)
  assert.deepEqual(initial, { label: '4', disabled: false, stroke: '4' })

  const grown = await evaluate(`(() => {
    document.getElementById('btn-as-up').click()
    const arrow = _app.state.arrows[0]
    const path = document.querySelector('[data-type="arrow"] path:nth-child(2)')
    return {
      size: arrow.lw,
      label: document.getElementById('as-label').textContent,
      stroke: path.getAttribute('stroke-width'),
      markerUnits: document.getElementById('ah').getAttribute('markerUnits')
    }
  })()`)
  assert.deepEqual(grown, { size: 5, label: '5', stroke: '5', markerUnits: 'strokeWidth' })

  const reset = await evaluate(`(() => {
    document.getElementById('btn-as-reset').click()
    return {
      hasOwnSize: Object.hasOwn(_app.state.arrows[0], 'lw'),
      label: document.getElementById('as-label').textContent,
      stroke: document.querySelector('[data-type="arrow"] path:nth-child(2)').getAttribute('stroke-width')
    }
  })()`)
  assert.deepEqual(reset, { hasOwnSize: false, label: '4', stroke: '4' })

  if (process.env.VISUAL_OUTPUT) {
    const fixture = JSON.parse(await readFile(path.join(root, 'tests', 'fixtures', 'arrow-sizes.pbd'), 'utf8'))
    await evaluate(`_app.state = ${JSON.stringify(fixture)}`)
    const dataURL = await evaluate(`_app.renderPNGDataURL(2)`)
    await writeFile(process.env.VISUAL_OUTPUT, Buffer.from(dataURL.split(',')[1], 'base64'))
  }

  console.log('arrow size behavior: ok')
} finally {
  ws.close()
  child.kill()
}
