import type {
  CrawlProgress,
  GenreGroup,
  ListQuery,
  ListResult,
  MovieBrief,
  MovieDetail
} from '../shared/types'
import { normCode, pickByCode } from '../shared/code'
import { SiteError, fetchSite } from './net'
import {
  buildListPath,
  buildMagnetPath,
  parseDetail,
  parseGenres,
  parseList,
  parseMagnetParams,
  parseMagnets
} from './scraper'
import {
  getCachedMovie,
  getSettings,
  getUnmatched,
  markUnmatched,
  peekCachedMovie,
  putCachedMovie,
  unmarkUnmatched
} from './store'

/** 抓取一页列表，页码与站点一致 */
export async function fetchListPage(query: ListQuery): Promise<ListResult> {
  const path = buildListPath(query)
  const { html, url } = await fetchSite(path)
  return parseList(html, url, query)
}

/** 类别总览基本不变，抓一次在内存里放一天即可 */
const genreCache = new Map<string, { at: number; groups: GenreGroup[] }>()
const GENRE_TTL = 24 * 3600_000

/** 抓取类别总览页（有码 /genre，无码 /uncensored/genre） */
export async function fetchGenres(uncensored: boolean): Promise<GenreGroup[]> {
  const key = uncensored ? 'uncensored' : 'censored'
  const hit = genreCache.get(key)
  if (hit && Date.now() - hit.at < GENRE_TTL) return hit.groups

  const { html } = await fetchSite(uncensored ? '/uncensored/genre' : '/genre')
  const groups = parseGenres(html)
  if (!groups.length) throw new Error('类别页解析失败，站点结构可能有变化')
  genreCache.set(key, { at: Date.now(), groups })
  return groups
}

let floor = 100

/** 抓取影片详情 + 磁力（磁力需带详情页 Referer） */
export async function fetchMovie(
  codeOrUrl: string,
  opts: { force?: boolean } = {}
): Promise<MovieDetail> {
  const isUrl = /^https?:\/\//i.test(codeOrUrl)
  const code = (isUrl ? (codeOrUrl.split('/').pop() ?? '') : codeOrUrl).toUpperCase()

  if (!opts.force) {
    const cached = getCachedMovie(code)
    if (cached) return cached
  }

  const target = isUrl ? codeOrUrl : `/${code}`
  let html: string
  let url: string
  try {
    const res = await fetchSite(target)
    html = res.html
    url = res.url
  } catch (e) {
    // 网络失败时回落到过期缓存，保证离线可浏览
    const stale = peekCachedMovie(code)
    if (stale) return stale
    throw e
  }

  const detail = parseDetail(html, url)
  const params = parseMagnetParams(html)
  if (params) {
    try {
      floor = (floor % 900) + 100
      const magPath = buildMagnetPath(params, floor)
      const mag = await fetchSite(magPath, { referer: url, retries: 1 })
      detail.magnets = parseMagnets(mag.html)
    } catch {
      detail.magnets = []
    }
  }
  if (!detail.code) detail.code = code
  putCachedMovie(detail)
  return detail
}

type ProgressEmit = (p: CrawlProgress) => void

let cancelFlag = false
let progress: CrawlProgress = {
  running: false,
  kind: 'pages',
  fromPage: 0,
  toPage: 0,
  currentPage: 0,
  totalItems: 0,
  doneItems: 0,
  failedItems: 0,
  unmatched: [],
  message: ''
}

export function crawlProgress(): CrawlProgress {
  return progress
}

export function cancelCrawl(): void {
  cancelFlag = true
  progress = { ...progress, message: '正在停止…' }
}

/**
 * 批量抓取：按页码区间抓列表，再并发抓每部影片的详情与磁力入库。
 * 结束后本地组合筛选（导演 / 类别 / 演员）即可对这批数据生效。
 */
export async function bulkCrawl(
  query: ListQuery,
  fromPage: number,
  toPage: number,
  emit: ProgressEmit
): Promise<CrawlProgress> {
  if (progress.running) return progress
  cancelFlag = false
  progress = {
    running: true,
    kind: 'pages',
    fromPage,
    toPage,
    currentPage: fromPage,
    totalItems: 0,
    doneItems: 0,
    failedItems: 0,
    unmatched: [],
    message: '开始抓取…'
  }
  emit(progress)

  const concurrency = Math.max(1, Math.min(8, getSettings().concurrency))

  try {
    for (let page = fromPage; page <= toPage; page++) {
      if (cancelFlag) break
      progress = { ...progress, currentPage: page, message: `抓取第 ${page} 页列表…` }
      emit(progress)

      const list = await fetchListPage({ ...query, page })
      if (!list.items.length) {
        progress = { ...progress, message: `第 ${page} 页没有内容，停止` }
        emit(progress)
        break
      }
      progress = { ...progress, totalItems: progress.totalItems + list.items.length }
      emit(progress)

      const queue = [...list.items]
      const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length && !cancelFlag) {
          const item = queue.shift()
          if (!item) break
          try {
            await fetchMovie(item.detailUrl || item.code, { force: false })
            progress = {
              ...progress,
              doneItems: progress.doneItems + 1,
              message: `已入库 ${item.code}`
            }
          } catch (e) {
            const reason = e instanceof Error ? e.message : String(e)
            progress = {
              ...progress,
              failedItems: progress.failedItems + 1,
              message: `${item.code} 抓取失败：${reason}`
            }
          }
          emit(progress)
        }
      })
      await Promise.all(workers)

      if (!list.pagination.hasNext && page < toPage) {
        progress = { ...progress, message: `已到最后一页（第 ${page} 页）` }
        break
      }
    }
    progress = {
      ...progress,
      running: false,
      message: cancelFlag
        ? `已取消，共入库 ${progress.doneItems} 部`
        : `完成，共入库 ${progress.doneItems} 部${progress.failedItems ? `，失败 ${progress.failedItems} 部` : ''}`
    }
  } catch (e) {
    progress = {
      ...progress,
      running: false,
      message: `中断：${e instanceof Error ? e.message : String(e)}`
    }
  }
  emit(progress)
  return progress
}

function isNotFound(e: unknown): boolean {
  return e instanceof SiteError && /404/.test(e.message)
}

/**
 * 只知道番号时怎么拿到详情：
 *
 * 1. 直接怼详情页 `/{番号}` —— 绝大多数有码番号这一步就成了，只花一个请求。
 * 2. 404 的话按番号走搜索（先有码 `/search`，再无码 `/uncensored/search`），
 *    命中就抓它的详情页。番号大小写、分隔符差异都由 normCode() 抹平。
 *
 * 返回 null = 站点上确实没有这部（区别于抛异常的网络/限流失败，后者应当下次重试）。
 */
export async function resolveByCode(code: string): Promise<MovieDetail | null> {
  try {
    return await fetchMovie(code)
  } catch (e) {
    if (!isNotFound(e)) throw e
  }

  for (const kind of ['search', 'uncensored-search'] as const) {
    let items: MovieBrief[]
    try {
      items = (await fetchListPage({ kind, value: code, page: 1 })).items
    } catch (e) {
      if (isNotFound(e)) continue // 搜索无结果时站点也可能直接给 404
      throw e
    }
    const hit = pickByCode(items, code)
    if (hit) return await fetchMovie(hit.detailUrl || hit.code)
  }
  return null
}

/** 影片库里有文件、但本地缓存没有资料的番号（默认跳过已知搜不到的） */
export function codesNeedingMeta(
  libraryCodes: string[],
  opts: { includeUnmatched?: boolean } = {}
): { pending: string[]; skipped: string[] } {
  const unmatched = getUnmatched()
  const pending: string[] = []
  const skipped: string[] = []
  for (const raw of libraryCodes) {
    const code = raw.toUpperCase()
    if (peekCachedMovie(code)) continue
    // unmatched 与缓存一样按 normCode 存
    if (!opts.includeUnmatched && unmatched[normCode(code)]) skipped.push(code)
    else pending.push(code)
  }
  return { pending, skipped }
}

/**
 * 按番号把影片库里缺资料的影片抓进缓存。
 *
 * 「已下载影片」页是拿本地缓存做筛选的，所以硬盘上有文件但从没打开过详情页的影片
 * 在那里是看不见的 —— 这个函数就是补这个缺口。
 * 站点上搜不到的番号会记进 unmatched，下次默认跳过，不再白打请求。
 */
export async function fillLibraryMetadata(
  codes: string[],
  emit: ProgressEmit,
  opts: { retryUnmatched?: boolean } = {}
): Promise<CrawlProgress> {
  if (progress.running) return progress
  cancelFlag = false

  if (opts.retryUnmatched) unmarkUnmatched(codes)
  const { pending } = codesNeedingMeta(codes, { includeUnmatched: opts.retryUnmatched })

  progress = {
    running: pending.length > 0,
    kind: 'library',
    fromPage: 0,
    toPage: 0,
    currentPage: 0,
    totalItems: pending.length,
    doneItems: 0,
    failedItems: 0,
    unmatched: [],
    message: pending.length ? `准备补齐 ${pending.length} 个番号的资料…` : '影片库里的影片资料都是全的'
  }
  emit(progress)
  if (!pending.length) return progress

  const concurrency = Math.max(1, Math.min(8, getSettings().concurrency))
  const queue = [...pending]
  const missing: string[] = []

  try {
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length && !cancelFlag) {
        const code = queue.shift()
        if (!code) break
        try {
          const detail = await resolveByCode(code)
          if (detail) {
            progress = {
              ...progress,
              doneItems: progress.doneItems + 1,
              message: `已入库 ${detail.code}${normCode(detail.code) === normCode(code) ? '' : `（本地番号 ${code}）`}`
            }
          } else {
            markUnmatched(code)
            missing.push(code)
            progress = {
              ...progress,
              failedItems: progress.failedItems + 1,
              unmatched: [...missing],
              message: `${code} 站点上没找到`
            }
          }
        } catch (e) {
          // 网络/限流失败不记进 unmatched，下次还会重试
          progress = {
            ...progress,
            failedItems: progress.failedItems + 1,
            message: `${code} 抓取失败：${e instanceof Error ? e.message : String(e)}`
          }
        }
        emit(progress)
      }
    })
    await Promise.all(workers)

    const tail = missing.length ? `，${missing.length} 个番号站点上没有` : ''
    progress = {
      ...progress,
      running: false,
      unmatched: [...missing],
      message: cancelFlag
        ? `已停止，补齐 ${progress.doneItems} 部${tail}`
        : `补齐完成，新增 ${progress.doneItems} 部资料${tail}`
    }
  } catch (e) {
    progress = {
      ...progress,
      running: false,
      message: `中断：${e instanceof Error ? e.message : String(e)}`
    }
  }
  emit(progress)
  return progress
}
