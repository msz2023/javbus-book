import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type {
  DownloadTask,
  LibraryEntry,
  ListQuery,
  ListResult,
  Magnet,
  MovieDetail,
  Settings
} from '../shared/types'
import { isSameCode, normCode } from '../shared/code'
import { configureSession } from './browser-session'
import {
  bulkCrawl,
  cancelCrawl,
  codesNeedingMeta,
  crawlProgress,
  fetchGenres,
  fetchListPage,
  fetchMovie,
  fillLibraryMetadata,
  resolveByCode
} from './crawler'
import * as dl from './downloads'
import {
  filesFor,
  isDownloaded,
  librarySnapshot,
  mainFileFor,
  playFile,
  restartWatchers,
  revealFile,
  scanLibrary
} from './library'
import { autoConfigureProxy, probeProxyPort, resetNet, setConcurrency } from './net'
import { listOnlineSites, openOnline } from './online'
import * as bc from './bitcomet'
import {
  allCachedMovies,
  cacheInfo,
  clearCache,
  getFavorites,
  getSettings,
  peekCachedMovie,
  saveSettings,
  toggleFavorite
} from './store'

export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

/** 统一包装：把主进程异常变成渲染层可展示的错误文本 */
function handle<T>(channel: string, fn: (...args: any[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true as const, data: await fn(...args) }
    } catch (e) {
      const err = e as Error & { detail?: string }
      return {
        ok: false as const,
        error: err?.message || '未知错误',
        detail: err?.detail
      }
    }
  })
}

export interface LocalFilter {
  keyword?: string
  genres?: string[]
  stars?: string[]
  directors?: string[]
  studios?: string[]
  onlyDownloaded?: boolean
  onlyMissing?: boolean
  favOnly?: boolean
  sort?: 'date-desc' | 'date-asc' | 'code' | 'added-desc'
}

export interface LocalFilterResult {
  items: MovieDetail[]
  total: number
  facets: {
    genres: { name: string; id: string; count: number }[]
    stars: { name: string; id: string; count: number }[]
    directors: { name: string; id: string; count: number }[]
    studios: { name: string; id: string; count: number }[]
  }
}

function applyLocalFilter(f: LocalFilter): LocalFilterResult {
  const favs = getFavorites()
  let items = allCachedMovies()

  // 收藏存的是点收藏时的番号写法，缓存里是站点写法，两边可能差分隔符或后缀
  if (f.favOnly) items = items.filter((m) => favs.some((c) => isSameCode(c, m.code)))
  if (f.keyword) {
    const kw = f.keyword.toLowerCase()
    items = items.filter(
      (m) =>
        m.code.toLowerCase().includes(kw) ||
        m.title.toLowerCase().includes(kw) ||
        m.stars.some((s) => s.name.toLowerCase().includes(kw))
    )
  }
  const has = (list: string[] | undefined, names: string[]): boolean =>
    !list?.length || list.every((want) => names.includes(want))

  items = items.filter(
    (m) =>
      has(f.genres, m.genres.map((g) => g.name)) &&
      has(f.stars, m.stars.map((s) => s.name)) &&
      has(f.directors, m.director ? [m.director.name] : []) &&
      has(f.studios, m.studio ? [m.studio.name] : [])
  )
  if (f.onlyDownloaded) items = items.filter((m) => isDownloaded(m.code))
  if (f.onlyMissing) items = items.filter((m) => !isDownloaded(m.code))

  const count = (
    pick: (m: MovieDetail) => { name: string; id: string }[]
  ): { name: string; id: string; count: number }[] => {
    const map = new Map<string, { name: string; id: string; count: number }>()
    for (const m of items) {
      for (const ref of pick(m)) {
        const cur = map.get(ref.name)
        if (cur) cur.count++
        else map.set(ref.name, { name: ref.name, id: ref.id, count: 1 })
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }

  const facets = {
    genres: count((m) => m.genres),
    stars: count((m) => m.stars),
    directors: count((m) => (m.director ? [m.director] : [])),
    studios: count((m) => (m.studio ? [m.studio] : []))
  }

  const sorted = [...items].sort((a, b) => {
    switch (f.sort) {
      case 'date-asc':
        return a.date.localeCompare(b.date)
      case 'code':
        return a.code.localeCompare(b.code)
      case 'added-desc':
        return b.fetchedAt - a.fetchedAt
      default:
        return b.date.localeCompare(a.date)
    }
  })

  return { items: sorted.slice(0, 600), total: sorted.length, facets }
}

export function registerIpc(): void {
  // ---------- 设置 ----------
  handle<Settings>('settings:get', () => getSettings())
  handle<Settings>('settings:save', async (patch: Partial<Settings>) => {
    const next = saveSettings(patch)
    resetNet()
    setConcurrency(next.concurrency)
    if (patch.proxyMode !== undefined || patch.proxyUrl !== undefined || patch.mirrors) {
      await configureSession()
    }
    if (patch.libraryDirs) {
      scanLibrary()
      restartWatchers()
      broadcast('library:update', libraryPayload())
    }
    if (patch.bc) bc.invalidateSession()
    return next
  })
  handle('settings:probeProxy', async () => {
    const port = await probeProxyPort()
    return port ? `http://127.0.0.1:${port}` : null
  })
  handle('settings:autoProxy', async () => {
    await autoConfigureProxy()
    return getSettings()
  })
  handle('settings:pickDir', async (title: string) => {
    const res = await dialog.showOpenDialog({
      title: title || '选择目录',
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled ? null : res.filePaths[0]
  })
  handle('cache:info', () => cacheInfo())
  handle('cache:clear', () => {
    clearCache()
    return cacheInfo()
  })

  // ---------- 影片 ----------
  handle<ListResult>('list:fetch', (query: ListQuery) => fetchListPage(query))
  handle<MovieDetail>('movie:fetch', (code: string, force?: boolean) => fetchMovie(code, { force }))
  handle<MovieDetail | null>('movie:cached', (code: string) => peekCachedMovie(code) ?? null)
  handle<LocalFilterResult>('local:filter', (f: LocalFilter) => applyLocalFilter(f ?? {}))

  // ---------- 类别 ----------
  /** 类别总览（有码/无码），供「类别标签」页展示 */
  handle('genres:fetch', (uncensored?: boolean) => fetchGenres(!!uncensored))

  // ---------- 收藏 ----------
  handle<string[]>('fav:list', () => getFavorites())
  handle<string[]>('fav:toggle', (code: string) => {
    const next = toggleFavorite(code)
    // 「我的收藏」页是拿本地缓存过滤的：只在列表卡片上点心、没打开过详情的影片
    // 从未入过缓存，收藏页会看不见。这里在收藏时后台把资料抓进来，抓完通知界面刷新。
    if (next.some((c) => isSameCode(c, code)) && !peekCachedMovie(code)) {
      void resolveByCode(code)
        .then((detail) => {
          if (detail) broadcast('fav:hydrated', detail.code)
        })
        .catch(() => {
          /* 网络失败时忽略，下次打开详情自然会补上 */
        })
    }
    return next
  })

  // ---------- 本地库 ----------
  handle('lib:scan', () => {
    scanLibrary()
    const payload = libraryPayload()
    broadcast('library:update', payload)
    return payload
  })
  handle('lib:list', () => libraryPayload())
  handle('lib:files', (code: string) => filesFor(code))
  handle('lib:play', async (codeOrPath: string) => {
    const path = codeOrPath.includes('\\') || codeOrPath.includes('/') ? codeOrPath : mainFileFor(codeOrPath)
    if (!path) throw new Error('本地没有找到该番号对应的文件')
    const err = await playFile(path)
    if (err) throw new Error(`调用播放器失败：${err}`)
    return path
  })
  handle('lib:reveal', (path: string) => {
    revealFile(path)
    return true
  })
  /** 影片库里缺资料的番号：pending 待抓，skipped 是之前搜过、站点上没有的 */
  handle('lib:missing', () => {
    const codes = librarySnapshot().map((e) => e.code)
    return codesNeedingMeta(codes)
  })
  /** 按番号补齐影片库的资料（缺省补全部缺的） */
  handle('lib:fill', (codes?: string[], retryUnmatched?: boolean) => {
    const target = codes?.length ? codes : librarySnapshot().map((e) => e.code)
    return fillLibraryMetadata(target, (p) => broadcast('crawl:progress', p), { retryUnmatched })
  })

  // ---------- 下载 ----------
  handle<DownloadTask>('dl:add', (magnet: Magnet, code: string, forceExternal?: boolean) =>
    dl.addDownload(magnet, code, { forceExternal })
  )
  handle<DownloadTask[]>('dl:list', () => dl.listTasks())
  handle('dl:pause', (hash: string) => dl.pause(hash))
  handle('dl:resume', (hash: string) => dl.resume(hash))
  handle('dl:remove', (hash: string, deleteFiles: boolean) => dl.remove(hash, deleteFiles))
  handle('dl:clearFinished', () => {
    dl.clearFinished()
    return dl.listTasks()
  })
  handle('dl:play', async (hash: string) => {
    const path = await dl.playTask(hash)
    if (!path) throw new Error('还没有可播放的文件')
    const err = await playFile(path)
    if (err) throw new Error(`调用播放器失败：${err}`)
    return path
  })
  handle('dl:openExternal', async (magnet: string) => {
    await shell.openExternal(magnet)
    return true
  })
  /** 打开 BitComet：本机装了就拉主界面，否则打开它的 WebUI */
  handle('bc:open', (target?: bc.OpenTarget) => bc.openBitComet(target ?? 'auto'))
  handle('bc:test', () => bc.testConnection())
  handle('bc:probe', () => bc.probePorts())
  handle('bc:detect', () => bc.detectPaths())
  /** BitComet 的下载目录列表；save_folder 必须精确等于其中一项 */
  handle('bc:folders', (force?: boolean) => bc.listFolders(force))
  /** 把目录加进 BitComet 的下载目录列表 */
  handle('bc:addFolder', (path: string) => bc.addFolder(path))

  // ---------- 在线观看 ----------
  /** 可用的在线播放站点列表（番号 → 页面地址一一对应） */
  handle('online:sites', () => listOnlineSites())
  /** 在程序内的播放窗口打开对应番号的在线观看页，返回实际地址 */
  handle('online:open', (code: string, siteId: string) => openOnline(code, siteId))

  // ---------- 批量抓取 ----------
  handle('crawl:start', (query: ListQuery, from: number, to: number) =>
    bulkCrawl(query, from, to, (p) => broadcast('crawl:progress', p))
  )
  handle('crawl:cancel', () => {
    cancelCrawl()
    return crawlProgress()
  })
  handle('crawl:progress', () => crawlProgress())

  // ---------- 杂项 ----------
  /** 界面缩放走 Chromium 的 zoomFactor，比改 CSS 字号稳（图片、边框一起缩） */
  handle('app:zoom', (scale: number) => {
    const clamped = Math.min(2, Math.max(0.7, Number(scale) || 1))
    for (const win of BrowserWindow.getAllWindows()) win.webContents.setZoomFactor(clamped)
    return clamped
  })
  handle('app:copy', (text: string) => {
    clipboard.writeText(text)
    return true
  })
  handle('app:openUrl', async (url: string) => {
    await shell.openExternal(url)
    return true
  })
}

export function libraryPayload(): { codes: string[]; entries: LibraryEntry[] } {
  const entries = librarySnapshot()
  // codes 给界面做「已下载」判断，统一归一化；entries 里保留可读番号
  return { codes: entries.map((e) => normCode(e.code)), entries }
}
