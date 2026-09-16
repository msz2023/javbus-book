import { execFile, execFileSync } from 'child_process'
import { shell } from 'electron'
import { existsSync, readFileSync, statSync } from 'fs'
import { connect } from 'net'
import { dirname, join } from 'path'
import { Agent, request } from 'undici'
import type { BcFolder, BcPaths } from '../shared/types'
import type { BcTask, Json, XmlTask } from './bitcomet-proto'
import {
  ENDPOINTS,
  MIN_VERSION,
  encryptCredential,
  normalizeSummary,
  normalizeTask,
  num,
  parseDownloadsXml,
  pick,
  versionTooOld
} from './bitcomet-proto'
import { getSettings } from './store'

export type { BcTask, XmlTask } from './bitcomet-proto'
export { mergeTask } from './bitcomet-proto'

/**
 * BitComet 适配。两条路：
 *
 * 1. 远程接口（BitComet 2.18+ 的「远程下载」WebUI JSON API）——有实时进度、可暂停/删除。
 * 2. 命令行兜底：`BitComet.exe /url "magnet:?..."`，也就是注册表里 magnet 协议处理器
 *    用的那条命令。进度改从 BitComet 的 Downloads.xml 读，它是定期落盘的，所以有延迟。
 *
 * 协议细节（接口路径、请求体、登录加密）都在 ./bitcomet-proto.ts 里。
 * 注意：BitComet 跑在 127.0.0.1，必须用直连 Agent，不能走站点代理。
 */
const localAgent = new Agent({ connectTimeout: 3000, headersTimeout: 5000, bodyTimeout: 15000 })

/** 「自动探测」扫的候选端口。BitComet 的远程端口由用户自己设，没有固定默认值 */
const PROBE_PORTS = [1235, 8080, 8081, 8090, 6363, 9090, 8888]

export class BcError extends Error {}

let deviceToken: string | null = null
let tokenForUrl = ''
let serverVersion = ''

function base(): string {
  return getSettings().bc.url.replace(/\/+$/, '')
}

// ---------------------------------------------------------------- HTTP

async function post(path: string, body: Json, token?: string | null): Promise<Json> {
  const res = await request(base() + path, {
    dispatcher: localAgent,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'client-type': 'BitComet WebUI',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  const text = await res.body.text()
  let data: Json = {}
  try {
    data = text ? (JSON.parse(text) as Json) : {}
  } catch {
    throw new BcError(`BitComet 返回了无法解析的内容（HTTP ${res.statusCode}）`)
  }
  if (res.statusCode === 401) throw new BcError('UNAUTHORIZED')
  if (res.statusCode >= 400) {
    throw new BcError(data.error_message || data.error_code || `BitComet 返回 ${res.statusCode}`)
  }
  return data
}

/** 带一次自动重登的调用，对齐 401 会话过期 */
async function call(path: string, body: Json = {}, retry = true): Promise<Json> {
  await ensureAuth()
  try {
    return await post(path, body, deviceToken)
  } catch (e) {
    if (retry && e instanceof BcError && e.message === 'UNAUTHORIZED') {
      invalidateSession()
      return call(path, body, false)
    }
    throw e
  }
}

export async function login(): Promise<{ version: string; serverName: string }> {
  const { username, password, clientId } = getSettings().bc
  if (!clientId) throw new BcError('client_id 未初始化，请重启程序')

  const authentication = encryptCredential(JSON.stringify({ username, password }), clientId)

  let step1: Json
  try {
    step1 = await post(ENDPOINTS.login, { client_id: clientId, authentication })
  } catch (e) {
    if (e instanceof BcError) throw e
    throw new BcError(
      `连接不上 BitComet (${base()})，请确认已在「选项 → 远程下载」里开启远程访问且端口正确`
    )
  }

  if (String(step1.error_code).toUpperCase() === 'PASSWORD_ERROR') {
    throw new BcError('BitComet 账号或密码错误')
  }
  if (String(step1.error_code).toUpperCase() !== 'OK') {
    throw new BcError(`BitComet 登录失败：${step1.error_message || step1.error_code}`)
  }

  const version = String(step1.version ?? '')
  if (version && versionTooOld(version)) {
    throw new BcError(
      `BitComet ${version} 太旧，远程接口需要 ${MIN_VERSION.major}.${MIN_VERSION.minor} 以上；` +
        '可以改用「仅命令行」模式，或升级 BitComet'
    )
  }

  const step2 = await post(
    ENDPOINTS.deviceToken,
    {
      invite_token: step1.invite_token,
      device_id: clientId,
      device_name: 'JavBus Desktop',
      platform: 'webui'
    },
    step1.invite_token as string
  )
  if (!step2.device_token) {
    throw new BcError(`BitComet 换取 device_token 失败：${step2.error_message || step2.error_code}`)
  }

  deviceToken = String(step2.device_token)
  tokenForUrl = base()
  serverVersion = String(step2.version ?? version)
  return { version: serverVersion, serverName: String(step2.server_name ?? 'BitComet') }
}

async function ensureAuth(): Promise<void> {
  if (deviceToken && tokenForUrl === base()) return
  await login()
}

export function invalidateSession(): void {
  deviceToken = null
  tokenForUrl = ''
  serverVersion = ''
}

export async function testConnection(): Promise<{ version: string; serverName: string }> {
  invalidateSession()
  const info = await login()
  // 真跑一次业务接口，确认 token 可用
  await call(ENDPOINTS.taskList, { state_group: 'ALL', task_type: 'BT', start: 0, limit: 1 })
  return info
}

/** 探测本机哪个端口上开着 BitComet 远程接口。无凭据时它返回 401，也算命中 */
export async function probePorts(): Promise<string | null> {
  const alive = await Promise.all(
    PROBE_PORTS.map(
      (port) =>
        new Promise<number | null>((resolve) => {
          const sock = connect({ host: '127.0.0.1', port })
          sock.setTimeout(700)
          sock.on('connect', () => {
            sock.destroy()
            resolve(port)
          })
          sock.on('error', () => resolve(null))
          sock.on('timeout', () => {
            sock.destroy()
            resolve(null)
          })
        })
    )
  )

  for (const port of alive.filter((p): p is number => p !== null)) {
    try {
      const res = await request(`http://127.0.0.1:${port}${ENDPOINTS.taskList}`, {
        dispatcher: localAgent,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      })
      await res.body.text()
      if (res.statusCode === 200 || res.statusCode === 401) return `http://127.0.0.1:${port}`
    } catch {
      /* 端口开着但不是 BitComet，继续试下一个 */
    }
  }
  return null
}

// ---------------------------------------------------------------- 任务接口

export async function listTasks(): Promise<BcTask[]> {
  const data = await call(ENDPOINTS.taskList, {
    state_group: 'ALL',
    task_type: 'BT',
    tag_filter: '',
    sort_key: '',
    sort_order: '',
    keyword: '',
    start: 0,
    limit: 1000
  })
  const raw = Array.isArray(data.tasks) ? data.tasks : Array.isArray(data.movie_list) ? data.movie_list : []
  return raw.map((t: Json) => normalizeTask(t)).filter((t: BcTask | null): t is BcTask => t !== null)
}

/** 列表项里没带 infohash / 速度时，对单个任务补一次详情 */
export async function taskSummary(taskId: number): Promise<BcTask | null> {
  const data = await call(ENDPOINTS.taskSummary, { task_id: String(taskId) })
  return normalizeSummary(data, taskId)
}

// ---------------------------------------------------------------- 下载目录
//
// BitComet 2.20 的添加接口对 save_folder 卡得很死：字段不能省（省了报 save_folder
// missing），值必须**精确等于**「选项 → 下载目录」列表里的某一项 —— 列表内目录的
// 子目录也会被判 save_folder invalid。所以这里先把配置里的路径解析成列表内的合法值。

let folderCache: { folders: BcFolder[]; defaultDir: string } | null = null

/** 路径比较：Windows 不分大小写，忽略分隔符方向与末尾分隔符 */
function samePath(a: string, b: string): boolean {
  const norm = (p: string): string => p.replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/** BitComet 的下载目录列表（带默认目录），结果会缓存 */
export async function listFolders(force = false): Promise<{ folders: BcFolder[]; defaultDir: string }> {
  if (folderCache && !force) return folderCache
  const data = await call(ENDPOINTS.directories)
  const cfg = (data.directories_config ?? {}) as Json
  const list = (Array.isArray(cfg.dir_list) ? cfg.dir_list : []) as Json[]
  folderCache = {
    folders: list
      .map((d) => ({ path: String(d.path ?? ''), display: String(d.display ?? d.path ?? '') }))
      .filter((d) => !!d.path),
    defaultDir: String(cfg.default_dir ?? '')
  }
  return folderCache
}

/** 把目录加进 BitComet 的下载目录列表（等价于在它界面里添加一个下载目录） */
export async function addFolder(path: string): Promise<BcFolder[]> {
  const data = await call(ENDPOINTS.directoryAdd, { dir_path: path })
  if (data.error_code && String(data.error_code).toUpperCase() !== 'OK') {
    throw new BcError(`BitComet 添加下载目录失败：${data.error_message || data.error_code}`)
  }
  folderCache = null
  return (await listFolders(true)).folders
}

/**
 * 配置里的保存目录 → BitComet 能接受的值。
 * 留空用 BitComet 的默认目录；不在列表里就直接报清楚，别让它退化成一句 save_folder invalid。
 */
async function resolveSaveFolder(want: string): Promise<string> {
  let { folders, defaultDir } = await listFolders()

  if (!want.trim()) {
    if (defaultDir) return defaultDir
    if (folders.length) return folders[0].path
    throw new BcError('BitComet 里还没有配置任何下载目录，请先在它的「选项 → 下载目录」里加一个')
  }

  let hit = folders.find((f) => samePath(f.path, want))
  if (!hit) {
    // 可能是用户刚在 BitComet 里加过目录，缓存过期了，刷一次再看
    ;({ folders, defaultDir } = await listFolders(true))
    hit = folders.find((f) => samePath(f.path, want))
  }
  if (hit) return hit.path

  const known = folders.map((f) => f.path).join('、') || '（空）'
  throw new BcError(
    `保存目录「${want}」不在 BitComet 的下载目录列表里。BitComet 只接受列表内的目录，` +
      `子目录也不行。可以到设置页点「加入 BitComet」把它加进去，或改选已有的目录：${known}`
  )
}

export async function addMagnet(link: string, opts: { savePath?: string } = {}): Promise<void> {
  const saveFolder = await resolveSaveFolder(opts.savePath || getSettings().bc.savePath || '')
  const data = await call(ENDPOINTS.addTorrentLinks, {
    torrent_links: link,
    save_folder: saveFolder,
    start_later: false
  })
  if (data.error_code && String(data.error_code).toUpperCase() !== 'OK') {
    throw new BcError(`BitComet 添加任务失败：${data.error_message || data.error_code}`)
  }
}

/** 含 delete / cleanup 的动作走另一个端点，这是 WebUI 自己的分流规则 */
export async function action(taskIds: number[], verb: string): Promise<void> {
  if (!taskIds.length) return
  const path = /delete|cleanup/.test(verb) ? ENDPOINTS.taskDelete : ENDPOINTS.taskAction
  const data = await call(path, { task_ids: taskIds.map(String), action: verb })
  if (data.error_code && String(data.error_code).toUpperCase() !== 'OK') {
    throw new BcError(`BitComet 操作失败：${data.error_message || data.error_code}`)
  }
}

export const startTasks = (ids: number[]): Promise<void> => action(ids, 'start')
export const stopTasks = (ids: number[]): Promise<void> => action(ids, 'stop')
export const deleteTasks = (ids: number[], deleteFiles: boolean): Promise<void> =>
  action(ids, deleteFiles ? 'delete_task_files' : 'delete_task')

/** 取任务内最大的视频文件相对路径，用于「播放」按钮 */
export async function largestFile(taskId: number): Promise<string | null> {
  try {
    const data = await call(ENDPOINTS.taskFiles, { task_id: String(taskId), start: 0, limit: 1000 })
    const files = (Array.isArray(data.files) ? data.files : Array.isArray(data.file_list) ? data.file_list : []) as Json[]
    const video = files
      .map((f) => ({
        name: String(pick(f, 'file_path', 'name', 'file_name') ?? ''),
        size: num(pick(f, 'file_size', 'size'))
      }))
      .filter((f) => /\.(mp4|mkv|avi|wmv|mov|ts|m4v|iso|rmvb|flv)$/i.test(f.name))
      .sort((a, b) => b.size - a.size)[0]
    return video?.name ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- 本地路径探测

/** 从 `reg query` 的输出里抠出 magnet 协议处理器的 exe 路径 */
function exeFromRegistry(): string | null {
  for (const root of ['HKCU', 'HKLM']) {
    try {
      const out = regQuery(`${root}\\SOFTWARE\\Classes\\magnet\\shell\\open\\command`)
      // 默认值那行形如：    (默认)    REG_SZ    "C:\...\BitComet.exe" /url "%1"
      const path = out.match(/REG_SZ\s+"([^"]+)"/)?.[1]
      if (path && /bitcomet\.exe$/i.test(path) && existsSync(path)) return path
    } catch {
      /* 没这个键就试下一个 root */
    }
  }
  return null
}

/** 同步执行：只在探测时调一两次，且要在 addDownload 的同步分支里用 */
function regQuery(key: string): string {
  return execFileSync('reg', ['query', key, '/ve'], { encoding: 'latin1', timeout: 3000 })
}

export function resolveExePath(): string | null {
  const manual = getSettings().bc.exePath?.trim()
  if (manual) return existsSync(manual) ? manual : null

  const fromReg = exeFromRegistry()
  if (fromReg) return fromReg

  for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
    if (!root) continue
    const p = join(root, 'BitComet', 'BitComet.exe')
    if (existsSync(p)) return p
  }
  return null
}

/**
 * Downloads.xml 的位置：便携版在 exe 同目录，安装版在 %APPDATA%\BitComet。
 * 两处都存在时取 mtime 更新的那个——一台机器上同时有便携版和安装版是常见情况，
 * 而 magnet 协议处理器指向的未必就是实际在用的那份数据。
 */
export function resolveDownloadsXml(): string | null {
  const manual = getSettings().bc.dataDir?.trim()
  if (manual) {
    const p = join(manual, 'Downloads.xml')
    return existsSync(p) ? p : null
  }

  const candidates: string[] = []
  const exe = resolveExePath()
  if (exe) candidates.push(join(dirname(exe), 'Downloads.xml'))
  if (process.env.APPDATA) candidates.push(join(process.env.APPDATA, 'BitComet', 'Downloads.xml'))

  let best: { path: string; mtime: number } | null = null
  for (const p of candidates) {
    try {
      const mtime = statSync(p).mtimeMs
      if (!best || mtime > best.mtime) best = { path: p, mtime }
    } catch {
      /* 不存在就跳过 */
    }
  }
  return best?.path ?? null
}

export function detectPaths(): BcPaths {
  return { exePath: resolveExePath(), downloadsXml: resolveDownloadsXml() }
}

/**
 * 拉起本机 BitComet。带 magnet 就是加任务（和注册表里 magnet 处理器同一条命令），
 * 不带参数就是单纯把主界面唤到前台。
 */
export function launchExe(magnet?: string): Promise<void> {
  const exe = resolveExePath()
  if (!exe) {
    throw new BcError(
      '没找到 BitComet.exe，请在设置里手动指定路径（或确认 BitComet 已装好并关联了磁力链接）'
    )
  }
  return new Promise((resolve, reject) => {
    execFile(exe, magnet ? ['/url', magnet] : [], (err) => {
      // BitComet 会把任务交给已运行的实例然后立即退出，非零退出码不代表失败
      if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new BcError(`启动 BitComet 失败：${exe} 不可执行`))
      } else {
        resolve()
      }
    })
  })
}

/** 远程接口地址是不是指向本机——远程那台机器上的 exe 我们拉不起来 */
export function remoteIsLocal(): boolean {
  try {
    const host = new URL(getSettings().bc.url).hostname.toLowerCase()
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
  } catch {
    return false
  }
}

export type OpenTarget = 'auto' | 'exe' | 'webui'

/**
 * 「打开 BitComet」。本机装了就拉主界面，否则（比如远程接口指向局域网另一台机器）
 * 打开它的 WebUI。返回实际用的哪条路，好在界面上说清楚。
 */
export async function openBitComet(target: OpenTarget = 'auto'): Promise<'exe' | 'webui'> {
  const { url, mode } = getSettings().bc
  const exe = resolveExePath()

  if (target === 'exe' && !exe) {
    throw new BcError('本机没找到 BitComet.exe，可以在设置里手动指定路径')
  }
  if (target === 'exe' || (target === 'auto' && !!exe && (mode !== 'webui' || remoteIsLocal()))) {
    await launchExe()
    return 'exe'
  }
  if (!url.trim()) throw new BcError('还没填 BitComet 的远程地址')
  await shell.openExternal(url)
  return 'webui'
}

// ---------------------------------------------------------------- Downloads.xml

let xmlCache: { path: string; mtime: number; tasks: Map<string, XmlTask> } | null = null

/** 读 BitComet 的任务表。按 mtime 做缓存，文件没变就不重新解析 */
export function readDownloadsXml(): Map<string, XmlTask> {
  const path = resolveDownloadsXml()
  if (!path) return new Map()

  let mtime = 0
  try {
    mtime = statSync(path).mtimeMs
  } catch {
    return new Map()
  }
  if (xmlCache && xmlCache.path === path && xmlCache.mtime === mtime) return xmlCache.tasks

  try {
    const tasks = parseDownloadsXml(readFileSync(path, 'utf8'))
    xmlCache = { path, mtime, tasks }
    return tasks
  } catch {
    // 正好撞上 BitComet 写盘写到一半，用上一次的结果顶一轮
    return xmlCache?.tasks ?? new Map()
  }
}

export function serverVersionText(): string {
  return serverVersion
}
