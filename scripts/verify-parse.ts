/**
 * 解析器校验脚本（开发用，不参与打包）。
 * 直接对站点发起真实请求，验证列表 / 详情 / 磁力三类解析是否正常。
 *
 *   npm run verify            # 使用默认代理 http://127.0.0.1:7897
 *   PROXY=http://127.0.0.1:7890 npm run verify
 */
import { ProxyAgent, request } from 'undici'
import {
  buildListPath,
  buildMagnetPath,
  parseDetail,
  parseList,
  parseMagnetParams,
  parseMagnets
} from '../src/main/scraper'

const BASE = process.env.SITE ?? 'https://www.javbus.com'
const PROXY = process.env.PROXY ?? 'http://127.0.0.1:7897'
const agent = new ProxyAgent({ uri: PROXY, connectTimeout: 8000 })

async function get(path: string, referer?: string): Promise<{ html: string; url: string }> {
  const url = /^https?:/.test(path) ? path : BASE + path
  const res = await request(url, {
    dispatcher: agent,
    maxRedirections: 0,
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      cookie: 'existmag=all; age=verified; dv=1',
      ...(referer ? { referer } : {})
    }
  })
  return { html: await res.body.text(), url }
}

let failures = 0
function check(label: string, ok: boolean, extra = ''): void {
  if (!ok) failures++
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${extra ? ' → ' + extra : ''}`)
}

async function main(): Promise<void> {
  console.log(`站点 ${BASE}  代理 ${PROXY}\n`)

  console.log('[1] 列表页 /page/2')
  const listPath = buildListPath({ kind: 'home', page: 2 })
  const list = await get(listPath)
  const parsed = parseList(list.html, list.url, { kind: 'home', page: 2 })
  check(`解析到 ${parsed.items.length} 条影片`, parsed.items.length >= 20)
  check('封面为绝对地址', /^https?:\/\/.+\.(jpg|png|webp)/i.test(parsed.items[0]?.cover ?? ''), parsed.items[0]?.cover)
  check('番号 / 日期齐全', !!parsed.items[0]?.code && /\d{4}-\d{2}-\d{2}/.test(parsed.items[0]?.date ?? ''), `${parsed.items[0]?.code} ${parsed.items[0]?.date}`)
  check('分页映射站点页码', parsed.pagination.current === 2 && parsed.pagination.hasNext, `pages=${parsed.pagination.pages.join(',')}`)

  console.log('\n[2] 搜索 /search/SSIS/1')
  const searchPath = buildListPath({ kind: 'search', value: 'SSIS', page: 1 })
  const search = await get(searchPath)
  const sres = parseList(search.html, search.url, { kind: 'search', value: 'SSIS', page: 1 })
  check(`搜索到 ${sres.items.length} 条结果`, sres.items.length > 0)

  console.log('\n[3] 详情页 /SSIS-001')
  const detailRes = await get('/SSIS-001')
  const detail = parseDetail(detailRes.html, detailRes.url)
  check('識別碼', detail.code === 'SSIS-001', detail.code)
  check('片名', detail.title.length > 4, detail.title.slice(0, 40))
  check('大封面', /_b\.(jpg|png)/i.test(detail.cover), detail.cover)
  check('發行日期', /\d{4}-\d{2}-\d{2}/.test(detail.date), detail.date)
  check('長度', /\d/.test(detail.length), detail.length)
  check('導演', detail.director?.name === '苺原', `${detail.director?.name} (${detail.director?.kind}/${detail.director?.id})`)
  check('製作商 / 發行商 / 系列', !!detail.studio && !!detail.label, `${detail.studio?.name} / ${detail.label?.name} / ${detail.series?.name ?? '-'}`)
  check(`類別 ${detail.genres.length} 个`, detail.genres.length > 3, detail.genres.map((g) => g.name).join(' '))
  check('演員', detail.stars.some((s) => s.name === '葵つかさ'), detail.stars.map((s) => `${s.name}${s.avatar ? '(有头像)' : ''}`).join(' '))
  check(`样品图 ${detail.samples.length} 张`, detail.samples.length > 0)

  console.log('\n[4] 磁力 AJAX')
  const params = parseMagnetParams(detailRes.html)
  check('取到 gid / uc / img', !!params, params ? `gid=${params.gid} uc=${params.uc}` : '')
  if (params) {
    const magPath = buildMagnetPath(params, 100 + (parsed.items.length % 800))
    const mag = await get(magPath, detailRes.url)
    const magnets = parseMagnets(mag.html)
    check(`解析到 ${magnets.length} 条磁力`, magnets.length > 0)
    const top = magnets[0]
    if (top) {
      check('磁链格式', top.link.startsWith('magnet:?xt=urn:btih:'), top.link.slice(0, 60))
      check('infoHash', /^[a-f0-9]{40}$/.test(top.infoHash), top.infoHash)
      check('体积解析', top.sizeBytes > 1024 ** 3, `${top.size} = ${top.sizeBytes}`)
      check('分享日期', /\d{4}-\d{2}-\d{2}/.test(top.shareDate), top.shareDate)
      console.log(
        '  前 3 条：\n' +
          magnets
            .slice(0, 3)
            .map((m) => `    ${m.name} | ${m.size} | ${m.shareDate} | ${m.hd ? '高清' : ''}${m.subtitle ? ' 字幕' : ''}`)
            .join('\n')
      )
    }
  }

  console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项未通过`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('校验失败：', e)
  process.exit(1)
})
