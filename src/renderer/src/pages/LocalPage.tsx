import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CrawlProgress, MovieBrief } from '../../../shared/types'
import type { Facet, LocalFilter, LocalFilterResult, MissingMeta } from '../../../preload/index'
import { MovieGrid } from '../components/MovieGrid'
import { TopBar } from '../components/TopBar'
import { useApp } from '../state'
import { IconRefresh, IconSpinner } from '../components/Icons'

type FacetKey = 'genres' | 'stars' | 'directors' | 'studios'

const FACET_TITLE: Record<FacetKey, string> = {
  genres: '類別',
  stars: '演員',
  directors: '導演',
  studios: '製作商'
}

const SORTS: { key: NonNullable<LocalFilter['sort']>; text: string }[] = [
  { key: 'date-desc', text: '发行日期 ↓' },
  { key: 'date-asc', text: '发行日期 ↑' },
  { key: 'added-desc', text: '入库时间 ↓' },
  { key: 'code', text: '番号' }
]

export function LocalPage({ preset }: { preset?: 'fav' | 'downloaded' }): JSX.Element {
  const { call, downloaded, favorites, crawl, settings, toast } = useApp()
  const [missing, setMissing] = useState<MissingMeta | null>(null)
  const autoFired = useRef(false)
  const [result, setResult] = useState<LocalFilterResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [sel, setSel] = useState<Record<FacetKey, string[]>>({
    genres: [],
    stars: [],
    directors: [],
    studios: []
  })
  const [onlyDownloaded, setOnlyDownloaded] = useState(preset === 'downloaded')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [sort, setSort] = useState<NonNullable<LocalFilter['sort']>>('date-desc')

  useEffect(() => {
    setOnlyDownloaded(preset === 'downloaded')
    setOnlyMissing(false)
    setSel({ genres: [], stars: [], directors: [], studios: [] })
  }, [preset])

  const filter = useMemo<LocalFilter>(
    () => ({
      keyword: keyword.trim() || undefined,
      genres: sel.genres,
      stars: sel.stars,
      directors: sel.directors,
      studios: sel.studios,
      onlyDownloaded,
      onlyMissing,
      favOnly: preset === 'fav',
      sort
    }),
    [keyword, sel, onlyDownloaded, onlyMissing, preset, sort]
  )

  const load = useCallback(async () => {
    setLoading(true)
    const res = await call(window.api.movies.localFilter(filter))
    setResult(res)
    setLoading(false)
  }, [call, filter])

  useEffect(() => {
    void load()
  }, [load, downloaded, favorites])

  const showFill = preset !== 'fav'
  const filling = crawl?.kind === 'library' && crawl.running

  const refreshMissing = useCallback(async () => {
    if (!showFill) return
    const res = await call(window.api.library.missing())
    if (res) setMissing(res)
  }, [call, showFill])

  useEffect(() => {
    void refreshMissing()
  }, [refreshMissing, downloaded])

  const fill = useCallback(
    async (retryUnmatched = false) => {
      await call(window.api.library.fill(undefined, retryUnmatched))
    },
    [call]
  )

  // 「若发现已下载中的，则按番号搜索并缓存」——进「已下载影片」页就自动补，可在设置里关掉。
  // 「本地筛选」页只给手动按钮，不自动打请求。
  useEffect(() => {
    if (preset !== 'downloaded' || autoFired.current) return
    if (!settings?.autoFillLibraryMeta) return
    if (!missing?.pending.length || crawl?.running) return
    autoFired.current = true
    void fill()
  }, [preset, settings?.autoFillLibraryMeta, missing, crawl?.running, fill])

  // 补齐跑完：刷新列表与缺口统计
  const wasFilling = useRef(false)
  useEffect(() => {
    if (wasFilling.current && !filling) {
      void load()
      void refreshMissing()
      if (crawl?.kind === 'library' && crawl.message) toast('info', crawl.message)
    }
    wasFilling.current = !!filling
    // crawl.message 只在结束时读一次，不进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filling])

  const items: MovieBrief[] = useMemo(
    () =>
      (result?.items ?? []).map((m) => ({
        code: m.code,
        title: m.title,
        cover: m.cover,
        date: m.date,
        tags: [
          ...(m.magnets.some((x) => x.hd) ? ['高清'] : []),
          ...(m.magnets.some((x) => x.subtitle) ? ['字幕'] : [])
        ],
        detailUrl: m.detailUrl
      })),
    [result]
  )

  const toggle = (key: FacetKey, name: string): void =>
    setSel((prev) => ({
      ...prev,
      [key]: prev[key].includes(name) ? prev[key].filter((n) => n !== name) : [...prev[key], name]
    }))

  const activeCount = Object.values(sel).reduce((n, arr) => n + arr.length, 0)
  const title =
    preset === 'fav' ? '我的收藏' : preset === 'downloaded' ? '已下载影片' : '本地筛选'

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <TopBar
        title={title}
        subtitle={
          result
            ? `命中 ${result.total} 部（本地缓存 ${result.items.length} 部可见）`
            : '正在读取本地缓存…'
        }
        onRefresh={() => void load()}
        refreshing={loading}
        showViews
      />

      <div className="flex min-h-0 flex-1">
        {/* 筛选面板 */}
        <div className="w-[232px] shrink-0 space-y-4 overflow-y-auto border-r border-white/5 px-3.5 py-4">
          <div>
            <label className="label">关键字</label>
            <input
              className="field"
              placeholder="番号 / 片名 / 演员"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          <div>
            <label className="label">排序</label>
            <select
              className="field"
              value={sort}
              onChange={(e) => setSort(e.target.value as NonNullable<LocalFilter['sort']>)}
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key} className="bg-ink-800">
                  {s.text}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="label">下载状态</label>
            <div className="flex gap-1.5">
              <button
                className={`chip flex-1 justify-center ${onlyDownloaded ? 'chip-on' : ''}`}
                onClick={() => {
                  setOnlyDownloaded((v) => !v)
                  setOnlyMissing(false)
                }}
              >
                已下载
              </button>
              <button
                className={`chip flex-1 justify-center ${onlyMissing ? 'chip-on' : ''}`}
                onClick={() => {
                  setOnlyMissing((v) => !v)
                  setOnlyDownloaded(false)
                }}
              >
                未下载
              </button>
            </div>
          </div>

          {activeCount > 0 && (
            <button
              className="btn-ghost w-full"
              onClick={() => setSel({ genres: [], stars: [], directors: [], studios: [] })}
            >
              <IconRefresh width={13} height={13} /> 清空 {activeCount} 个筛选
            </button>
          )}

          {(['stars', 'genres', 'directors', 'studios'] as FacetKey[]).map((key) => (
            <FacetBlock
              key={key}
              title={FACET_TITLE[key]}
              facets={result?.facets[key] ?? []}
              selected={sel[key]}
              onToggle={(name) => toggle(key, name)}
            />
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
          {showFill && (filling || !!missing?.pending.length || !!missing?.skipped.length) && (
            <FillBanner
              missing={missing}
              filling={!!filling}
              progress={crawl?.kind === 'library' ? crawl : null}
              onFill={() => void fill()}
              onRetry={() => void fill(true)}
              onStop={() => void call(window.api.crawl.cancel())}
            />
          )}
          <MovieGrid
            items={items}
            loading={loading}
            emptyText={
              preset === 'fav'
                ? '还没有收藏，去列表里点卡片右上角的心形收藏'
                : preset === 'downloaded'
                  ? downloaded.size === 0
                    ? '本地库里还没有识别到影片，请到「设置」添加影片目录'
                    : `影片库识别到 ${downloaded.size} 个番号，但它们还没有资料——点上方「补齐资料」按番号抓取`
                  : '本地缓存是空的。浏览影片详情或使用「批量抓取」即可入库'
            }
          />
        </div>
      </div>
    </div>
  )
}

/**
 * 硬盘上有文件、但本地缓存没有资料的影片在这个页面是看不见的（筛选是拿缓存做的），
 * 所以这里直接把缺口摆出来，并提供按番号补齐的入口。
 */
function FillBanner({
  missing,
  filling,
  progress,
  onFill,
  onRetry,
  onStop
}: {
  missing: MissingMeta | null
  filling: boolean
  progress: CrawlProgress | null
  onFill: () => void
  onRetry: () => void
  onStop: () => void
}): JSX.Element {
  const percent =
    progress && progress.totalItems > 0
      ? Math.round(((progress.doneItems + progress.failedItems) / progress.totalItems) * 100)
      : 0

  return (
    <div className="mb-4 rounded-xl border border-accent/25 bg-accent/[.07] px-4 py-3">
      {filling ? (
        <>
          <div className="flex items-center gap-2 text-[12px] text-slate-300">
            <span className="text-accent">
              <IconSpinner width={13} height={13} />
            </span>
            <span className="flex-1">
              正在按番号补齐资料 {progress ? `${progress.doneItems + progress.failedItems}/${progress.totalItems}` : ''}
            </span>
            <span className="text-slate-400">{percent}%</span>
            <button className="btn-ghost !py-1" onClick={onStop}>
              停止
            </button>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent-soft transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          {progress?.message && (
            <p className="mt-1.5 truncate text-[11px] text-slate-500">{progress.message}</p>
          )}
        </>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-[12px] leading-relaxed text-slate-300">
            {!!missing?.pending.length && (
              <p>
                影片库里有 <span className="font-semibold text-accent">{missing.pending.length}</span>{' '}
                部影片还没有资料，补齐后才会出现在这里。
              </p>
            )}
            {!!missing?.skipped.length && (
              <p className="text-[11px] text-slate-500">
                另有 {missing.skipped.length} 个番号站点上搜不到，已跳过：
                {missing.skipped.slice(0, 6).join('、')}
                {missing.skipped.length > 6 ? ` 等 ${missing.skipped.length} 个` : ''}
              </p>
            )}
          </div>
          {!!missing?.pending.length && (
            <button className="btn-primary shrink-0" onClick={onFill}>
              补齐 {missing.pending.length} 部资料
            </button>
          )}
          {!!missing?.skipped.length && (
            <button className="btn-ghost shrink-0" onClick={onRetry} title="连之前搜不到的番号一起重试">
              <IconRefresh width={13} height={13} /> 重试全部
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FacetBlock({
  title,
  facets,
  selected,
  onToggle
}: {
  title: string
  facets: Facet[]
  selected: string[]
  onToggle: (name: string) => void
}): JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  if (!facets.length) return null
  const shown = expanded ? facets.slice(0, 200) : facets.slice(0, 12)

  return (
    <div>
      <label className="label">
        {title} <span className="text-slate-600">({facets.length})</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((f) => (
          <button
            key={f.name}
            className={`chip !px-2 !py-0.5 !text-[11px] ${selected.includes(f.name) ? 'chip-on' : ''}`}
            onClick={() => onToggle(f.name)}
            title={`${f.name} · ${f.count} 部`}
          >
            {f.name}
            <span className="text-slate-500">{f.count}</span>
          </button>
        ))}
        {facets.length > 12 && (
          <button
            className="chip !px-2 !py-0.5 !text-[11px] text-slate-500"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '收起' : `+${facets.length - 12}`}
          </button>
        )}
      </div>
    </div>
  )
}
