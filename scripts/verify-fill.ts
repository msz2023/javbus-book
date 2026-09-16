/**
 * 「按番号补齐资料」校验脚本（开发用，不参与打包）。
 *
 * 验的是 crawler.resolveByCode 的策略：先怼详情页 /{番号}，404 再按番号搜索
 * （先有码 /search，再无码 /uncensored/search），用 pickByCode 从结果里挑。
 * 番号匹配那段（normCode / pickByCode）直接从 src/shared/code.ts 引，
 * 所以这里验的就是程序实际跑的那份逻辑；请求层用 undici 直连，绕开 electron 依赖。
 *
 *   npm run verify:fill                              # 默认扫 D:\Videos 里的番号
 *   LIB="D:\影片;E:\av" npm run verify:fill           # 指定影片目录
 *   CODES="IPZZ-692,NMSL-014" npm run verify:fill     # 只验这几个番号
 *   PROXY=http://127.0.0.1:7890 npm run verify:fill
 */
import { readdirSync, statSync } from 'fs'
import { extname, join } from 'path'
import { ProxyAgent, request } from 'undici'
import { extractCode, normCode, pickByCode } from '../src/shared/code'
import { buildListPath, parseDetail, parseList } from '../src/main/scraper'

const BASE = process.env.SITE ?? 'https://www.javbus.com'
const PROXY = process.env.PROXY ?? 'http://127.0.0.1:7897'
const agent = new ProxyAgent({ uri: PROXY, connectTimeout: 8000 })

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.avi', '.wmv', '.mov', '.ts', '.m4v', '.iso', '.strm'])
const MIN_SIZE = 50 * 1024 * 1024
const GAP_MS = Number(process.env.GAP ?? 420)

interface Fetched {
  html: string
  url: string
  status: number
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function get(path: string): Promise<Fetched> {
  await sleep(GAP_MS) // 站点约 2.5 请求/秒是安全线，别把它打出 429
  const url = /^https?:/.test(path) ? path : BASE + path
  const res = await request(url, {
    dispatcher: agent,
    maxRedirections: 0,
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      cookie: 'existmag=all; age=verified; dv=1'
    }
  })
  return { html: await res.body.text(), url, status: res.statusCode }
}

/** 扫影片目录，用与程序相同的 extractCode 取番号 */
function scanCodes(dirs: string[]): string[] {
  const codes = new Set<string>()
  const walk = (dir: string, depth: number): void => {
    if (depth > 6) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const full = join(dir, entry)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(full, depth + 1)
      else if (VIDEO_EXT.has(extname(entry).toLowerCase()) && st.size >= MIN_SIZE) {
        const code = extractCode(full)
        if (code) codes.add(code)
      }
    }
  }
  for (const d of dirs) walk(d, 0)
  return [...codes].sort()
}

type Outcome =
  | { kind: 'direct'; code: string; title: string }
  | { kind: 'search'; via: string; code: string; title: string }
  | { kind: 'none' }
  | { kind: 'error'; reason: string }

/** 与 crawler.resolveByCode 同一套策略 */
async function resolve(code: string): Promise<Outcome> {
  try {
    const res = await get(`/${code.toUpperCase()}`)
    if (res.status !== 404) {
      const detail = parseDetail(res.html, res.url)
      if (detail.code) return { kind: 'direct', code: detail.code, title: detail.title }
    }
  } catch (e) {
    return { kind: 'error', reason: e instanceof Error ? e.message : String(e) }
  }

  for (const kind of ['search', 'uncensored-search'] as const) {
    try {
      const q = { kind, value: code, page: 1 } as const
      const res = await get(buildListPath(q))
      if (res.status === 404) continue
      const hit = pickByCode(parseList(res.html, res.url, q).items, code)
      if (hit) return { kind: 'search', via: kind, code: hit.code, title: hit.title }
    } catch (e) {
      return { kind: 'error', reason: e instanceof Error ? e.message : String(e) }
    }
  }
  return { kind: 'none' }
}

function head(text: string): void {
  console.log(`\n${'─'.repeat(64)}\n${text}\n${'─'.repeat(64)}`)
}

async function main(): Promise<void> {
  const codes = process.env.CODES
    ? process.env.CODES.split(/[,;\s]+/).filter(Boolean)
    : scanCodes((process.env.LIB ?? 'D:\\Videos').split(';').filter(Boolean))

  head('① 番号匹配（离线，纯逻辑）')
  const cases: [string[], string, string | null][] = [
    [['SONE-099-C', 'SONE-100'], 'SONE-099', 'SONE-099-C'],
    [['IPZZ-692', 'IPZZ-6920'], 'IPZZ-692', 'IPZZ-692'],
    [['MEYD-941'], 'meyd-941', 'MEYD-941'],
    [['300MIUM-899'], '300MIUM-899', '300MIUM-899'],
    // 站点把加勒比/一本道这类日期番号写成下划线，本地文件名是横线
    [['010119_001'], '010119-001', '010119_001'],
    [['ABF-350'], 'ABF-377', null]
  ]
  let bad = 0
  for (const [pool, want, expect] of cases) {
    const got = pickByCode(
      pool.map((c) => ({ code: c })),
      want
    )
    const ok = (got?.code ?? null) === expect
    if (!ok) bad++
    console.log(`  ${ok ? '✅' : '❌'} pickByCode([${pool}], ${want}) → ${got?.code ?? 'null'}`)
  }
  console.log(`  normCode('meyd-941') = ${normCode('meyd-941')}`)

  head(`② 按番号解析（真实请求，${codes.length} 个番号，代理 ${PROXY}）`)
  if (!codes.length) {
    console.log('  影片目录里没扫到番号，用 LIB= 或 CODES= 指定')
    process.exit(bad === 0 ? 0 : 1)
  }

  const stat = { direct: 0, search: 0, none: 0, error: 0 }
  for (const code of codes) {
    const r = await resolve(code)
    stat[r.kind]++
    if (r.kind === 'direct') console.log(`  ✅ ${code.padEnd(14)} 详情页直连  ${r.code} · ${r.title.slice(0, 34)}`)
    else if (r.kind === 'search')
      console.log(`  ✅ ${code.padEnd(14)} ${r.via.padEnd(17)} ${r.code} · ${r.title.slice(0, 34)}`)
    else if (r.kind === 'none') console.log(`  ⚠️  ${code.padEnd(14)} 站点上没有（会记进 unmatched，下次跳过）`)
    else console.log(`  ❌ ${code.padEnd(14)} 出错：${r.reason}`)
  }

  head('结果')
  console.log(`  详情页直连命中 ${stat.direct} · 搜索兜底命中 ${stat.search} · 站点上没有 ${stat.none} · 出错 ${stat.error}`)
  console.log(`  番号匹配用例 ${bad === 0 ? '全部通过' : `${bad} 项未通过`}`)
  process.exit(bad === 0 && stat.error === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('校验失败：', e)
  process.exit(1)
})
