import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { normCode } from '../../../shared/code'
import type { Magnet, MovieDetail, NamedRef, OnlineSite } from '../../../shared/types'
import { formatBytes } from '../lib/format'
import { useApp } from '../state'
import {
  IconCheck,
  IconClose,
  IconCopy,
  IconDownload,
  IconExternal,
  IconFolder,
  IconHeart,
  IconMagnet,
  IconPlay,
  IconRefresh,
  IconSpinner
} from './Icons'
import { Lightbox } from './Lightbox'

export function DetailDrawer(): JSX.Element | null {
  const {
    detailCode,
    closeDetail,
    call,
    toast,
    go,
    downloaded,
    isFavorite,
    toggleFavorite,
    taskByCode,
    settings
  } = useApp()
  const [movie, setMovie] = useState<MovieDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null)
  const [adding, setAdding] = useState<string | null>(null)

  const load = useCallback(
    async (code: string, force = false) => {
      if (force) setRefreshing(true)
      else setLoading(true)
      const data = await call(window.api.movies.detail(code, force))
      setMovie(data)
      setLoading(false)
      setRefreshing(false)
    },
    [call]
  )

  useEffect(() => {
    if (!detailCode) {
      setMovie(null)
      return
    }
    void load(detailCode)
  }, [detailCode, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && detailCode && !lightbox) closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailCode, closeDetail, lightbox])

  if (!detailCode) return null

  const isDownloaded = movie ? downloaded.has(normCode(movie.code)) : false
  const task = movie ? taskByCode.get(movie.code.toUpperCase()) : undefined

  const openRef = (ref: NamedRef): void => {
    const kindMap: Record<NamedRef['kind'], 'genre' | 'star' | 'director' | 'studio' | 'label' | 'series'> =
      {
        genre: 'genre',
        star: 'star',
        director: 'director',
        studio: 'studio',
        label: 'label',
        series: 'series'
      }
    closeDetail()
    go({
      kind: 'browse',
      query: { kind: kindMap[ref.kind], value: ref.id, label: ref.name, page: 1 }
    })
  }

  const addMagnet = async (m: Magnet, forceExternal: boolean): Promise<void> => {
    if (!movie) return
    setAdding(m.infoHash + (forceExternal ? '-x' : ''))
    const res = await call(window.api.downloads.add(m, movie.code, forceExternal))
    setAdding(null)
    if (res) {
      if (res.source === 'external') toast('ok', '已交给本机默认下载工具')
      else if (res.source === 'bitcomet') toast('ok', '已加进 BitComet，可在「下载管理」看实时进度')
      else if (res.error) {
        // 远程接口不可用时自动降级了，把原因告诉用户
        toast('info', `已用命令行交给 BitComet（远程接口不可用：${res.error}）`)
      } else toast('ok', '已交给 BitComet，进度会稍有延迟')
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm" onClick={closeDetail}>
        <div
          className="flex h-full w-full max-w-[980px] animate-fade-up flex-col border-l border-white/10 bg-ink-900 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 顶栏 */}
          <div className="flex h-[54px] shrink-0 items-center gap-2 border-b border-white/5 px-4">
            <span className="font-mono text-[13px] font-bold tracking-wide text-accent-soft">
              {movie?.code ?? detailCode}
            </span>
            {isDownloaded && (
              <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] text-emerald-300">
                <IconCheck width={11} height={11} /> 本地已有
              </span>
            )}
            {task && !task.done && (
              <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[11px] text-accent-soft">
                下载中 {Math.round(task.progress * 100)}%
              </span>
            )}
            <div className="flex-1" />
            <button
              className={`${isDownloaded ? 'btn-ghost' : 'btn-primary'} h-8`}
              title="在程序内的播放窗口在线观看（默认源）"
              onClick={async () => {
                const url = await call(
                  window.api.online.open(movie?.code ?? detailCode, 'missav')
                )
                if (url) toast('ok', '已在播放窗口打开在线观看')
              }}
            >
              <IconPlay width={14} height={14} /> 在线看
            </button>
            {isDownloaded && (
              <button
                className="btn-primary h-8"
                onClick={async () => {
                  const p = await call(window.api.library.play(movie?.code ?? detailCode))
                  if (p) toast('ok', '已调用本机播放器')
                }}
              >
                <IconPlay width={14} height={14} /> 播放
              </button>
            )}
            <button
              className={`btn-ghost h-8 w-8 !px-0 ${isFavorite(detailCode) ? 'text-accent' : ''}`}
              title="收藏"
              onClick={() => void toggleFavorite(movie?.code ?? detailCode)}
            >
              <IconHeart />
            </button>
            <button
              className="btn-ghost h-8 w-8 !px-0"
              title="重新抓取"
              onClick={() => void load(detailCode, true)}
            >
              <IconRefresh className={refreshing ? 'animate-spin' : ''} />
            </button>
            {movie && (
              <button
                className="btn-ghost h-8 w-8 !px-0"
                title="在浏览器中打开原页面"
                onClick={() => void window.api.util.openUrl(movie.detailUrl)}
              >
                <IconExternal />
              </button>
            )}
            <button className="btn-ghost h-8 w-8 !px-0" title="关闭 (Esc)" onClick={closeDetail}>
              <IconClose />
            </button>
          </div>

          {loading || !movie ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-slate-500">
              <IconSpinner width={18} height={18} /> 正在抓取影片信息…
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* 封面 + 信息 */}
              <div className="flex flex-col gap-5 lg:flex-row">
                <button
                  className="group relative w-full shrink-0 overflow-hidden rounded-xl border border-white/10 lg:w-[420px]"
                  onClick={() => setLightbox({ images: [movie.cover], index: 0 })}
                >
                  <img
                    src={movie.cover}
                    alt={movie.code}
                    className="aspect-[3/2] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </button>

                <div className="min-w-0 flex-1 space-y-3">
                  <h2 className="text-[17px] font-semibold leading-relaxed text-white">
                    {movie.title}
                  </h2>

                  <div className="grid grid-cols-2 gap-y-2 text-[13px]">
                    <Meta label="識別碼" value={movie.code} mono />
                    <Meta label="發行日期" value={movie.date} />
                    <Meta label="長度" value={movie.length} />
                    <Meta
                      label="導演"
                      value={movie.director?.name}
                      onClick={movie.director ? () => openRef(movie.director!) : undefined}
                    />
                    <Meta
                      label="製作商"
                      value={movie.studio?.name}
                      onClick={movie.studio ? () => openRef(movie.studio!) : undefined}
                    />
                    <Meta
                      label="發行商"
                      value={movie.label?.name}
                      onClick={movie.label ? () => openRef(movie.label!) : undefined}
                    />
                    <Meta
                      label="系列"
                      value={movie.series?.name}
                      onClick={movie.series ? () => openRef(movie.series!) : undefined}
                    />
                  </div>

                  {!!movie.stars.length && (
                    <Section title={`演員 (${movie.stars.length})`}>
                      <div className="flex flex-wrap gap-2">
                        {movie.stars.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => openRef(s)}
                            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] py-1 pl-1 pr-3
                              transition-colors hover:border-accent/60 hover:bg-accent/10"
                          >
                            {s.avatar ? (
                              <img
                                src={s.avatar}
                                alt={s.name}
                                className="h-7 w-7 rounded-full object-cover"
                              />
                            ) : (
                              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-600 text-[10px]">
                                {s.name.slice(0, 1)}
                              </span>
                            )}
                            <span className="text-xs text-slate-200">{s.name}</span>
                          </button>
                        ))}
                      </div>
                    </Section>
                  )}

                  {!!movie.genres.length && (
                    <Section title={`類別 (${movie.genres.length})`}>
                      <div className="flex flex-wrap gap-1.5">
                        {movie.genres.map((g) => (
                          <button key={g.id} className="chip" onClick={() => openRef(g)}>
                            {g.name}
                          </button>
                        ))}
                      </div>
                    </Section>
                  )}
                </div>
              </div>

              {/* 样品图 */}
              {!!movie.samples.length && (
                <Section title={`样品图 (${movie.samples.length})`} className="mt-6">
                  <div className="grid grid-cols-5 gap-2">
                    {movie.samples.map((s, i) => (
                      <button
                        key={s.thumb + i}
                        onClick={() =>
                          setLightbox({ images: movie.samples.map((x) => x.full), index: i })
                        }
                        className="overflow-hidden rounded-lg border border-white/5 transition-all hover:border-accent/50"
                      >
                        <img
                          src={s.thumb}
                          loading="lazy"
                          alt=""
                          className="aspect-[3/2] w-full object-cover transition-transform duration-300 hover:scale-105"
                        />
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {/* 在线观看 */}
              <OnlineSection code={movie.code} />

              {/* 磁力 */}
              <Section
                title={`磁力連結 (${movie.magnets.length})`}
                className="mt-6"
                right={
                  settings?.bc.mode === 'webui' ? (
                    <span className="text-[11px] text-emerald-400">BitComet 远程接口</span>
                  ) : settings?.bc.mode === 'exe' ? (
                    <span className="text-[11px] text-sky-400">交给 BitComet（命令行）</span>
                  ) : (
                    <span className="text-[11px] text-slate-500">将交给系统默认下载工具</span>
                  )
                }
              >
                {!movie.magnets.length ? (
                  <p className="rounded-lg border border-dashed border-white/10 py-6 text-center text-xs text-slate-500">
                    暫時沒有磁力連結
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-white/5">
                    <table className="w-full text-[12px]">
                      <thead className="bg-white/[.03] text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">名稱</th>
                          <th className="w-20 px-2 py-2 text-right font-medium">大小</th>
                          <th className="w-24 px-2 py-2 text-center font-medium">分享日期</th>
                          <th className="w-[176px] px-2 py-2 text-center font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movie.magnets.map((m) => (
                          <tr
                            key={m.infoHash}
                            className="border-t border-white/5 transition-colors hover:bg-white/[.03]"
                          >
                            <td className="max-w-0 px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-slate-300" title={m.name}>
                                  {m.name}
                                </span>
                                {m.hd && (
                                  <span className="shrink-0 rounded bg-sky-500/20 px-1 text-[10px] text-sky-300">
                                    高清
                                  </span>
                                )}
                                {m.subtitle && (
                                  <span className="shrink-0 rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">
                                    字幕
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-slate-400">
                              {m.size || formatBytes(m.sizeBytes)}
                            </td>
                            <td className="px-2 py-2 text-center text-slate-500">{m.shareDate}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  className="btn-primary h-7 !px-2"
                                  title={
                                    settings?.bc.mode === 'off'
                                      ? '交给系统默认下载工具'
                                      : '用 BitComet 下载'
                                  }
                                  disabled={adding === m.infoHash}
                                  onClick={() => void addMagnet(m, false)}
                                >
                                  {adding === m.infoHash ? (
                                    <IconSpinner width={13} height={13} />
                                  ) : (
                                    <IconDownload width={13} height={13} />
                                  )}
                                  下载
                                </button>
                                <button
                                  className="btn-ghost h-7 w-7 !px-0"
                                  title="用系统默认程序打开（迅雷等）"
                                  onClick={() => void addMagnet(m, true)}
                                >
                                  <IconMagnet width={13} height={13} />
                                </button>
                                <button
                                  className="btn-ghost h-7 w-7 !px-0"
                                  title="复制磁力链接"
                                  onClick={async () => {
                                    await window.api.util.copy(m.link)
                                    toast('ok', '磁力链接已复制')
                                  }}
                                >
                                  <IconCopy width={13} height={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              {/* 本地文件 */}
              {isDownloaded && <LocalFiles code={movie.code} />}
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndex={(i) => setLightbox({ ...lightbox, index: i })}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}

function Meta({
  label,
  value,
  mono,
  onClick
}: {
  label: string
  value?: string
  mono?: boolean
  onClick?: () => void
}): JSX.Element {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-slate-500">{label}</span>
      {value ? (
        onClick ? (
          <button
            onClick={onClick}
            className="truncate text-left text-accent-soft hover:text-accent hover:underline"
          >
            {value}
          </button>
        ) : (
          <span className={`truncate text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</span>
        )
      ) : (
        <span className="text-slate-600">—</span>
      )}
    </div>
  )
}

function Section({
  title,
  children,
  className,
  right
}: {
  title: string
  children: ReactNode
  className?: string
  right?: ReactNode
}): JSX.Element {
  return (
    <section className={className}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  )
}

/**
 * 在线观看：番号 → 各站点页面一一对应。
 * 「直達」站点（Jable / MissAV）的地址直接由番号拼出，点开即播；
 * 「搜索」站点（SupJav / Netflav）的详情页是站内 id，打开的是该番号的搜索结果页。
 */
function OnlineSection({ code }: { code: string }): JSX.Element | null {
  const { call, toast } = useApp()
  const [sites, setSites] = useState<OnlineSite[]>([])
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const list = await call(window.api.online.sites())
      if (list) setSites(list)
    })()
  }, [call])

  if (!sites.length) return null

  return (
    <Section
      title="在線觀看"
      className="mt-6"
      right={
        <span className="text-[11px] text-slate-500">
          在程序内的播放窗口打开，已自动拦截弹窗广告
        </span>
      }
    >
      <div className="flex flex-wrap gap-2">
        {sites.map((s) => (
          <button
            key={s.id}
            className="btn-ghost h-8 gap-1.5 border border-white/10"
            disabled={opening === s.id}
            title={
              s.kind === 'direct'
                ? `按番号直达 ${s.name} 对应影片页`
                : `在 ${s.name} 内按番号搜索定位`
            }
            onClick={async () => {
              setOpening(s.id)
              const url = await call(window.api.online.open(code, s.id))
              setOpening(null)
              if (url) toast('ok', `已在播放窗口打开 ${s.name}`)
            }}
          >
            {opening === s.id ? (
              <IconSpinner width={13} height={13} />
            ) : (
              <IconPlay width={13} height={13} />
            )}
            {s.name}
            <span
              className={`rounded px-1 text-[10px] ${
                s.kind === 'direct'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-sky-500/20 text-sky-300'
              }`}
            >
              {s.kind === 'direct' ? '直達' : '搜索'}
            </span>
          </button>
        ))}
      </div>
    </Section>
  )
}

function LocalFiles({ code }: { code: string }): JSX.Element | null {
  const { call, toast } = useApp()
  const [files, setFiles] = useState<{ path: string; size: number }[]>([])

  useEffect(() => {
    void (async () => {
      const list = await call(window.api.library.files(code))
      setFiles(list ?? [])
    })()
  }, [code, call])

  if (!files.length) return null

  return (
    <Section title={`本地文件 (${files.length})`} className="mt-6">
      <div className="space-y-1.5">
        {files.map((f) => (
          <div
            key={f.path}
            className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[.02] px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300" title={f.path}>
              {f.path}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-slate-500">
              {formatBytes(f.size)}
            </span>
            <button
              className="btn-primary h-7 !px-2"
              onClick={async () => {
                const p = await call(window.api.library.play(f.path))
                if (p) toast('ok', '已调用本机播放器')
              }}
            >
              <IconPlay width={13} height={13} /> 播放
            </button>
            <button
              className="btn-ghost h-7 w-7 !px-0"
              title="在文件夹中显示"
              onClick={() => void window.api.library.reveal(f.path)}
            >
              <IconFolder width={13} height={13} />
            </button>
          </div>
        ))}
      </div>
    </Section>
  )
}
