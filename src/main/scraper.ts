import * as cheerio from 'cheerio'
import type {
  GenreGroup,
  ListKind,
  ListQuery,
  ListResult,
  Magnet,
  MovieBrief,
  MovieDetail,
  NamedRef,
  Pagination
} from '../shared/types'

/** 站点页码 1:1 映射到界面分页器 */
export function buildListPath(q: ListQuery): string {
  const page = Math.max(1, q.page || 1)
  const v = q.value ?? ''
  switch (q.kind) {
    case 'home':
      return `/page/${page}`
    case 'uncensored':
      return `/uncensored/page/${page}`
    case 'genre':
      return `/genre/${v}/${page}`
    case 'uncensored-genre':
      return `/uncensored/genre/${v}/${page}`
    case 'star':
      return `/star/${v}/${page}`
    case 'uncensored-star':
      return `/uncensored/star/${v}/${page}`
    case 'director':
      return `/director/${v}/${page}`
    case 'studio':
      return `/studio/${v}/${page}`
    case 'label':
      return `/label/${v}/${page}`
    case 'series':
      return `/series/${v}/${page}`
    case 'search':
      return `/search/${encodeURIComponent(v)}/${page}`
    case 'uncensored-search':
      return `/uncensored/search/${encodeURIComponent(v)}/${page}`
    default:
      return `/page/${page}`
  }
}

function absolute(url: string | undefined, base: string): string {
  if (!url) return ''
  try {
    return new URL(url, base).toString()
  } catch {
    return url
  }
}

function refKind(href: string): NamedRef['kind'] | null {
  if (/\/genre\//.test(href)) return 'genre'
  if (/\/star\//.test(href)) return 'star'
  if (/\/director\//.test(href)) return 'director'
  if (/\/studio\//.test(href)) return 'studio'
  if (/\/label\//.test(href)) return 'label'
  if (/\/series\//.test(href)) return 'series'
  return null
}

function refFromHref(href: string, name: string, avatar?: string): NamedRef | null {
  const kind = refKind(href)
  if (!kind) return null
  const id = href.replace(/\/+$/, '').split('/').pop() ?? ''
  if (!id) return null
  return { kind, id, name: name.trim(), ...(avatar ? { avatar } : {}) }
}

function parsePagination(html: string, current: number): Pagination {
  const $ = cheerio.load(html)
  const nums = new Set<number>()
  $('ul.pagination li a').each((_, el) => {
    const t = $(el).text().trim()
    if (/^\d+$/.test(t)) nums.add(parseInt(t, 10))
  })
  const pages = [...nums].sort((a, b) => a - b)
  return {
    current,
    pages,
    hasPrev: current > 1,
    hasNext: $('ul.pagination a#next').length > 0,
    maxKnown: pages.length ? Math.max(...pages, current) : current
  }
}

export function parseList(html: string, baseUrl: string, query: ListQuery): ListResult {
  const $ = cheerio.load(html)
  const items: MovieBrief[] = []

  $('a.movie-box').each((_, el) => {
    const $el = $(el)
    const href = $el.attr('href') ?? ''
    const detailUrl = absolute(href, baseUrl)
    const $img = $el.find('.photo-frame img').first()
    const dates = $el.find('.photo-info date')
    const code = (dates.eq(0).text() || href.split('/').pop() || '').trim()
    const date = dates.eq(1).text().trim()
    const tags: string[] = []
    $el.find('.item-tag').children().each((__, t) => {
      const txt = $(t).text().trim()
      if (txt) tags.push(txt)
    })
    if (!code) return
    items.push({
      code,
      title: ($img.attr('title') || '').trim(),
      cover: absolute($img.attr('src'), baseUrl),
      date,
      tags,
      detailUrl
    })
  })

  const rawTitle = $('title').text().trim()
  const heading =
    $('.container h3').first().text().trim() ||
    rawTitle.replace(/\s*-\s*JavBus.*$/, '').trim() ||
    'JavBus'

  return {
    query,
    items,
    pagination: parsePagination(html, query.page),
    heading
  }
}

/** 详情页里嵌入的磁力接口参数 */
export interface MagnetParams {
  gid: string
  uc: string
  img: string
}

export function parseMagnetParams(html: string): MagnetParams | null {
  const gid = html.match(/var\s+gid\s*=\s*(\d+)/)
  const uc = html.match(/var\s+uc\s*=\s*(\d+)/)
  const img = html.match(/var\s+img\s*=\s*'([^']*)'/)
  if (!gid) return null
  return { gid: gid[1], uc: uc?.[1] ?? '0', img: img?.[1] ?? '' }
}

export function buildMagnetPath(p: MagnetParams, floor: number): string {
  const qs = new URLSearchParams({
    gid: p.gid,
    lang: 'zh',
    img: p.img,
    uc: p.uc,
    floor: String(floor)
  })
  return `/ajax/uncledatoolsbyajax.php?${qs.toString()}`
}

const SIZE_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4
}

export function parseSize(text: string): number {
  const m = text.trim().match(/([\d.]+)\s*(TB|GB|MB|KB|B)/i)
  if (!m) return 0
  return Math.round(parseFloat(m[1]) * (SIZE_UNITS[m[2].toUpperCase()] ?? 1))
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * 磁力里的 infohash 有两种写法：40 位 hex，或 32 位 base32。
 * BitComet 一律按 hex 报，所以 base32 的要转过来，不然任务永远匹配不上。
 */
export function magnetHash(link: string): string {
  const m = link.match(/btih:([a-z2-7]{32}|[a-f0-9]{40})/i)
  if (!m) return ''
  const raw = m[1]
  if (raw.length === 40) return raw.toLowerCase()

  let bits = 0
  let value = 0
  let hex = ''
  for (const ch of raw.toUpperCase()) {
    const idx = BASE32.indexOf(ch)
    if (idx < 0) return ''
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      hex += ((value >> bits) & 0xff).toString(16).padStart(2, '0')
    }
  }
  return hex
}

/** 解析磁力 AJAX 返回的 <tr> 片段 */
export function parseMagnets(fragment: string): Magnet[] {
  const $ = cheerio.load(`<table>${fragment}</table>`)
  const out: Magnet[] = []
  const seen = new Set<string>()

  $('tr').each((_, tr) => {
    const $tr = $(tr)
    const link = $tr.find('a[href^="magnet:"]').first().attr('href')
    if (!link) return
    const hash = magnetHash(link)
    if (!hash || seen.has(hash)) return
    seen.add(hash)

    const tds = $tr.find('td')
    const $first = tds.eq(0)
    const tagTexts: string[] = []
    $first.find('a.btn, .btn').each((__, b) => {
      const t = $(b).text().trim()
      if (t) tagTexts.push(t)
    })
    let name = $first.text().trim()
    for (const t of tagTexts) name = name.replace(t, '')
    name = name.replace(/\s+/g, ' ').trim()

    const sizeText = tds.eq(1).text().trim()
    out.push({
      name: name || `magnet:${hash.slice(0, 8)}`,
      link,
      infoHash: hash,
      size: sizeText,
      sizeBytes: parseSize(sizeText),
      shareDate: tds.eq(2).text().trim(),
      hd: tagTexts.some((t) => /高清|HD/i.test(t)),
      subtitle: tagTexts.some((t) => /字幕|subtitle/i.test(t))
    })
  })

  return out.sort((a, b) => b.sizeBytes - a.sizeBytes)
}

export function parseDetail(html: string, baseUrl: string): MovieDetail {
  const $ = cheerio.load(html)
  const $info = $('div.info').first()

  const rowValue = (label: string): string => {
    let value = ''
    $info.find('p').each((_, p) => {
      const $p = $(p)
      const header = $p.find('span.header').first().text().trim()
      if (header.replace(/:$/, '') === label) {
        const clone = $p.clone()
        clone.find('span.header').remove()
        value = clone.text().trim()
        return false
      }
      return undefined
    })
    return value
  }

  const rowRef = (label: string): NamedRef | undefined => {
    let ref: NamedRef | undefined
    $info.find('p').each((_, p) => {
      const $p = $(p)
      const header = $p.find('span.header').first().text().trim()
      if (header.replace(/:$/, '') === label) {
        const $a = $p.find('a').first()
        const href = $a.attr('href') ?? ''
        const built = refFromHref(href, $a.text())
        if (built) ref = built
        return false
      }
      return undefined
    })
    return ref
  }

  const genres: NamedRef[] = []
  $info.find('span.genre a[href*="/genre/"]').each((_, a) => {
    const $a = $(a)
    const ref = refFromHref($a.attr('href') ?? '', $a.text())
    if (ref && !genres.some((g) => g.id === ref.id)) genres.push(ref)
  })

  const stars: NamedRef[] = []
  const avatarByHref = new Map<string, string>()
  $('a.avatar-box').each((_, a) => {
    const $a = $(a)
    const href = $a.attr('href') ?? ''
    const src = $a.find('img').attr('src')
    if (href && src) avatarByHref.set(href.replace(/\/+$/, ''), absolute(src, baseUrl))
  })
  $('div.star-name a, span.genre a[href*="/star/"]').each((_, a) => {
    const $a = $(a)
    const href = ($a.attr('href') ?? '').replace(/\/+$/, '')
    const ref = refFromHref(href, $a.attr('title') || $a.text(), avatarByHref.get(href))
    if (ref && !stars.some((s) => s.id === ref.id)) stars.push(ref)
  })

  const samples: MovieDetail['samples'] = []
  $('#sample-waterfall a.sample-box').each((_, a) => {
    const $a = $(a)
    const full = absolute($a.attr('href'), baseUrl)
    const thumb = absolute($a.find('img').attr('src'), baseUrl) || full
    if (full) samples.push({ thumb, full })
  })

  const code =
    $info.find('p').first().find('span[style*="CC0000"]').text().trim() ||
    rowValue('識別碼') ||
    (baseUrl.split('/').pop() ?? '')

  const rawTitle = $('.container h3').first().text().trim() || $('h3').first().text().trim()
  const title = rawTitle.replace(new RegExp(`^${code}\\s*`, 'i'), '').trim() || rawTitle

  return {
    code: code.toUpperCase(),
    title,
    cover: absolute($('a.bigImage').attr('href') || $('a.bigImage img').attr('src'), baseUrl),
    date: rowValue('發行日期'),
    length: rowValue('長度'),
    director: rowRef('導演'),
    studio: rowRef('製作商'),
    label: rowRef('發行商'),
    series: rowRef('系列'),
    genres,
    stars,
    samples,
    magnets: [],
    detailUrl: baseUrl,
    uncensored: /\/uncensored\/genre\//.test(html),
    fetchedAt: Date.now()
  }
}

/**
 * 解析类别总览页（/genre 或 /uncensored/genre）：
 * 页面结构是若干 <h4>分组名</h4> 后跟一个 .genre-box，里面是该组的所有类别链接。
 */
export function parseGenres(html: string): GenreGroup[] {
  const $ = cheerio.load(html)
  const groups: GenreGroup[] = []

  $('h4').each((_, h4) => {
    const $h4 = $(h4)
    const name = $h4.text().trim()
    if (!name) return
    // 分组的类别链接在 h4 之后、下一个 h4 之前的兄弟节点里
    const items: GenreGroup['items'] = []
    $h4
      .nextUntil('h4')
      .find('a[href*="/genre/"]')
      .each((__, a) => {
        const $a = $(a)
        const href = ($a.attr('href') ?? '').replace(/\/+$/, '')
        const id = href.split('/').pop() ?? ''
        const label = ($a.attr('title') || $a.text()).trim()
        if (id && label && !items.some((it) => it.id === id)) items.push({ id, name: label })
      })
    if (items.length) groups.push({ name, items })
  })

  // 兜底：万一站点结构变了（没有 h4 分组），把页面里所有类别链接归成一组
  if (!groups.length) {
    const items: GenreGroup['items'] = []
    $('a[href*="/genre/"]').each((_, a) => {
      const $a = $(a)
      const href = ($a.attr('href') ?? '').replace(/\/+$/, '')
      const id = href.split('/').pop() ?? ''
      const label = ($a.attr('title') || $a.text()).trim()
      if (id && label && !items.some((it) => it.id === id)) items.push({ id, name: label })
    })
    if (items.length) groups.push({ name: '全部類別', items })
  }
  return groups
}

/** 从「女優」页解析演员信息（用于收藏/筛选面板的头像） */
export function parseStarInfo(html: string, baseUrl: string): { name: string; avatar: string } {
  const $ = cheerio.load(html)
  const $img = $('.avatar-box img, .photo-frame img').first()
  return {
    name: ($img.attr('title') || $('.container h3').first().text() || '').trim(),
    avatar: absolute($img.attr('src'), baseUrl)
  }
}

export const KIND_LABEL: Record<ListKind, string> = {
  home: '有码影片',
  uncensored: '无码影片',
  genre: '类别',
  'uncensored-genre': '无码类别',
  star: '演员',
  'uncensored-star': '无码演员',
  director: '导演',
  studio: '制作商',
  label: '发行商',
  series: '系列',
  search: '搜索',
  'uncensored-search': '无码搜索'
}
