/**
 * 类别标签校验脚本（开发用，不参与打包）。
 * 验证「类别总览页 → 按类别浏览影片」这条链路：
 *   /genre 与 /uncensored/genre 的分组解析，以及 /genre/<id>/1 的列表解析。
 *
 *   npm run verify:genre
 *   PROXY=http://127.0.0.1:7890 npm run verify:genre
 */
import { ProxyAgent, request } from 'undici'
import { buildListPath, parseGenres, parseList } from '../src/main/scraper'

const BASE = process.env.SITE ?? 'https://www.javbus.com'
const PROXY = process.env.PROXY ?? 'http://127.0.0.1:7897'
const agent = new ProxyAgent({ uri: PROXY, connectTimeout: 8000 })

async function get(path: string): Promise<{ html: string; url: string }> {
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
  return { html: await res.body.text(), url }
}

let failures = 0
function check(label: string, ok: boolean, extra = ''): void {
  if (!ok) failures++
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${extra ? ' → ' + extra : ''}`)
}

/** 抓一个类别总览页，校验分组，返回第一个标签 */
async function overview(
  unc: boolean
): Promise<{ id: string; name: string } | null> {
  const path = unc ? '/uncensored/genre' : '/genre'
  console.log(`\n[${unc ? '无码' : '有码'}] 类别总览 ${path}`)
  const { html } = await get(path)
  const groups = parseGenres(html)
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  check(`解析到 ${groups.length} 个分组 / ${total} 个标签`, groups.length > 0 && total > 20)
  check(
    '分组名与标签名非空',
    groups.every((g) => !!g.name && g.items.every((it) => !!it.name && !!it.id)),
    groups
      .slice(0, 3)
      .map((g) => `${g.name}(${g.items.length})`)
      .join(' ')
  )
  const first = groups[0]?.items[0]
  if (first) console.log(`     示例标签：${first.name} → id=${first.id}`)
  return first ?? null
}

async function main(): Promise<void> {
  console.log(`站点 ${BASE}  代理 ${PROXY}`)

  for (const unc of [false, true]) {
    const tag = await overview(unc)
    if (!tag) {
      check('拿到可用标签', false)
      continue
    }

    const kind = unc ? 'uncensored-genre' : 'genre'
    const query = { kind, value: tag.id, page: 1 } as const
    const path = buildListPath(query as never)
    console.log(`[${unc ? '无码' : '有码'}] 按类别浏览 ${path}`)
    const page = await get(path)
    const res = parseList(page.html, page.url, query as never)
    check(`「${tag.name}」列表解析到 ${res.items.length} 部`, res.items.length > 0)
    check(
      '影片番号 / 封面齐全',
      res.items.every((m) => !!m.code) && /^https?:/.test(res.items[0]?.cover ?? ''),
      `${res.items[0]?.code} ${res.items[0]?.cover}`
    )
    check(
      '分页信息可用',
      res.pagination.current === 1,
      `current=${res.pagination.current} hasNext=${res.pagination.hasNext}`
    )
  }

  console.log(failures ? `\n❌ ${failures} 项未通过` : '\n✅ 全部通过')
  process.exit(failures ? 1 : 0)
}

void main().catch((e) => {
  console.error('\n💥 请求失败：', (e as Error).message)
  console.error('   若是网络/代理问题，用 PROXY=http://127.0.0.1:<端口> 重试')
  process.exit(1)
})
