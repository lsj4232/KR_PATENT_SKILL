const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron')
const fs = require('fs')
const path = require('path')

const EXTS = ['pbd', 'json']

let win = null
let ready = false         // 렌더러가 로드를 마쳐 IPC를 받을 수 있는 상태인가
let currentPath = null    // 현재 편집 중인 도면 파일 경로 (있으면 저장 시 덮어쓰기)
let pendingPath = null    // 창이 준비되기 전에 열라고 넘어온 파일

// 실행 인자에서 도면 파일 경로를 찾는다 (electron . 의 '.' 이나 --flag 는 무시)
function fileFromArgv(argv) {
  for (const a of argv.slice(1)) {
    if (a.startsWith('-') || a === '.') continue
    const ext = path.extname(a).slice(1).toLowerCase()
    if (!EXTS.includes(ext)) continue
    const p = path.resolve(a)
    if (fs.existsSync(p)) return p
  }
  return null
}

function setTitle() {
  if (!win) return
  win.setTitle(currentPath ? `${path.basename(currentPath)} — 특허 블록도 에디터` : '특허 블록도 에디터')
}

// 파일을 읽어 렌더러로 밀어넣는다 (창이 아직 없으면 보류)
function openPath(p) {
  if (!p || !fs.existsSync(p)) return
  if (!win || !ready) { pendingPath = p; return }   // 창 준비 전이면 보류했다가 did-finish-load에서 처리
  currentPath = p
  setTitle()
  win.webContents.send('open-file', fs.readFileSync(p, 'utf-8'))
  win.focus()
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: '특허 블록도 에디터',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  })
  win.loadFile('index.html')
  win.on('page-title-updated', e => e.preventDefault())   // 창 제목은 setTitle()로만 관리
  win.webContents.on('did-finish-load', () => {
    ready = true
    setTitle()
    if (pendingPath) { const p = pendingPath; pendingPath = null; openPath(p) }
  })
  win.on('closed', () => { win = null; ready = false })
}

// 이미 떠 있는 창이 있으면 새 프로세스를 띄우지 않고 그 창에서 파일을 연다
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
    openPath(fileFromArgv(argv))
  })

  // macOS: Finder에서 파일 더블클릭
  app.on('open-file', (e, p) => {
    e.preventDefault()
    if (app.isReady()) openPath(p)
    else pendingPath = p
  })

  pendingPath = fileFromArgv(process.argv)

  app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 저장: 경로를 알고 있으면 그대로 덮어쓰기, 없거나 saveAs면 대화상자
ipcMain.handle('save-json', async (e, data, saveAs) => {
  let target = currentPath
  if (!target || saveAs) {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [{ name: '블록도 파일', extensions: EXTS }],
      defaultPath: target || '도면.pbd'
    })
    if (canceled) return false
    target = filePath
  }
  fs.writeFileSync(target, data, 'utf-8')
  currentPath = target
  setTitle()
  return path.basename(target)
})

ipcMain.handle('load-json', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: '블록도 파일', extensions: EXTS }],
    properties: ['openFile']
  })
  if (canceled) return null
  currentPath = filePaths[0]
  setTitle()
  return fs.readFileSync(currentPath, 'utf-8')
})

// 도면에 넣을 이미지 파일을 골라 data URL 로 돌려준다 (도면 파일에 그대로 실려 이식성이 유지된다)
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']
const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' }

ipcMain.handle('load-image', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: '이미지', extensions: IMAGE_EXTS }],
    properties: ['openFile']
  })
  if (canceled || !filePaths[0]) return null
  const ext = path.extname(filePaths[0]).slice(1).toLowerCase()
  return `data:${IMAGE_MIME[ext] || 'image/png'};base64,` + fs.readFileSync(filePaths[0]).toString('base64')
})

// 시스템 클립보드에 그림이 있으면 data URL 로 (화면 캡처를 바로 붙여넣기 위한 경로)
ipcMain.handle('clipboard-image', async () => {
  const img = clipboard.readImage()
  return img.isEmpty() ? null : img.toDataURL()
})

ipcMain.handle('export-png', async (e, dataURL) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'PNG 이미지', extensions: ['png'] }],
    defaultPath: currentPath ? currentPath.replace(/\.(pbd|json)$/i, '.png') : '도면.png'
  })
  if (canceled) return false
  fs.writeFileSync(filePath, Buffer.from(dataURL.split(',')[1], 'base64'))
  return true
})
