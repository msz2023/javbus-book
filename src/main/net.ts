import { connect } from 'net'
import { Agent, ProxyAgent, request } from 'undici'
import type { Dispatcher } from 'undici'
import { getSettings, saveSettings } from './store'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
/** existmag=all 让磁力区块完整输出；age=verified 跳过年龄墙 */
const COOKIE = 'existmag=all; age=verified; dv=1'

/** 常见本地代理端口，用于「自动」模式探测 */
const PROBE_PORTS = [7897, 7890, 7891, 10809, 10808, 1080, 2080, 8889, 8118, 20171, 33210]

let cachedAgent: Dispatcher | null = null
let cachedKey = ''

function proxyUrlFromSettings(): string | null {
  const s = getSettings()
  if (s.proxyMode === 'off') return null
  return s.proxyUrl.trim() || null
}

function dispatcher(): Dispatcher {
  const url = proxyUrlFromSettings()
  const key = url ?? 'direct'
  if (cachedAgent && cachedKey === key) return cachedAgent
  cachedAgent?.close?.().catch(() => {})
  cachedAgent = url
    ? new ProxyAgent({ uri: url, connectTimeout: 8000, bodyTimeout: 30000, headersTimeout: 15000 })
    : new Agent({ connectTimeout: 8000, bodyTimeout: 30000, headersTimeout: 15000 })
  cachedKey = key
  return cachedAgent
}

/** 设置变更后强制重建连接池 */
export function resetNet(): void {
  cachedAgent?.close?.().catch(() => {})
  cachedAgent = null
  cachedKey = ''
}

/** 探测本机是否有可用的代理端口 */
export function probeProxyPort(): Promise<number | null> {
  return new Promise((resolve) => {
    let pending = PROBE_PORTS.length
    let found: number | null = null
    const finish = (): void => {
      if (--pending === 0) resolve(found)
    }
    for (const port of PROBE_PORTS) {
      const sock = connect({ host: '127.0.0.1', port })
      sock.setTimeout(800)
      sock.on('connect', () => {
        if (found === null || port < found) found = port
        sock.destroy()
        finish()
      })
      sock.on('error', () => finish())
      sock.on('timeout', () => {
        sock.destroy()
        finish()
      })
    }
  })
}

/** 自动模式：启动时探测一次并写回设置 */
export async function autoConfigureProxy(): Promise<void> {
  const s = getSettings()
  if (s.proxyMode !== 'auto') return
  const port = await probeProxyPort()
  if (port) {
    const url = `http://127.0.0.1:${port}`
    if (url !== s.proxyUrl) {
      saveSettings({ proxyUrl: url })
      resetNet()
    }
  }
}

/** 简易并发闸门，避免对站点造成压力 */
class Gate {
  private active = 0
  private queue: (() => void)[] = []
  constructor(private limit: number) {}
  setLimit(n: number): void {
    this.limit = Math.max(1, n)
    this.drain()
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.queue.push(r))
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.drain()
    }
  }
  private drain(): void {
    while (this.active < this.limit && this.queue.length) this.queue.shift()!()
  }
}

const gate = new Gate(3)
export function setConcurrency(n: number): void {
  gate.setLimit(n)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * 全局节流。站点会对过快的请求返回 429（实测阈值在 2.5~4 请求/秒之间，
 * 响应头 Retry-After 为 7~8 秒），所以这里用「最小请求间隔 + 全局冷却」来限速：
 *   - 每个请求领取一个时间片，片与片之间至少间隔 gap 毫秒
 *   - 一旦收到 429，把冷却时间写到全局，所有在飞的请求都会顺延
 */
const DEFAULT_GAP_MS = 420
let nextSlot = 0
let cooldownUntil = 0

async function acquireSlot(): Promise<void> {
  const gap = Math.max(0, getSettings().requestGapMs ?? DEFAULT_GAP_MS)
  const now = Date.now()
  const earliest = Math.max(now, nextSlot, cooldownUntil)
  nextSlot = earliest + gap
  const wait = earliest - now
  if (wait > 0) await sleep(wait)
}

function enterCooldown(retryAfterHeader: unknown): number {
  const seconds = Number(Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader)
  const wait = (Number.isFinite(seconds) && seconds > 0 ? seconds : 8) * 1000 + 400
  cooldownUntil = Math.max(cooldownUntil, Date.now() + wait)
  return Math.round(wait / 1000)
}

/** 距离限流解除还有多少毫秒（0 表示未被限流） */
export function cooldownRemaining(): number {
  return Math.max(0, cooldownUntil - Date.now())
}

export class SiteError extends Error {
  constructor(
    message: string,
    readonly detail?: string
  ) {
    super(message)
  }
}

interface FetchOpts {
  referer?: string
  /** 失败重试次数 */
  retries?: number
  /** 是否允许切换镜像域名 */
  allowMirrorFailover?: boolean
}

export interface SiteResponse {
  html: string
  /** 实际生效的绝对地址，用于解析相对链接 */
  url: string
  status: number
}

function mirrorList(): string[] {
  const s = getSettings()
  const active = s.activeMirror.replace(/\/$/, '')
  const rest = s.mirrors.map((m) => m.replace(/\/$/, '')).filter((m) => m && m !== active)
  return [active, ...rest]
}

/**
 * 抓取站点页面。
 * 注意：JavBus 对列表/详情页会返回 301/302，但响应体就是真实页面内容；
 * 一旦跟随跳转就会落到年龄验证页，因此这里必须禁用重定向并直接使用 3xx 的 body。
 */
export async function fetchSite(pathOrUrl: string, opts: FetchOpts = {}): Promise<SiteResponse> {
  const retries = opts.retries ?? 3
  const isAbsolute = /^https?:\/\//i.test(pathOrUrl)
  const bases = isAbsolute ? [''] : mirrorList()
  let lastErr: unknown = null

  for (const base of bases) {
    const url = isAbsolute ? pathOrUrl : base + (pathOrUrl.startsWith('/') ? '' : '/') + pathOrUrl
    for (let attempt = 0; attempt <= retries; attempt++) {
      let rateLimited = false
      try {
        const res = await gate.run(async () => {
          await acquireSlot()
          return request(url, {
            dispatcher: dispatcher(),
            maxRedirections: 0,
            headers: {
              'user-agent': UA,
              cookie: COOKIE,
              accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
              'accept-language': 'zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7',
              ...(opts.referer ? { referer: opts.referer } : {})
            }
          })
        })
        const html = await res.body.text()
        if (res.statusCode === 429) {
          rateLimited = true
          const seconds = enterCooldown(res.headers['retry-after'])
          throw new SiteError(`站点限流中（429），已自动降速并等待 ${seconds} 秒`)
        }
        if (res.statusCode === 404) throw new SiteError('页面不存在 (404)')
        if (res.statusCode >= 400) throw new SiteError(`站点返回 ${res.statusCode}`)
        if (/Age Verification|driver-verify/i.test(html.slice(0, 4000)) && !/movie-box|bigImage/.test(html)) {
          throw new SiteError('被年龄验证页拦截，请重试或更换镜像域名')
        }
        return { html, url, status: res.statusCode }
      } catch (e) {
        lastErr = e
        if (e instanceof SiteError && /404/.test(e.message)) throw e
        // 429 的等待已经由全局冷却承担，这里不再叠加退避
        if (attempt < retries && !rateLimited) await sleep(400 * (attempt + 1) ** 2)
      }
    }
    if (opts.allowMirrorFailover === false) break
  }

  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr)
  const proxy = proxyUrlFromSettings()
  throw new SiteError(
    proxy
      ? `无法连接站点，请检查代理 ${proxy} 是否可用`
      : '无法连接站点，当前未启用代理，请在设置中配置代理',
    detail
  )
}

export const siteHeaders = { UA, COOKIE }
