import { shell } from 'electron'
import { join } from 'path'
import { extractCode } from '../shared/code'
import type { DownloadTask, Magnet } from '../shared/types'
import * as bc from './bitcomet'
import { isDownloaded, mainFileFor } from './library'
import { getSettings, getTasks, saveTasks } from './store'

type Emit = (tasks: DownloadTask[]) => void

let tasks: DownloadTask[] = []
let timer: NodeJS.Timeout | null = null
let emit: Emit = () => {}
let lastError = ''

/** Downloads.xml 没有速度字段，用上一次采样差分算 */
const samples = new Map<string, { downloaded: number; at: number }>()

export function initDownloads(emitter: Emit): void {
  emit = emitter
  tasks = getTasks()
  schedule()
}

function persist(): void {
  saveTasks(tasks)
  emit(tasks)
}

function schedule(): void {
  if (timer) return
  timer = setInterval(() => {
    void poll()
  }, 2000)
}

/**
 * 把磁力交给 BitComet。
 * 远程接口模式下连不上就自动落到命令行兜底，而不是直接报错卡住——BitComet 装了但没开
 * 远程下载是最常见的情况，这时候仍然应该能加任务。
 */
export async function addDownload(
  magnet: Magnet,
  code: string,
  opts: { forceExternal?: boolean; savePath?: string } = {}
): Promise<DownloadTask> {
  const existing = tasks.find((t) => t.infoHash === magnet.infoHash)
  const { mode } = getSettings().bc

  let source: DownloadTask['source'] = 'external'
  let note = ''

  if (opts.forceExternal || mode === 'off') {
    await shell.openExternal(magnet.link)
  } else if (mode === 'exe') {
    await bc.launchExe(magnet.link)
    source = 'bitcomet-exe'
  } else {
    try {
      await bc.addMagnet(magnet.link, { savePath: opts.savePath })
      source = 'bitcomet'
    } catch (e) {
      // 远程接口不可用 → 命令行兜底
      note = e instanceof Error ? e.message : String(e)
      await bc.launchExe(magnet.link)
      source = 'bitcomet-exe'
    }
  }

  const task: DownloadTask = existing ?? {
    id: `${magnet.infoHash}-${Date.now()}`,
    infoHash: magnet.infoHash,
    code: code.toUpperCase(),
    name: magnet.name,
    magnet: magnet.link,
    source,
    addedAt: Date.now(),
    progress: 0,
    dlspeed: 0,
    size: magnet.sizeBytes,
    eta: 0,
    state: 'queued',
    done: false
  }
  task.source = source
  task.state = source === 'external' ? 'external' : task.state || 'queued'
  task.error = note || undefined
  task.bcTaskId = source === 'bitcomet' ? task.bcTaskId : undefined
  if (!existing) tasks = [task, ...tasks]
  persist()
  return task
}

/** 没有下载器接口时，用本地库扫描结果兜底判断是否已完成 */
function reconcileExternal(): boolean {
  let changed = false
  for (const t of tasks) {
    if (t.source !== 'external' || t.done) continue
    if (isDownloaded(t.code)) {
      t.done = true
      t.progress = 1
      t.state = 'completed'
      t.savePath = mainFileFor(t.code) ?? t.savePath
      changed = true
    }
  }
  return changed
}

/** 命令行模式：进度来自 BitComet 定期落盘的 Downloads.xml */
function reconcileXml(list: DownloadTask[]): boolean {
  if (!list.length) return false
  const xml = bc.readDownloadsXml()
  const now = Date.now()
  let changed = false

  for (const task of list) {
    const info = xml.get(task.infoHash)
    if (!info) {
      // XML 里查不到（用户手动删了任务），退回影片库扫描判断
      if (!task.done && isDownloaded(task.code)) {
        Object.assign(task, {
          done: true,
          progress: 1,
          state: 'completed',
          savePath: mainFileFor(task.code) ?? task.savePath
        })
        changed = true
      }
      continue
    }

    const prev = samples.get(task.infoHash)
    let dlspeed = task.dlspeed
    if (prev && info.downloaded > prev.downloaded) {
      const secs = (now - prev.at) / 1000
      if (secs >= 1) dlspeed = Math.round((info.downloaded - prev.downloaded) / secs)
    } else if (prev && info.downloaded === prev.downloaded && now - prev.at > 15_000) {
      dlspeed = 0
    }
    if (!prev || info.downloaded !== prev.downloaded) {
      samples.set(task.infoHash, { downloaded: info.downloaded, at: now })
    }

    const remaining = Math.max(0, info.size - info.downloaded)
    const next = {
      progress: info.progress,
      size: info.size || task.size,
      downloaded: info.downloaded,
      dlspeed: info.done ? 0 : dlspeed,
      eta: info.done || dlspeed <= 0 ? 8640000 : Math.round(remaining / dlspeed),
      state: info.done ? 'completed' : info.size > 0 ? 'downloading' : 'metaDL',
      savePath: info.savePath || task.savePath,
      done: info.done,
      name: task.name || info.name
    }
    if (
      task.progress !== next.progress ||
      task.state !== next.state ||
      task.dlspeed !== next.dlspeed ||
      task.done !== next.done
    ) {
      Object.assign(task, next)
      changed = true
    }
  }
  return changed
}

/** 把远程任务的字段写进本地任务，返回是否有变化 */
function applyRemote(task: DownloadTask, info: bc.BcTask): boolean {
  const remaining = Math.max(0, info.size - info.downloaded)
  // BitComet 自己给的剩余时间最准；没给就用速度算
  const eta = info.done
    ? 8640000
    : info.eta > 0
      ? info.eta
      : info.dlspeed > 0
        ? Math.round(remaining / info.dlspeed)
        : 8640000

  const next: Partial<DownloadTask> = {
    source: 'bitcomet',
    bcTaskId: info.taskId,
    progress: info.progress,
    size: info.size || task.size,
    downloaded: info.downloaded,
    dlspeed: info.done ? 0 : info.dlspeed,
    upspeed: info.upspeed,
    health: info.health || undefined,
    eta,
    state: info.status,
    savePath: info.savePath || task.savePath,
    name: task.name || info.name,
    done: info.done,
    error: undefined
  }

  const dirty = (Object.keys(next) as (keyof DownloadTask)[]).some(
    (k) => task[k] !== next[k]
  )
  if (dirty) Object.assign(task, next)
  return dirty
}

/**
 * 远程接口模式：实时进度。
 *
 * 匹配一律走 infohash——BitComet 2.20 的列表项本身不带 infohash 字段，它藏在
 * task_guid 里（见 bitcomet-proto.hashFromGuid）。极老版本连 guid 都没有，才退回
 * 逐个拉 task/summary/get 补详情。
 */
async function reconcileWebui(): Promise<boolean> {
  const local = tasks.filter((t) => t.source !== 'external')
  let changed = false

  let remote: bc.BcTask[]
  try {
    remote = await bc.listTasks()
    lastError = ''
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg !== lastError) {
      lastError = msg
      for (const t of local) if (!t.done) t.error = msg
      return true
    }
    return false
  }

  const byHash = new Map<string, bc.BcTask>()
  const unmapped: bc.BcTask[] = []
  for (const r of remote) {
    if (r.infoHash) byHash.set(r.infoHash, r)
    else unmapped.push(r)
  }

  // guid 里也没有 infohash 的老版本：对还没建映射的任务补一次详情。
  // 合并要用 mergeTask，直接展开会让详情里的 0 覆盖掉列表里的真实进度。
  if (unmapped.length) {
    const mapped = new Set(local.map((t) => t.bcTaskId).filter(Boolean))
    for (const r of unmapped) {
      if (mapped.has(r.taskId)) continue
      const full = await bc.taskSummary(r.taskId).catch(() => null)
      if (full?.infoHash) byHash.set(full.infoHash, bc.mergeTask(r, full))
    }
  }

  const seen = new Set<string>()
  for (const task of local) {
    const info = byHash.get(task.infoHash)
    if (!info) continue
    seen.add(task.infoHash)
    changed = applyRemote(task, info) || changed
  }

  if (getSettings().bc.adoptRemote) changed = adoptRemote(byHash, seen) || changed
  return changed
}

/**
 * 把 BitComet 里存在、但本地没有记录的任务收进列表（标 adopted）。
 * 覆盖两种常见情况：在 BitComet 里手动加的任务，以及本地记录被清掉过的任务。
 * 它们从 BitComet 消失时也跟着移除，不留幽灵条目。
 */
function adoptRemote(byHash: Map<string, bc.BcTask>, matched: Set<string>): boolean {
  let changed = false

  for (const [hash, info] of byHash) {
    if (matched.has(hash) || tasks.some((t) => t.infoHash === hash)) continue
    // BitComet 给刚加的磁力起名叫 "magnet:XXX"，去掉前缀再认番号
    const name = info.name.replace(/^magnet:\s*/i, '').trim()
    const task: DownloadTask = {
      id: `${hash}-${info.taskId}`,
      infoHash: hash,
      code: extractCode(name) ?? '',
      name: name || hash.slice(0, 12),
      magnet: `magnet:?xt=urn:btih:${hash}`,
      source: 'bitcomet',
      adopted: true,
      addedAt: Date.now(),
      progress: 0,
      dlspeed: 0,
      size: 0,
      eta: 8640000,
      state: 'queued',
      done: false
    }
    applyRemote(task, info)
    tasks = [...tasks, task]
    changed = true
  }

  // BitComet 里已经没有了的收养任务，一起清掉
  const before = tasks.length
  tasks = tasks.filter((t) => !t.adopted || byHash.has(t.infoHash))
  return changed || tasks.length !== before
}

async function poll(): Promise<void> {
  let changed = reconcileExternal()
  const webui = getSettings().bc.mode === 'webui'

  if (webui) changed = (await reconcileWebui()) || changed

  // XML 兜底：命令行模式，以及远程接口里查不到（还没建立映射）的任务
  const xmlTargets = tasks.filter(
    (t) => t.source !== 'external' && !t.done && (!webui || !t.bcTaskId)
  )
  changed = reconcileXml(xmlTargets) || changed

  if (changed) persist()
}

export function listTasks(): DownloadTask[] {
  return tasks
}

export function bcLastError(): string {
  return lastError
}

/** 只有远程接口那条路能控制单个任务；命令行/外部下载器没有这种入口 */
function requireRemote(hash: string): DownloadTask {
  const t = tasks.find((x) => x.infoHash === hash)
  if (!t) throw new Error('任务不存在')
  if (t.source !== 'bitcomet' || !t.bcTaskId) {
    throw new Error('这个任务不是通过 BitComet 远程接口添加的，请到 BitComet 里操作')
  }
  return t
}

export async function pause(hash: string): Promise<void> {
  const t = requireRemote(hash)
  await bc.stopTasks([t.bcTaskId!])
  t.state = 'stopped'
  t.dlspeed = 0
  persist()
}

export async function resume(hash: string): Promise<void> {
  const t = requireRemote(hash)
  await bc.startTasks([t.bcTaskId!])
  t.state = 'downloading'
  persist()
}

export async function remove(hash: string, deleteFiles: boolean): Promise<void> {
  const task = tasks.find((t) => t.infoHash === hash)
  if (task?.source === 'bitcomet' && task.bcTaskId && getSettings().bc.mode === 'webui') {
    try {
      await bc.deleteTasks([task.bcTaskId], deleteFiles)
    } catch {
      /* BitComet 里可能已被手动删除，忽略 */
    }
  }
  tasks = tasks.filter((t) => t.infoHash !== hash)
  samples.delete(hash)
  persist()
}

export function clearFinished(): void {
  for (const t of tasks) if (t.done) samples.delete(t.infoHash)
  tasks = tasks.filter((t) => !t.done)
  persist()
}

/** 播放：优先本地库命中的文件，其次 BitComet 给出的保存路径 */
export async function playTask(hash: string): Promise<string | null> {
  const task = tasks.find((t) => t.infoHash === hash)
  if (!task) return null
  const local = mainFileFor(task.code)
  if (local) return local
  if (task.savePath) return task.savePath
  if (task.source === 'bitcomet' && task.bcTaskId && getSettings().bc.mode === 'webui') {
    const rel = await bc.largestFile(task.bcTaskId)
    if (rel) return rel.includes('\\') || rel.includes('/') ? rel : join(getSettings().bc.savePath, rel)
  }
  return null
}

export function disposeDownloads(): void {
  if (timer) clearInterval(timer)
  timer = null
}
