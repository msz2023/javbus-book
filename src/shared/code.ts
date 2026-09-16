/**
 * 从文件名/目录名提取番号（纯函数，主进程与校验脚本共用）。
 *
 * 覆盖的命名形态：
 *   SSIS-001 / ssis00001 / SSIS-001-C / ABF-377 [1080p] / [SONE-099]
 *   300MIUM-899 / 259LUXU-1234 / 200GANA-2712  ← 带数字前缀的厂牌，站点番号本身就含前缀
 *   FC2-PPV-1234567 / FC2PPV-1234567
 *   HEYZO-2345
 *   010119-001（加勒比、一本道等按日期编号的无码片）
 */
export function extractCode(fileName: string): string | null {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName
  const name = base
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .toUpperCase()
    .replace(/[_\s]+/g, '-')

  const fc2 = name.match(/FC2[-]?(?:PPV[-]?)?(\d{5,8})/)
  if (fc2) return `FC2-PPV-${fc2[1]}`

  const heyzo = name.match(/HEYZO-?(\d{3,5})/)
  if (heyzo) return `HEYZO-${heyzo[1]}`

  // 带数字前缀的厂牌：300MIUM-899、259LUXU-1234
  const prefixed = name.match(/(?<![0-9A-Z])(\d{2,4}[A-Z]{2,6})-?(\d{2,5})(?![0-9])/)
  if (prefixed) return `${prefixed[1]}-${normalizeNumber(prefixed[2])}`

  // 日期式编号：010119-001
  const dated = name.match(/(?<![0-9A-Z])(\d{6})-(\d{2,3})(?![0-9])/)
  if (dated) return `${dated[1]}-${dated[2]}`

  // 标准番号：字母 2~6 位 + 数字 2~5 位
  const std = name.match(/(?<![0-9A-Z])([A-Z]{2,6})-?(\d{2,5})(?![0-9])/)
  if (std && !NON_LABEL.has(std[1])) return `${std[1]}-${normalizeNumber(std[2])}`

  return null
}

/** 番号比较用：去掉横线、空格等分隔符，抹平大小写 */
export function normCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * 番号是否指同一部片（收藏、任务等按番号配对的地方用）。
 *
 * 只比 normCode 不够：站点上同一部片的番号可能多出后缀（本地是 SONE-099，
 * 站点详情是 SONE-099-C），收藏时存的和缓存里的对不上，收藏页就会看不见。
 * 后缀必须以非数字开头，否则 ABC-1 会误配 ABC-12。
 */
export function isSameCode(a: string, b: string): boolean {
  const x = normCode(a)
  const y = normCode(b)
  if (x === y) return true
  const [short, long] = x.length < y.length ? [x, y] : [y, x]
  return long.startsWith(short) && !/^\d/.test(long.slice(short.length))
}

/**
 * 从一批影片里挑与目标番号最贴合的一条：先精确匹配，再退到前缀匹配。
 *
 * 前缀匹配是为了「本地番号 → 站点番号」多出后缀的情况（搜 SONE-099 命中 SONE-099-C 之类），
 * 反过来不成立，所以不做双向 startsWith。
 */
export function pickByCode<T extends { code: string }>(items: T[], code: string): T | null {
  const want = normCode(code)
  return (
    items.find((it) => normCode(it.code) === want) ??
    items.find((it) => normCode(it.code).startsWith(want)) ??
    null
  )
}

/** 常见的非番号英文词，避免把普通影片名误判成番号 */
const NON_LABEL = new Set([
  'MOVIE',
  'VIDEO',
  'PART',
  'DISC',
  'VOL',
  'CD',
  'EP',
  'S',
  'SEASON',
  'HD',
  'FHD',
  'UHD',
  'BDRIP',
  'WEBRIP',
  'X',
  'H',
  'AAC',
  'MP',
  'AVC',
  'HEVC'
])

/** ssis00001 → 001；SSIS-1 → 001 */
function normalizeNumber(num: string): string {
  const trimmed = num.length > 3 ? num.replace(/^0+(?=\d{3})/, '') : num
  return trimmed.padStart(3, '0')
}
