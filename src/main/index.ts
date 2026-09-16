import { app, BrowserWindow, screen, shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { configureSession } from './browser-session'
import { disposeDownloads, initDownloads } from './downloads'
import { broadcast, libraryPayload, registerIpc } from './ipc'
import { disposeWatchers, scanLibrary, watchLibrary } from './library'
import { autoConfigureProxy, setConcurrency } from './net'
import { disposeOnline } from './online'
import { bootstrapSettings, flushAll, getSettings, initStore } from './store'

// 打包后 app 名会取 productName（"JavBus Desktop"），和 dev 模式的包名不一致，
// userData 会落到两个不同目录。钉死名字，dev 里调好的设置能直接带到便携版。
app.setName('javbus-desktop')

// 缓存目录必须在 app ready 之前设定，因此这里做一次裸读配置
const boot = bootstrapSettings()
if (boot.cacheDir?.trim()) {
  try {
    const dir = join(boot.cacheDir.trim(), 'javbus-cache', 'chromium')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    app.setPath('sessionData', dir)
  } catch {
    /* 目录不可用时保持默认位置 */
  }
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // 想要的默认尺寸，但绝不能超过工作区——高 DPI 屏上逻辑分辨率往往只有物理的 2/3，
  // 写死一个大数字会让窗口一半跑到屏幕外面去
  const work = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1600, work.width - 40)
  const height = Math.min(1000, work.height - 40)

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(1180, width),
    minHeight: Math.min(720, height),
    center: true,
    show: false,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    title: 'JavBus Desktop',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 主窗口关掉时，把在线观看的播放窗口一并带走，避免程序退不出去
  mainWindow.on('closed', () => {
    disposeOnline()
    mainWindow = null
  })

  // 界面缩放要在每次导航后重设——zoomFactor 不跨页面保留
  mainWindow.webContents.on('did-finish-load', () => {
    const scale = getSettings().uiScale
    if (scale && scale !== 1) mainWindow?.webContents.setZoomFactor(scale)
  })

  // 站外链接一律交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(async () => {
    initStore()
    setConcurrency(getSettings().concurrency)
    await autoConfigureProxy()
    await configureSession()
    registerIpc()

    scanLibrary()
    watchLibrary(() => broadcast('library:update', libraryPayload()))
    initDownloads((tasks) => broadcast('downloads:update', tasks))

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    disposeOnline()
    disposeDownloads()
    disposeWatchers()
    flushAll()
  })
}
