export function formatBytes(n: number): string {
  if (!n || n < 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)}${units[i]}`
}

export function formatSpeed(n: number): string {
  return n > 0 ? `${formatBytes(n)}/s` : '—'
}

export function formatEta(sec: number): string {
  if (!sec || sec <= 0 || sec >= 8640000) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h) return `${h}小时${m}分`
  if (m) return `${m}分${s}秒`
  return `${s}秒`
}

/** BitComet 的状态字符串大小写不统一，查表时统一转小写 */
const STATE_TEXT: Record<string, string> = {
  downloading: '下载中',
  running: '下载中',
  metadl: '获取元数据',
  stopped: '已暂停',
  paused: '已暂停',
  suspended: '已暂停',
  seeding: '做种中',
  uploading: '做种中',
  checking: '校验中',
  hashing: '校验中',
  connecting: '连接中',
  stalled: '等待做种者',
  finished: '已完成',
  completed: '已完成',
  error: '出错',
  failed: '出错',
  missingfiles: '文件丢失',
  moving: '移动中',
  queued: '已提交',
  waiting: '排队中',
  external: '已交给外部下载器',
  unknown: '未知'
}

export function stateText(state: string): string {
  return STATE_TEXT[state?.toLowerCase()] ?? state
}

/**
 * 站点上同一张封面有两个尺寸：
 *   缩略图 /pics/thumb/<id>.jpg     约 147×200，竖版，只有正面
 *   大封面 /pics/cover/<id>_b.jpg   约 800×538，横版，正反面完整
 *
 * 列表页给的是缩略图，放到 200px 以上的卡片里必然发虚，所以「完整图像」模式
 * 要自己换成大封面。反过来密排小图时用缩略图，省流量也省解码。
 */
export function coverUrl(url: string, want: 'cover' | 'thumb'): string {
  if (!url) return url
  if (want === 'cover') {
    return url.replace(/\/pics\/thumb\/([^/?#]+?)(\.[a-z]+)$/i, '/pics/cover/$1_b$2')
  }
  return url.replace(/\/pics\/cover\/([^/?#]+?)_b(\.[a-z]+)$/i, '/pics/thumb/$1$2')
}

/** 大封面是横版（含正反面），缩略图是竖版，卡片比例得跟着变 */
export const COVER_RATIO = '3 / 2'
export const THUMB_RATIO = '147 / 200'

export function formatPercent(p: number): string {
  const v = Math.max(0, Math.min(1, p)) * 100
  return `${v >= 99.95 ? '100' : v.toFixed(1)}%`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
