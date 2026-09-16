import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type {
  CrawlProgress,
  DownloadTask,
  ListQuery,
  Settings
} from '../../shared/types'
import type { Res } from '../../preload/index'
import { isSameCode } from '../../shared/code'

export type ViewMode = Settings['viewMode']

export type View =
  | { kind: 'browse'; query: ListQuery }
  | { kind: 'genres' }
  | { kind: 'local'; preset?: 'fav' | 'downloaded' }
  | { kind: 'downloads' }
  | { kind: 'settings' }

export interface ToastItem {
  id: number
  kind: 'ok' | 'err' | 'info'
  message: string
  detail?: string
}

interface AppState {
  view: View
  go: (view: View, opts?: { replace?: boolean }) => void
  back: () => void
  canBack: boolean

  settings: Settings | null
  reloadSettings: () => Promise<void>
  saveSettings: (patch: Partial<Settings>) => Promise<void>

  /** 浏览列表的呈现方式，读写都落到设置里 */
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  cardWidth: number

  favorites: string[]
  toggleFavorite: (code: string) => Promise<void>
  isFavorite: (code: string) => boolean

  downloaded: Set<string>
  refreshLibrary: () => Promise<void>

  tasks: DownloadTask[]
  taskByCode: Map<string, DownloadTask>
  refreshTasks: () => Promise<void>

  crawl: CrawlProgress | null

  toasts: ToastItem[]
  toast: (kind: ToastItem['kind'], message: string, detail?: string) => void
  dismissToast: (id: number) => void
  /** 统一处理 IPC 返回：失败时弹提示并返回 null */
  call: <T>(p: Promise<Res<T>>, okMessage?: string) => Promise<T | null>

  detailCode: string | null
  openDetail: (code: string) => void
  closeDetail: () => void
}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}

const HOME: View = { kind: 'browse', query: { kind: 'home', page: 1 } }

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [stack, setStack] = useState<View[]>([HOME])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [favorites, setFavorites] = useState<string[]>([])
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set())
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [crawl, setCrawl] = useState<CrawlProgress | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [detailCode, setDetailCode] = useState<string | null>(null)
  const toastId = useRef(1)

  const view = stack[stack.length - 1]

  const go = useCallback((next: View, opts?: { replace?: boolean }) => {
    setDetailCode(null)
    setStack((prev) => (opts?.replace ? [...prev.slice(0, -1), next] : [...prev, next]))
  }, [])

  const back = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (kind: ToastItem['kind'], message: string, detail?: string) => {
      const id = toastId.current++
      setToasts((prev) => [...prev.slice(-4), { id, kind, message, detail }])
      setTimeout(() => dismissToast(id), kind === 'err' ? 6000 : 2800)
    },
    [dismissToast]
  )

  const call = useCallback(
    async <T,>(p: Promise<Res<T>>, okMessage?: string): Promise<T | null> => {
      try {
        const res = await p
        if (!res.ok) {
          toast('err', res.error, res.detail)
          return null
        }
        if (okMessage) toast('ok', okMessage)
        return res.data
      } catch (e) {
        toast('err', e instanceof Error ? e.message : String(e))
        return null
      }
    },
    [toast]
  )

  const reloadSettings = useCallback(async () => {
    const s = await call(window.api.settings.get())
    if (s) setSettings(s)
  }, [call])

  // 界面缩放交给 Chromium 的 zoomFactor：图片、边框、字号一起缩，不会只放大字导致布局崩
  const uiScale = settings?.uiScale
  useEffect(() => {
    if (uiScale) void window.api.util.zoom(uiScale)
  }, [uiScale])

  const saveSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const s = await call(window.api.settings.save(patch))
      if (s) setSettings(s)
    },
    [call]
  )

  const refreshLibrary = useCallback(async () => {
    const payload = await call(window.api.library.scan())
    if (payload) setDownloaded(new Set(payload.codes))
  }, [call])

  const refreshTasks = useCallback(async () => {
    const list = await call(window.api.downloads.list())
    if (list) setTasks(list)
  }, [call])

  const toggleFavorite = useCallback(
    async (code: string) => {
      const next = await call(window.api.favorites.toggle(code))
      if (next) setFavorites(next)
    },
    [call]
  )

  useEffect(() => {
    void reloadSettings()
    void (async () => {
      const favs = await call(window.api.favorites.list())
      if (favs) setFavorites(favs)
      const lib = await call(window.api.library.list())
      if (lib) setDownloaded(new Set(lib.codes))
      await refreshTasks()
    })()

    const offDl = window.api.events.onDownloads((next) => setTasks(next))
    const offLib = window.api.events.onLibrary((payload) => setDownloaded(new Set(payload.codes)))
    const offCrawl = window.api.events.onCrawl((p) => setCrawl(p))
    // 收藏的影片资料在后台抓完了：换一个数组引用，触发「我的收藏」页重新加载
    const offFav = window.api.events.onFavHydrated(() => setFavorites((prev) => [...prev]))
    return () => {
      offDl()
      offLib()
      offCrawl()
      offFav()
    }
  }, [call, reloadSettings, refreshTasks])

  const taskByCode = useMemo(() => {
    const map = new Map<string, DownloadTask>()
    for (const t of tasks) {
      const prev = map.get(t.code)
      // 同一番号有多个任务时，优先显示未完成的那个
      if (!prev || (prev.done && !t.done) || (!prev.done && !t.done && t.progress > prev.progress)) {
        map.set(t.code, t)
      }
    }
    return map
  }, [tasks])

  const value: AppState = {
    view,
    go,
    back,
    canBack: stack.length > 1,
    settings,
    reloadSettings,
    saveSettings,
    viewMode: settings?.viewMode ?? 'cover',
    setViewMode: (mode) => {
      // 先本地生效再落盘，切换视图不该等一次 IPC 往返
      setSettings((prev) => (prev ? { ...prev, viewMode: mode } : prev))
      void window.api.settings.save({ viewMode: mode })
    },
    cardWidth: settings?.cardWidth || 300,
    favorites,
    toggleFavorite,
    isFavorite: (code) => favorites.some((c) => isSameCode(c, code)),
    downloaded,
    refreshLibrary,
    tasks,
    taskByCode,
    refreshTasks,
    crawl,
    toasts,
    toast,
    dismissToast,
    call,
    detailCode,
    openDetail: setDetailCode,
    closeDetail: () => setDetailCode(null)
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
