import { contextBridge, ipcRenderer } from 'electron'
import type {
  BcFolder,
  BcPaths,
  CrawlProgress,
  DownloadTask,
  GenreGroup,
  LibraryEntry,
  ListQuery,
  ListResult,
  Magnet,
  MovieDetail,
  OnlineSite,
  Settings
} from '../shared/types'

export interface Ok<T> {
  ok: true
  data: T
}
export interface Err {
  ok: false
  error: string
  detail?: string
}
export type Res<T> = Ok<T> | Err

const call = <T>(channel: string, ...args: unknown[]): Promise<Res<T>> =>
  ipcRenderer.invoke(channel, ...args) as Promise<Res<T>>

const on = (channel: string, cb: (payload: any) => void): (() => void) => {
  const listener = (_e: unknown, payload: any): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
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

export interface Facet {
  name: string
  id: string
  count: number
}

export interface LocalFilterResult {
  items: MovieDetail[]
  total: number
  facets: { genres: Facet[]; stars: Facet[]; directors: Facet[]; studios: Facet[] }
}

export interface LibraryPayload {
  codes: string[]
  entries: LibraryEntry[]
}

export interface MissingMeta {
  /** 硬盘上有文件、缓存里没资料，待抓 */
  pending: string[]
  /** 之前搜过、站点上确实没有，默认跳过 */
  skipped: string[]
}

export interface CacheInfo {
  dir: string
  file: string
  bytes: number
  movies: number
}

const api = {
  settings: {
    get: () => call<Settings>('settings:get'),
    save: (patch: Partial<Settings>) => call<Settings>('settings:save', patch),
    probeProxy: () => call<string | null>('settings:probeProxy'),
    autoProxy: () => call<Settings>('settings:autoProxy'),
    pickDir: (title?: string) => call<string | null>('settings:pickDir', title)
  },
  cache: {
    info: () => call<CacheInfo>('cache:info'),
    clear: () => call<CacheInfo>('cache:clear')
  },
  movies: {
    list: (query: ListQuery) => call<ListResult>('list:fetch', query),
    detail: (code: string, force?: boolean) => call<MovieDetail>('movie:fetch', code, force),
    cached: (code: string) => call<MovieDetail | null>('movie:cached', code),
    localFilter: (filter: LocalFilter) => call<LocalFilterResult>('local:filter', filter),
    /** 类别总览页（有码 / 无码） */
    genres: (uncensored?: boolean) => call<GenreGroup[]>('genres:fetch', uncensored)
  },
  favorites: {
    list: () => call<string[]>('fav:list'),
    toggle: (code: string) => call<string[]>('fav:toggle', code)
  },
  library: {
    scan: () => call<LibraryPayload>('lib:scan'),
    list: () => call<LibraryPayload>('lib:list'),
    files: (code: string) => call<{ path: string; size: number; mtime: number }[]>('lib:files', code),
    play: (codeOrPath: string) => call<string>('lib:play', codeOrPath),
    reveal: (path: string) => call<boolean>('lib:reveal', path),
    /** 影片库里还缺资料的番号 */
    missing: () => call<MissingMeta>('lib:missing'),
    /** 按番号补齐资料入库；不传 codes 就补全部缺的 */
    fill: (codes?: string[], retryUnmatched?: boolean) =>
      call<CrawlProgress>('lib:fill', codes, retryUnmatched)
  },
  downloads: {
    add: (magnet: Magnet, code: string, forceExternal?: boolean) =>
      call<DownloadTask>('dl:add', magnet, code, forceExternal),
    list: () => call<DownloadTask[]>('dl:list'),
    pause: (hash: string) => call<void>('dl:pause', hash),
    resume: (hash: string) => call<void>('dl:resume', hash),
    remove: (hash: string, deleteFiles: boolean) => call<void>('dl:remove', hash, deleteFiles),
    clearFinished: () => call<DownloadTask[]>('dl:clearFinished'),
    play: (hash: string) => call<string>('dl:play', hash),
    openExternal: (magnet: string) => call<boolean>('dl:openExternal', magnet),
    /** 打开 BitComet 本体（本机没装就打开它的 WebUI），返回实际走的哪条路 */
    openBitComet: (target?: 'auto' | 'exe' | 'webui') =>
      call<'exe' | 'webui'>('bc:open', target),
    testBitComet: () => call<{ version: string; serverName: string }>('bc:test'),
    /** 扫本机端口找 BitComet 远程接口，返回 http://127.0.0.1:<port> */
    probeBitComet: () => call<string | null>('bc:probe'),
    /** 自动探测到的 BitComet.exe 与 Downloads.xml 路径 */
    detectBitComet: () => call<BcPaths>('bc:detect'),
    /** BitComet 的下载目录列表（save_folder 只接受列表内的目录） */
    bcFolders: (force?: boolean) =>
      call<{ folders: BcFolder[]; defaultDir: string }>('bc:folders', force),
    /** 把目录加进 BitComet 的下载目录列表 */
    bcAddFolder: (path: string) => call<BcFolder[]>('bc:addFolder', path)
  },
  online: {
    /** 可用的在线播放站点（按番号一一对应） */
    sites: () => call<OnlineSite[]>('online:sites'),
    /** 在程序内的播放窗口打开该番号的在线观看页，返回实际地址 */
    open: (code: string, siteId: string) => call<string>('online:open', code, siteId)
  },
  crawl: {
    start: (query: ListQuery, from: number, to: number) =>
      call<CrawlProgress>('crawl:start', query, from, to),
    cancel: () => call<CrawlProgress>('crawl:cancel'),
    progress: () => call<CrawlProgress>('crawl:progress')
  },
  util: {
    copy: (text: string) => call<boolean>('app:copy', text),
    openUrl: (url: string) => call<boolean>('app:openUrl', url),
    /** 界面缩放，返回实际生效的比例（会夹到 0.7 ~ 2） */
    zoom: (scale: number) => call<number>('app:zoom', scale)
  },
  events: {
    onDownloads: (cb: (tasks: DownloadTask[]) => void) => on('downloads:update', cb),
    onLibrary: (cb: (payload: LibraryPayload) => void) => on('library:update', cb),
    onCrawl: (cb: (p: CrawlProgress) => void) => on('crawl:progress', cb),
    /** 收藏的影片资料后台抓取完成（收藏页需要刷新一次才能显示） */
    onFavHydrated: (cb: (code: string) => void) => on('fav:hydrated', cb)
  }
}

export type JavbusApi = typeof api

contextBridge.exposeInMainWorld('api', api)
