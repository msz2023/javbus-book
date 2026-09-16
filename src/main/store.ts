import { randomUUID } from 'crypto'
import { app } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { isSameCode, normCode } from '../shared/code'
import type { DownloadTask, MovieDetail, Settings } from '../shared/types'

const DEFAULT_SETTINGS: Settings = {
  proxyMode: 'auto',
  proxyUrl: 'http://127.0.0.1:7897',
  mirrors: ['https://www.javbus.com', 'https://javbus.com'],
  activeMirror: 'https://www.javbus.com',
  bc: {
    mode: 'webui',
    url: 'http://127.0.0.1:1235',
    username: 'admin',
    password: '',
    clientId: '',
    savePath: '',
    exePath: '',
    dataDir: '',
    adoptRemote: true
  },
  libraryDirs: [],
  concurrency: 3,
  requestGapMs: 420,
  cacheTtlHours: 24 * 14,
  cacheDir: '',
  viewMode: 'cover',
  cardWidth: 300,
  uiScale: 1,
  autoFetchDetailOnHover: false,
  autoFillLibraryMeta: true
}

/** 配置文件固定放在 userData，它要负责引导出缓存目录 */
function configDir(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 缓存目录：用户自定义优先，默认与配置同目录 */
export function resolveCacheDir(settings?: Settings): string {
  const custom = (settings ?? getSettings()).cacheDir?.trim()
  const dir = custom ? join(custom, 'javbus-cache') : join(configDir(), 'cache')
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  } catch {
    return join(configDir(), 'cache')
  }
  return dir
}

/**
 * 在 app ready 之前读取配置，用于设置 Chromium 缓存位置。
 * 此时不能依赖 initStore()，因此单独做一次裸读。
 */
export function bootstrapSettings(): Settings {
  try {
    const file = join(app.getPath('userData'), 'data', 'settings.json')
    if (existsSync(file)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(file, 'utf8')) }
    }
  } catch {
    /* 忽略，用默认值 */
  }
  return DEFAULT_SETTINGS
}

/**
 * 极简 JSON 持久化：原子写入 + 延迟落盘。
 * 数据量级（几千条影片）下无需引入原生 sqlite，避免 Windows 上的编译依赖。
 */
class JsonFile<T extends object> {
  private data: T
  private timer: NodeJS.Timeout | null = null
  private file: string

  constructor(
    private readonly name: string,
    private readonly fallback: T,
    dir: string
  ) {
    this.file = join(dir, name)
    this.data = fallback
    this.load()
  }

  private load(): void {
    if (existsSync(this.file)) {
      try {
        this.data = { ...this.fallback, ...JSON.parse(readFileSync(this.file, 'utf8')) }
        return
      } catch {
        /* 文件损坏时回退默认值，不阻塞启动 */
      }
    }
    this.data = this.fallback
  }

  /** 切换存放目录：搬迁已有文件后重新载入 */
  relocate(dir: string, migrate: boolean): void {
    const next = join(dir, this.name)
    if (next === this.file) return
    this.save(true)
    if (migrate && existsSync(this.file)) {
      try {
        copyFileSync(this.file, next)
        rmSync(this.file, { force: true })
      } catch {
        /* 跨盘或权限失败时保留原文件，仅切换位置 */
      }
    }
    this.file = next
    this.load()
  }

  path(): string {
    return this.file
  }

  sizeOnDisk(): number {
    try {
      return statSync(this.file).size
    } catch {
      return 0
    }
  }

  get(): T {
    return this.data
  }

  set(next: T): void {
    this.data = next
    this.save()
  }

  update(patch: Partial<T>): T {
    this.data = { ...this.data, ...patch }
    this.save()
    return this.data
  }

  save(immediate = false): void {
    if (this.timer) clearTimeout(this.timer)
    const flush = (): void => {
      this.timer = null
      const tmp = `${this.file}.tmp`
      try {
        writeFileSync(tmp, JSON.stringify(this.data), 'utf8')
        renameSync(tmp, this.file)
      } catch {
        /* 磁盘异常时忽略，下一次仍会尝试 */
      }
    }
    if (immediate) flush()
    else this.timer = setTimeout(flush, 400)
  }
}

interface CacheShape {
  movies: Record<string, MovieDetail>
  /** 影片库里有文件、但站点上确实搜不到的番号 → 记下时间戳，避免每次补齐都白打请求 */
  unmatched: Record<string, number>
}
interface FavShape {
  codes: string[]
}
interface TaskShape {
  tasks: DownloadTask[]
}

let settingsFile: JsonFile<Settings>
let cacheFile: JsonFile<CacheShape>
let favFile: JsonFile<FavShape>
let taskFile: JsonFile<TaskShape>

export function initStore(): void {
  settingsFile = new JsonFile<Settings>('settings.json', DEFAULT_SETTINGS, configDir())
  const cacheDir = resolveCacheDir(settingsFile.get())
  cacheFile = new JsonFile<CacheShape>('cache.json', { movies: {}, unmatched: {} }, cacheDir)
  favFile = new JsonFile<FavShape>('favorites.json', { codes: [] }, configDir())
  taskFile = new JsonFile<TaskShape>('tasks.json', { tasks: [] }, configDir())

  // 兼容旧版本：缓存曾与配置同目录
  const legacy = join(configDir(), 'cache.json')
  if (existsSync(legacy) && cacheFile.sizeOnDisk() === 0) {
    try {
      const old = JSON.parse(readFileSync(legacy, 'utf8')) as CacheShape
      if (old?.movies) cacheFile.set(old)
      rmSync(legacy, { force: true })
    } catch {
      /* 忽略 */
    }
  }

  // 缓存键从「番号原样」改成了 normCode（去掉分隔符）：站点对同一部片可能写
  // 010119-001 或 010119_001，键不统一就会重复入库、且匹配不上影片库里的文件
  const cache = cacheFile.get()
  if (Object.keys(cache.movies).some((k) => k !== normCode(k))) {
    const movies: Record<string, MovieDetail> = {}
    for (const m of Object.values(cache.movies)) movies[normCode(m.code)] = m
    const unmatched: Record<string, number> = {}
    for (const [k, v] of Object.entries(cache.unmatched ?? {})) unmatched[normCode(k)] = v
    cacheFile.set({ movies, unmatched })
    cacheFile.save(true)
  }

  // BitComet 登录要一个稳定的 client_id（当 PBKDF2 口令用），首次启动生成
  if (!getSettings().bc.clientId) {
    settingsFile.update({ bc: { ...getSettings().bc, clientId: randomUUID() } })
    settingsFile.save(true)
  }

  // 旧版本用 qBittorrent 记的任务，进度已经拿不回来了，归到影片库扫描那条路
  const tasks = taskFile.get().tasks
  if (tasks.some((t) => (t.source as string) === 'qbittorrent')) {
    taskFile.set({
      tasks: tasks.map((t) =>
        (t.source as string) === 'qbittorrent'
          ? { ...t, source: 'external' as const, state: 'external', error: undefined }
          : t
      )
    })
  }
}

export function getSettings(): Settings {
  const s = settingsFile.get()
  // 深合并 bc，避免旧版本配置缺字段
  return { ...DEFAULT_SETTINGS, ...s, bc: { ...DEFAULT_SETTINGS.bc, ...s.bc } }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const before = getSettings()
  settingsFile.update(patch)
  settingsFile.save(true)
  if (patch.cacheDir !== undefined && patch.cacheDir !== before.cacheDir) {
    cacheFile.relocate(resolveCacheDir(getSettings()), true)
  }
  return getSettings()
}

export function cacheInfo(): { dir: string; file: string; bytes: number; movies: number } {
  return {
    dir: resolveCacheDir(),
    file: cacheFile.path(),
    bytes: cacheFile.sizeOnDisk(),
    movies: Object.keys(cacheFile.get().movies).length
  }
}

export function getCachedMovie(code: string): MovieDetail | undefined {
  const m = cacheFile.get().movies[normCode(code)]
  if (!m) return undefined
  const ttl = getSettings().cacheTtlHours * 3600_000
  if (ttl > 0 && Date.now() - m.fetchedAt > ttl) return undefined
  return m
}

/** 忽略 TTL 直接取，用于离线浏览与本地组合筛选 */
export function peekCachedMovie(code: string): MovieDetail | undefined {
  return cacheFile.get().movies[normCode(code)]
}

export function putCachedMovie(movie: MovieDetail): void {
  const c = cacheFile.get()
  const code = normCode(movie.code)
  c.movies[code] = movie
  if (c.unmatched?.[code]) {
    const next = { ...c.unmatched }
    delete next[code]
    c.unmatched = next
  }
  cacheFile.set(c)
}

export function allCachedMovies(): MovieDetail[] {
  return Object.values(cacheFile.get().movies)
}

export function clearCache(): void {
  cacheFile.set({ movies: {}, unmatched: {} })
  cacheFile.save(true)
}

/** 站点上搜不到的番号表。补齐资料时默认跳过这些，避免重复白打请求 */
export function getUnmatched(): Record<string, number> {
  return cacheFile.get().unmatched ?? {}
}

export function markUnmatched(code: string): void {
  const c = cacheFile.get()
  c.unmatched = { ...(c.unmatched ?? {}), [normCode(code)]: Date.now() }
  cacheFile.set(c)
}

/** 番号后来抓到了，或用户要求重试时清掉标记 */
export function unmarkUnmatched(codes?: string[]): void {
  const c = cacheFile.get()
  if (!codes) {
    c.unmatched = {}
  } else {
    const next = { ...(c.unmatched ?? {}) }
    for (const code of codes) delete next[normCode(code)]
    c.unmatched = next
  }
  cacheFile.set(c)
}

export function getFavorites(): string[] {
  return favFile.get().codes
}

export function toggleFavorite(code: string): string[] {
  const codes = favFile.get().codes
  // 同一部片可能以不同写法进来（SONE-099 / SONE-099-C / 010119_001），
  // 按 isSameCode 找已有项，否则取消收藏会变成再加一条
  const hit = codes.find((c) => isSameCode(c, code))
  const next = hit ? codes.filter((c) => c !== hit) : [code.toUpperCase(), ...codes]
  favFile.set({ codes: next })
  return next
}

export function getTasks(): DownloadTask[] {
  return taskFile.get().tasks
}

export function saveTasks(tasks: DownloadTask[]): void {
  taskFile.set({ tasks })
}

export function flushAll(): void {
  settingsFile?.save(true)
  cacheFile?.save(true)
  favFile?.save(true)
  taskFile?.save(true)
}
