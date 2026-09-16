import { BrowserWindow, session, type Session } from 'electron'
import type { OnlineSite } from '../shared/types'
import { siteHeaders } from './net'
import { getSettings } from './store'

/**
 * 在线观看：按番号一一对应到各在线播放站点，在程序内的专用播放窗口中打开。
 *
 * jable / missav 的详情页地址可以直接由番号拼出（kind = direct）；
 * supjav / netflav 的详情页是站内数字 id，无法由番号推导，
 * 因此用「按番号搜索」页定位（kind = search），点进去就是对应影片。
 */

interface SiteDef extends OnlineSite {
  /** 由番号生成页面地址 */
  build: (code: string) => string
  /** 允许在播放窗口内跳转的主域（顶层导航跳出这些域一律拦截，防广告劫持） */
  hosts: string[]
}

const SITES: SiteDef[] = [
  {
    id: 'missav',
    name: 'MissAV',
    kind: 'direct',
    build: (code) => `https://missav.live/cn/${code.toLowerCase()}`,
    hosts: ['missav.live', 'missav.ws', 'missav.ai', 'missav.com']
  },
  {
    id: 'jable',
    name: 'Jable',
    kind: 'direct',
    build: (code) => `https://jable.tv/videos/${code.toLowerCase()}/`,
    hosts: ['jable.tv']
  },
  {
    id: 'supjav',
    name: 'SupJav',
    kind: 'search',
    build: (code) => `https://supjav.com/zh/?s=${encodeURIComponent(code)}`,
    hosts: ['supjav.com']
  },
  {
    id: 'netflav',
    name: 'Netflav',
    kind: 'search',
    build: (code) => `https://netflav.com/search?type=title&keyword=${encodeURIComponent(code)}`,
    hosts: ['netflav.com', 'netflav5.com']
  }
]

export function listOnlineSites(): OnlineSite[] {
  return SITES.map(({ id, name, kind }) => ({ id, name, kind }))
}

/** 常见弹窗/广告联盟域名，播放窗口里的请求直接掐掉 */
const AD_HOSTS = [
  'exoclick.com',
  'exosrv.com',
  'exdynsrv.com',
  'juicyads.com',
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'trafficjunky.com',
  'trafficjunky.net',
  'adtng.com',
  'tsyndicate.com',
  'realsrv.com',
  'magsrv.com',
  'syndication.exosrv.com',
  'ero-advertising.com',
  'adsco.re',
  'a-ads.com',
  'mopvip.icu',
  'histats.com'
]

function isAdUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return AD_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

function hostAllowed(url: string, hosts: string[]): boolean {
  try {
    const host = new URL(url).hostname
    return hosts.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/** 播放窗口用独立会话：跟主界面的 Cookie 隔离，并单独装广告拦截钩子 */
let onlineSession: Session | null = null

async function getOnlineSession(): Promise<Session> {
  if (onlineSession) {
    await applyProxy(onlineSession)
    return onlineSession
  }
  const sess = session.fromPartition('persist:javbus-online')
  // Electron 默认 UA 带 "Electron/x.y"，部分站点的防护会因此拦截，换成普通 Chrome UA
  sess.setUserAgent(siteHeaders.UA)
  await applyProxy(sess)

  sess.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
    cb({ cancel: isAdUrl(details.url) })
  })
  onlineSession = sess
  return sess
}

/** 播放窗口跟随主程序的代理设置（这些站点通常也需要代理访问） */
async function applyProxy(sess: Session): Promise<void> {
  const s = getSettings()
  if (s.proxyMode !== 'off' && s.proxyUrl.trim()) {
    try {
      const url = new URL(s.proxyUrl.trim())
      const scheme = url.protocol.replace(':', '')
      await sess.setProxy({
        proxyRules: `${scheme}://${url.host}`,
        proxyBypassRules: '<local>;127.0.0.1;localhost'
      })
      return
    } catch {
      /* 配置非法则直连 */
    }
  }
  await sess.setProxy({ proxyRules: 'direct://' })
}

let playerWin: BrowserWindow | null = null
/** 当前窗口允许的顶层导航域，切换站点时更新 */
let currentHosts: string[] = []

/**
 * 在程序内的播放窗口打开某个番号的在线观看页。
 * 窗口是单例：已开着就复用（切地址 + 置前），避免越点越多。
 * 返回实际打开的页面地址。
 */
export async function openOnline(code: string, siteId: string): Promise<string> {
  const site = SITES.find((s) => s.id === siteId)
  if (!site) throw new Error(`未知的在线站点：${siteId}`)
  const trimmed = code.trim()
  if (!trimmed) throw new Error('番号为空')

  const url = site.build(trimmed)
  currentHosts = site.hosts

  if (playerWin && !playerWin.isDestroyed()) {
    playerWin.setTitle(`${trimmed} - ${site.name}`)
    void playerWin.loadURL(url)
    if (playerWin.isMinimized()) playerWin.restore()
    playerWin.focus()
    return url
  }

  const sess = await getOnlineSession()
  playerWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    center: true,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: `${trimmed} - ${site.name}`,
    webPreferences: {
      session: sess,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  // 这些站点点播放器常会 window.open 弹广告，一律拦掉
  playerWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // 顶层导航只允许留在当前站点内（站内换片可以，跳去广告页不行）
  playerWin.webContents.on('will-navigate', (e, target) => {
    if (!hostAllowed(target, currentHosts)) e.preventDefault()
  })

  // 页面自己改 title 时会盖掉番号，导航完成后再钉回去
  playerWin.webContents.on('page-title-updated', (e) => e.preventDefault())

  playerWin.on('closed', () => {
    playerWin = null
  })

  void playerWin.loadURL(url)
  return url
}

export function disposeOnline(): void {
  if (playerWin && !playerWin.isDestroyed()) playerWin.destroy()
  playerWin = null
}
