/**
 * BitComet 协议层：不碰 electron、不读设置，纯输入输出。
 * 抽出来是为了让 scripts/verify-bitcomet.ts 校验的就是实际跑的这份代码。
 *
 * 接口本身官方没有文档，这里的路径、请求体和登录加密算法都是从 BitComet 自带的 WebUI
 * 前端源码里读出来的（安装目录 webui\webui.zip 内的 assets/index-*.js）。
 */
import { load } from 'cheerio'
import { createCipheriv, createHmac, pbkdf2Sync, randomBytes } from 'crypto'

export const ENDPOINTS = {
  login: '/api/webui/login',
  deviceToken: '/api/device_token/get',
  taskList: '/api_v2/task_list/get',
  taskSummary: '/api/task/summary/get',
  taskAction: '/api_v2/tasks/action',
  taskDelete: '/api_v2/tasks/delete',
  addTorrentLinks: '/api/task/torrent_links/add',
  taskFiles: '/api/task/files/get',
  /** 下载目录列表（save_folder 必须精确等于其中一项） */
  directories: '/api/config/directories/get',
  directoryAdd: '/api/config/directories/add'
} as const

/** 远程接口需要的最低版本，低于此版本只有命令行那条路可用 */
export const MIN_VERSION = { major: 2, minor: 18 }

export function versionTooOld(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map((n) => parseInt(n, 10) || 0)
  if (major > MIN_VERSION.major) return false
  if (major < MIN_VERSION.major) return true
  return minor < MIN_VERSION.minor
}

/**
 * 复刻 WebUI 前端的 AES_Encrypt(json, client_id)：
 *   k1 = PBKDF2-SHA1(client_id, salt1, 10000, 32B)
 *   k2 = PBKDF2-SHA1(client_id, salt2, 10000, 32B)
 *   msg = 0x03 0x01 ‖ salt1(8) ‖ salt2(8) ‖ iv(16) ‖ AES-256-CBC/PKCS7(json, k1, iv)
 *   返回 base64(msg ‖ HMAC-SHA256(msg, k2))
 *
 * client_id 是明文一起发过去的，服务端拿它当 PBKDF2 的口令，所以只要两边一致即可。
 */
export function encryptCredential(json: string, clientId: string): string {
  const salt1 = randomBytes(8)
  const salt2 = randomBytes(8)
  const iv = randomBytes(16)
  const k1 = pbkdf2Sync(clientId, salt1, 10000, 32, 'sha1')
  const k2 = pbkdf2Sync(clientId, salt2, 10000, 32, 'sha1')

  const cipher = createCipheriv('aes-256-cbc', k1, iv)
  const ct = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])

  const msg = Buffer.concat([Buffer.from([0x03, 0x01]), salt1, salt2, iv, ct])
  const sig = createHmac('sha256', k2).update(msg).digest()
  return Buffer.concat([msg, sig]).toString('base64')
}

// ---------------------------------------------------------------- 字段归一

export interface Json {
  [k: string]: any
}

export interface BcTask {
  taskId: number
  infoHash: string
  name: string
  status: string
  size: number
  downloaded: number
  progress: number
  dlspeed: number
  savePath: string
  /** 上传速度，字节/秒 */
  upspeed: number
  /** BitComet 自己算的剩余时间（秒），0 = 未知 */
  eta: number
  /** 资源健康度，如 "200%"；没有就是空串 */
  health: string
  /** 已完成（BitComet 给了完成时间，或进度满） */
  done: boolean
}

/** 各版本字段名不一（2.20 是 infohash，早期是 info_hash），取值一律走别名列表 */
export function pick(obj: Json | undefined, ...keys: string[]): any {
  if (!obj) return undefined
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k]
  }
  return undefined
}

export function num(v: any): number {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

/** 合法的 40 位 hex（v1 infohash），全 0 视为「还没拿到元数据」 */
function cleanHash(v: unknown): string {
  const s = String(v ?? '').toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(s)) return ''
  return /^0+$/.test(s) ? '' : s
}

/**
 * BitComet 2.20 的 task_list **不带 infohash 字段**，但每项都有
 * `task_guid: "bt_<40位hex>"`，infohash 就在里面。不从这里取的话整张列表都匹配不上
 * 本地任务，界面上就是「BitComet 在下、客户端显示 0%」。
 */
export function hashFromGuid(guid: unknown): string {
  const m = String(guid ?? '').match(/([0-9a-fA-F]{40})/)
  return m ? cleanHash(m[1]) : ''
}

/** "0:35:48" / "1:02:03" → 秒；"∞"、"-" 等未知值返回 0 */
export function parseLeftTime(v: unknown): number {
  const parts = String(v ?? '').trim().split(':')
  if (parts.length < 2 || parts.some((p) => !/^\d+$/.test(p))) return 0
  return parts.reduce((acc, p) => acc * 60 + parseInt(p, 10), 0)
}

/** "12.5%" → 0.125；解析不出来返回 null（好和「确实是 0%」区分开） */
export function parsePercent(v: unknown): number | null {
  const m = String(v ?? '').match(/([\d.]+)\s*%/)
  return m ? Math.min(1, parseFloat(m[1]) / 100) : null
}

const DONE_STATUS = /^(seed|seeding|finish|finished|complete|completed|uploading|做种|已完成)$/i
const STOP_STATUS = /^(stop|stopped|pause|paused|suspend|suspended|已停止|已暂停)$/i

/**
 * BitComet 的状态字段很粗：task_list 只给 running/stopped，真正的细分状态
 * （Connecting / Downloading / Seeding）在 task_status 里。这里统一成界面用的一档。
 */
export function deriveState(status: string, size: number, done: boolean): string {
  if (done) return 'completed'
  const s = status.trim()
  if (STOP_STATUS.test(s)) return 'stopped'
  // 元数据还没拿到时 size 恒为 0，此时报「下载中 0%」会让人以为卡住了
  if (size <= 0) return 'metaDL'
  if (/^run(ning)?$/i.test(s) || !s || s === 'unknown') return 'downloading'
  return s.toLowerCase()
}

/**
 * 把 task_list 的一项、或 task/summary/get 的各段归一成 BcTask。
 * raw 是主数据（列表项 / task_status），detail 是 task_detail 那种静态信息。
 */
export function normalizeTask(raw: Json, detail?: Json): BcTask | null {
  const taskId = num(pick(raw, 'task_id', 'taskId')) || num(pick(detail, 'task_id', 'taskId'))
  if (!taskId) return null

  const size = num(pick(raw, 'total_size', 'selected_size', 'size')) || num(pick(detail, 'total_size', 'size'))
  const downloaded = num(pick(raw, 'selected_downloaded_size', 'downloaded_size', 'dl_size'))

  const permillage = pick(raw, 'permillage', 'download_permillage')
  const percentText = parsePercent(pick(raw, 'progress'))
  const progress =
    permillage !== undefined
      ? Math.min(1, num(permillage) / 1000)
      : percentText !== null
        ? percentText
        : size > 0
          ? Math.min(1, downloaded / size)
          : 0

  const status = String(pick(raw, 'status', 'state') ?? 'unknown')
  const done =
    progress >= 1 ||
    DONE_STATUS.test(status.trim()) ||
    !!String(pick(detail, 'finish_time') ?? '').trim()

  return {
    taskId,
    infoHash:
      cleanHash(pick(raw, 'infohash', 'info_hash')) ||
      cleanHash(pick(detail, 'infohash', 'info_hash')) ||
      hashFromGuid(pick(raw, 'task_guid')) ||
      hashFromGuid(pick(detail, 'task_guid')),
    name: String(pick(raw, 'task_name', 'name') ?? pick(detail, 'task_name', 'name') ?? ''),
    status: deriveState(status, size, done),
    size,
    downloaded,
    progress,
    // dl_speed 是 "852 KB/s" 这种文本，只有 download_rate 是数字，别混用
    dlspeed: num(pick(raw, 'download_rate', 'download_speed', 'dlspeed')),
    upspeed: num(pick(raw, 'upload_rate', 'upload_speed')),
    eta: parseLeftTime(pick(raw, 'left_time', 'eta')),
    health: String(pick(raw, 'health') ?? ''),
    done,
    savePath: String(
      pick(raw, 'save_path', 'save_folder') ?? pick(detail, 'save_path', 'save_folder') ?? ''
    )
  }
}

/**
 * task/summary/get 的返回归一。
 *
 * 坑：返回里的 `task_summary` 字段装的是速度曲线和分片位图（speed_list /
 * downloaded_pieces），**不是**任务概要；真正有用的是 `task`（同列表项结构）、
 * `task_status`（细分状态、剩余时间）和 `task_detail`（infohash、保存目录）。
 */
export function normalizeSummary(data: Json, taskId: number): BcTask | null {
  const task = (data.task ?? {}) as Json
  const status = (data.task_status ?? {}) as Json
  const detail = (data.task_detail ?? {}) as Json

  const fromList = normalizeTask({ task_id: taskId, ...task }, detail)
  const fromStatus = normalizeTask({ task_id: taskId, ...status }, detail)
  if (!fromList) return fromStatus
  if (!fromStatus) return fromList
  // 细分状态（Connecting/Downloading）比列表里的 running 有信息量，优先它
  return mergeTask(fromList, { ...fromStatus, status: status.status ? fromStatus.status : fromList.status })
}

/**
 * 合并两份同一任务的数据，逐字段取「更有信息量」的那个。
 * 直接用对象展开会让后来的 0 / 空串覆盖掉前面的真值——之前进度被清零就是这么来的。
 */
export function mergeTask(base: BcTask, extra: Partial<BcTask>): BcTask {
  const out = { ...base }
  for (const [k, v] of Object.entries(extra) as [keyof BcTask, any][]) {
    if (v === undefined || v === null) continue
    if (typeof v === 'number' && v === 0) continue
    if (typeof v === 'string' && (!v || v === 'unknown')) continue
    if (typeof v === 'boolean' && !v) continue
    ;(out as any)[k] = v
  }
  return out
}

// ---------------------------------------------------------------- Downloads.xml

export interface XmlTask {
  infoHash: string
  name: string
  size: number
  downloaded: number
  progress: number
  savePath: string
  done: boolean
}

/**
 * 解析 BitComet 的 Downloads.xml。相关属性（实测）：
 *   InfoHashHex               拿到元数据后的 infohash
 *   BctpInfoHash              刚加磁力、还没拿到元数据时只有这个（小写 hex）
 *   SelectedFileSize/Download 算进度用
 *   Left                      剩余字节，0 = 完成
 *   FinishDate                只有完成的任务才有这个属性
 *   SaveLocation              完整保存路径
 * 没有速度字段，速度由调用方按两次采样差分算。
 */
export function parseDownloadsXml(xml: string): Map<string, XmlTask> {
  const tasks = new Map<string, XmlTask>()
  const $ = load(xml, { xmlMode: true })

  $('Torrent').each((_i, el) => {
    const attr = (name: string): string => $(el).attr(name) ?? ''
    const infoHash = (attr('InfoHashHex') || attr('BctpInfoHash')).toLowerCase()
    if (!infoHash || /^0+$/.test(infoHash)) return

    const selectedSize = parseInt(attr('SelectedFileSize'), 10) || 0
    const downloaded = parseInt(attr('SelectedFileDownload'), 10) || 0
    const left = parseInt(attr('Left'), 10) || 0
    const size = selectedSize || parseInt(attr('Size'), 10) || 0
    const finished = !!attr('FinishDate') || (size > 0 && left === 0)

    tasks.set(infoHash, {
      infoHash,
      name: attr('ShowName') || attr('SaveName') || attr('BctpDispName'),
      size,
      downloaded,
      progress: finished ? 1 : selectedSize > 0 ? Math.min(1, downloaded / selectedSize) : 0,
      savePath: attr('SaveLocation'),
      done: finished
    })
  })

  return tasks
}
