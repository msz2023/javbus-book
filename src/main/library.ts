import { shell } from 'electron'
import { readdirSync, statSync, watch, type FSWatcher } from 'fs'
import { extname, join } from 'path'
import { extractCode, normCode } from '../shared/code'
import type { LibraryEntry } from '../shared/types'
import { getSettings } from './store'

export { extractCode }

const VIDEO_EXT = new Set([
  '.mp4',
  '.mkv',
  '.avi',
  '.wmv',
  '.mov',
  '.ts',
  '.m4v',
  '.mpg',
  '.mpeg',
  '.rmvb',
  '.flv',
  '.iso',
  '.strm'
])

/** 忽略体积过小的样片/预览文件（< 50MB） */
const MIN_SIZE = 50 * 1024 * 1024



interface ScanFile {
  path: string
  size: number
  mtime: number
}

/** 键是 normCode(番号)，值里带上可读的原番号 —— 站点对同一部片的写法可能带下划线 */
const index = new Map<string, { code: string; files: ScanFile[] }>()
let watchers: FSWatcher[] = []
let scanning = false
let onChange: (() => void) | null = null
let debounce: NodeJS.Timeout | null = null

function walk(dir: string, depth: number, out: ScanFile[]): void {
  if (depth > 6) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === '$RECYCLE.BIN' || entry === 'System Volume Information')
      continue
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walk(full, depth + 1, out)
    } else if (VIDEO_EXT.has(extname(entry).toLowerCase()) && st.size >= MIN_SIZE) {
      out.push({ path: full, size: st.size, mtime: st.mtimeMs })
    }
  }
}

export function scanLibrary(): LibraryEntry[] {
  if (scanning) return snapshot()
  scanning = true
  try {
    const files: ScanFile[] = []
    for (const dir of getSettings().libraryDirs) walk(dir, 0, files)
    index.clear()
    for (const f of files) {
      const code = extractCode(f.path)
      if (!code) continue
      const key = normCode(code)
      const hit = index.get(key)
      if (hit) hit.files.push(f)
      else index.set(key, { code, files: [f] })
    }
    return snapshot()
  } finally {
    scanning = false
  }
}

/** 返回当前索引（不触发重新扫描） */
export function librarySnapshot(): LibraryEntry[] {
  return snapshot()
}

function snapshot(): LibraryEntry[] {
  return [...index.values()].map(({ code, files }) => ({
    code,
    files: files.map((f) => ({ path: f.path, size: f.size, mtime: f.mtime }))
  }))
}

export function isDownloaded(code: string): boolean {
  return index.has(normCode(code))
}

export function filesFor(code: string): ScanFile[] {
  return index.get(normCode(code))?.files ?? []
}

/** 番号对应的最大文件，用于「播放」 */
export function mainFileFor(code: string): string | null {
  const files = filesFor(code)
  if (!files.length) return null
  return [...files].sort((a, b) => b.size - a.size)[0].path
}

export function watchLibrary(cb: () => void): void {
  onChange = cb
  restartWatchers()
}

export function restartWatchers(): void {
  for (const w of watchers) w.close()
  watchers = []
  for (const dir of getSettings().libraryDirs) {
    try {
      const w = watch(dir, { recursive: true }, () => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => {
          scanLibrary()
          onChange?.()
        }, 1500)
      })
      watchers.push(w)
    } catch {
      /* 目录不可用时忽略 */
    }
  }
}

export function disposeWatchers(): void {
  for (const w of watchers) w.close()
  watchers = []
}

/** 调用本机默认播放器 */
export async function playFile(path: string): Promise<string> {
  return shell.openPath(path)
}

export function revealFile(path: string): void {
  shell.showItemInFolder(path)
}
