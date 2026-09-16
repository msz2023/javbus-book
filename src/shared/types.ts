/** 主进程与渲染进程共用的数据结构 */

export type ListKind =
  | 'home' // 有码首页
  | 'uncensored' // 无码首页
  | 'genre'
  | 'uncensored-genre'
  | 'star'
  | 'uncensored-star'
  | 'director'
  | 'studio'
  | 'label'
  | 'series'
  | 'search'
  | 'uncensored-search'

/** 一次列表查询的定位信息，page 与站点页码 1:1 对应 */
export interface ListQuery {
  kind: ListKind
  /** genre/star/director/... 的站内 id，或搜索关键字 */
  value?: string
  /** 用于界面显示的名称（如「業餘」「葵つかさ」） */
  label?: string
  page: number
}

export interface MovieBrief {
  code: string
  title: string
  /** 缩略封面绝对地址 */
  cover: string
  date: string
  /** 列表页角标：高清 / 字幕 等 */
  tags: string[]
  detailUrl: string
}

export interface Pagination {
  current: number
  pages: number[]
  hasPrev: boolean
  hasNext: boolean
  /** 站点未给出总页数时为已知的最大页码 */
  maxKnown: number
}

export interface ListResult {
  query: ListQuery
  items: MovieBrief[]
  pagination: Pagination
  /** 页面标题，用于面包屑 */
  heading: string
}

export interface NamedRef {
  name: string
  /** 站内 id，可直接用于筛选 */
  id: string
  kind: 'genre' | 'star' | 'director' | 'studio' | 'label' | 'series'
  avatar?: string
}

export interface Magnet {
  name: string
  link: string
  infoHash: string
  size: string
  sizeBytes: number
  shareDate: string
  hd: boolean
  subtitle: boolean
}

export interface MovieDetail {
  code: string
  title: string
  /** 大封面绝对地址 */
  cover: string
  date: string
  length: string
  director?: NamedRef
  studio?: NamedRef
  label?: NamedRef
  series?: NamedRef
  genres: NamedRef[]
  stars: NamedRef[]
  samples: { thumb: string; full: string }[]
  magnets: Magnet[]
  detailUrl: string
  uncensored: boolean
  /** 抓取时间戳 */
  fetchedAt: number
}

/**
 * bitcomet     = 走 BitComet 远程接口，有实时进度、可暂停/删除
 * bitcomet-exe = 命令行拉起 BitComet，进度靠读 Downloads.xml，有落盘延迟
 * external     = 交给系统默认程序（迅雷等），只能靠影片库扫描判断完成
 */
export type DownloadSource = 'bitcomet' | 'bitcomet-exe' | 'external'

export interface DownloadTask {
  id: string
  infoHash: string
  code: string
  name: string
  magnet: string
  source: DownloadSource
  addedAt: number
  /** 0 ~ 1 */
  progress: number
  /** 字节/秒 */
  dlspeed: number
  /** 上传速度，字节/秒 */
  upspeed?: number
  size: number
  /** 已下载字节数 */
  downloaded?: number
  /** 秒，8640000 表示未知 */
  eta: number
  state: string
  savePath?: string
  done: boolean
  error?: string
  /** BitComet 给的资源健康度，如 "200%" */
  health?: string
  /** BitComet 远程接口里的任务号，infoHash 映射成功后缓存下来 */
  bcTaskId?: number
  /** true = 这条是从 BitComet 里发现并收进来的，不是本程序添加的 */
  adopted?: boolean
}

export interface BcSettings {
  /** webui = 远程接口；exe = 只命令行拉起；off = 交给系统默认程序 */
  mode: 'webui' | 'exe' | 'off'
  url: string
  username: string
  password: string
  /** 登录用的稳定 client_id（PBKDF2 口令），首次启动生成后不再变 */
  clientId: string
  savePath: string
  /** BitComet.exe 路径，空 = 自动探测 */
  exePath: string
  /** Downloads.xml 所在目录，空 = 自动探测 */
  dataDir: string
  /** 把 BitComet 里已有、本程序没记录的任务也显示出来 */
  adoptRemote: boolean
}

/** BitComet 的一个下载目录。save_folder 必须精确等于其中某项的 path */
export interface BcFolder {
  path: string
  display: string
}

/** 自动探测到的 BitComet 本地路径，设置页展示用 */
export interface BcPaths {
  exePath: string | null
  downloadsXml: string | null
}

export interface Settings {
  proxyMode: 'auto' | 'manual' | 'off'
  proxyUrl: string
  mirrors: string[]
  activeMirror: string
  bc: BcSettings
  libraryDirs: string[]
  concurrency: number
  /** 两次站点请求之间的最小间隔（毫秒）。站点会对过快的请求返回 429 */
  requestGapMs: number
  cacheTtlHours: number
  /** 缓存（影片元数据 + 封面图磁盘缓存）存放目录，空字符串表示使用默认位置 */
  cacheDir: string
  /**
   * 浏览列表的呈现方式：
   * cover  = 完整图像（站点大封面 pics/cover/*_b.jpg，横版不裁切）
   * thumb  = 小图像（站点缩略图，竖版密排）
   * detail = 详细信息（一行一部，带日期/标签/进度）
   */
  viewMode: 'cover' | 'thumb' | 'detail'
  /** 卡片最小宽度（px）。cover/thumb 模式下决定每行放几个 */
  cardWidth: number
  /** 界面整体缩放，1 = 100% */
  uiScale: number
  autoFetchDetailOnHover: boolean
  /** 打开「已下载影片」时，自动按番号把影片库里缺资料的影片抓进缓存 */
  autoFillLibraryMeta: boolean
}

export interface LibraryEntry {
  code: string
  files: { path: string; size: number; mtime: number }[]
}

export interface CrawlProgress {
  running: boolean
  /** pages = 按页码区间批量抓取；library = 按影片库番号补齐资料 */
  kind: 'pages' | 'library'
  fromPage: number
  toPage: number
  currentPage: number
  totalItems: number
  doneItems: number
  failedItems: number
  /** kind = library 时：站点上确实找不到的番号 */
  unmatched: string[]
  message: string
}

export interface Toast {
  kind: 'ok' | 'err' | 'info'
  message: string
}

/** 类别总览页的一个分组（如「主題」「场景」），items 的 id 可直接用于 genre 列表查询 */
export interface GenreGroup {
  name: string
  items: { id: string; name: string }[]
}

/**
 * 在线观看站点。
 * direct = 详情页地址可由番号直接拼出，点开就是对应影片
 * search = 站内 id 无法由番号推导，打开的是按番号搜索的结果页
 */
export interface OnlineSite {
  id: string
  name: string
  kind: 'direct' | 'search'
}
