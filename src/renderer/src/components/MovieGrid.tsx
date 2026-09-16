import { useState } from 'react'
import { normCode } from '../../../shared/code'
import type { DownloadTask, MovieBrief } from '../../../shared/types'
import { coverUrl, formatPercent, formatSpeed, stateText } from '../lib/format'
import { useApp } from '../state'
import { IconCheck, IconHeart, IconPlay } from './Icons'
import { MovieCard } from './MovieCard'

interface Props {
  items: MovieBrief[]
  loading?: boolean
  error?: string | null
  emptyText?: string
  onRetry?: () => void
}

export function MovieGrid({ items, loading, error, emptyText, onRetry }: Props): JSX.Element {
  const { downloaded, taskByCode, isFavorite, toggleFavorite, openDetail, call, toast, viewMode, cardWidth } =
    useApp()

  // 小图像模式排得更密：站点缩略图本来就只有 147px 宽，铺太大也没意义
  const minWidth = viewMode === 'thumb' ? Math.round(cardWidth * 0.52) : cardWidth
  const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }

  if (loading) {
    return viewMode === 'detail' ? (
      <div className="space-y-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="skeleton h-[54px] rounded-md" />
        ))}
      </div>
    ) : (
      <div className="grid gap-3" style={gridStyle}>
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-md border border-white/[.07]">
            <div
              className="skeleton"
              style={{ aspectRatio: viewMode === 'cover' ? '3 / 2' : '147 / 200' }}
            />
            <div className="space-y-1.5 p-2">
              <div className="skeleton h-3 w-full rounded-sm" />
              <div className="skeleton h-3 w-2/3 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid place-items-center py-24 text-center">
        <div className="max-w-md space-y-3">
          <div className="text-3xl">🔌</div>
          <p className="text-[15px] font-medium text-white">{error}</p>
          <p className="text-xs leading-relaxed text-slate-500">
            站点在国内通常需要代理才能访问。请到「设置 → 网络」检查代理地址，或点下面的按钮重试。
          </p>
          {onRetry && (
            <button className="btn-primary mx-auto" onClick={onRetry}>
              重新加载
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="grid place-items-center py-24 text-center text-slate-500">
        <div className="space-y-2">
          <div className="text-3xl">📭</div>
          <p className="text-sm">{emptyText ?? '没有找到影片'}</p>
        </div>
      </div>
    )
  }

  const shared = (item: MovieBrief): {
    downloaded: boolean
    task?: DownloadTask
    favorite: boolean
    onOpen: () => void
    onToggleFav: () => void
    onPlay: () => void
  } => ({
    downloaded: downloaded.has(normCode(item.code)),
    task: taskByCode.get(item.code.toUpperCase()),
    favorite: isFavorite(item.code),
    onOpen: () => openDetail(item.code),
    onToggleFav: () => void toggleFavorite(item.code),
    onPlay: async () => {
      const path = await call(window.api.library.play(item.code))
      if (path) toast('ok', '已调用本机播放器')
    }
  })

  if (viewMode === 'detail') {
    return (
      <div className="overflow-hidden rounded-md border border-white/[.07] bg-ink-800/50">
        <div className="flex items-center gap-3 border-b border-white/[.07] bg-ink-900/50 px-3 py-1.5">
          <span className="tag-label w-[34px]" />
          <span className="tag-label w-[104px]">番号</span>
          <span className="tag-label flex-1">标题</span>
          <span className="tag-label w-[86px]">发行日期</span>
          <span className="tag-label w-[112px]">标记</span>
          <span className="tag-label w-[132px] text-right">状态</span>
        </div>
        <div className="divide-y divide-white/[.04]">
          {items.map((item) => (
            <MovieRow key={item.code + item.detailUrl} item={item} {...shared(item)} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3" style={gridStyle}>
      {items.map((item) => (
        <MovieCard
          key={item.code + item.detailUrl}
          item={item}
          mode={viewMode === 'cover' ? 'cover' : 'thumb'}
          {...shared(item)}
        />
      ))}
    </div>
  )
}

/** 详细信息模式的一行：缩略图 + 全部元数据 + 下载状态，一屏能看很多部 */
function MovieRow({
  item,
  downloaded,
  task,
  favorite,
  onOpen,
  onToggleFav,
  onPlay
}: {
  item: MovieBrief
  downloaded: boolean
  task?: DownloadTask
  favorite: boolean
  onOpen: () => void
  onToggleFav: () => void
  onPlay: () => void
}): JSX.Element {
  const [failed, setFailed] = useState(false)
  const downloading = task && !task.done

  return (
    <div className="group flex items-center gap-3 px-3 py-1.5 transition-colors hover:bg-white/[.035]">
      <button onClick={onOpen} className="shrink-0" title="查看详情">
        <div className="h-[46px] w-[34px] overflow-hidden rounded-sm border border-white/10 bg-ink-600">
          {!failed && (
            <img
              src={coverUrl(item.cover, 'thumb')}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
              className="h-full w-full object-cover"
            />
          )}
        </div>
      </button>

      <button onClick={onOpen} className="ident w-[104px] shrink-0 text-left hover:text-white">
        {item.code}
      </button>

      <button
        onClick={onOpen}
        className="min-w-0 flex-1 truncate text-left text-[13px] text-slate-300 hover:text-white"
        title={item.title}
      >
        {item.title || item.code}
      </button>

      <span className="num w-[86px] shrink-0 text-[11px] text-slate-500">{item.date}</span>

      <div className="flex w-[112px] shrink-0 flex-wrap gap-1">
        {item.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            className="num rounded-sm border border-amber-400/25 bg-amber-400/10 px-1 text-[10px] text-amber-300"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="flex w-[132px] shrink-0 items-center justify-end gap-1.5">
        {downloaded ? (
          <span className="num flex items-center gap-1 text-[11px] text-emerald-400">
            <i className="dot-done" /> 已下载
          </span>
        ) : downloading ? (
          <span className="telemetry flex items-center gap-1" title={stateText(task!.state)}>
            <i className="dot-live" />
            {formatPercent(task!.progress)}
            <span className="text-slate-500">{formatSpeed(task!.dlspeed)}</span>
          </span>
        ) : (
          <span className="num text-[11px] text-slate-600">—</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          className={`grid h-6 w-6 place-items-center rounded ${
            favorite ? 'text-accent' : 'text-slate-500 hover:text-accent-soft'
          }`}
          title={favorite ? '取消收藏' : '收藏'}
          onClick={onToggleFav}
        >
          <IconHeart width={13} height={13} />
        </button>
        <button
          className={`grid h-6 w-6 place-items-center rounded ${
            downloaded ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-700'
          }`}
          title={downloaded ? '播放' : '本地还没有这部影片'}
          disabled={!downloaded}
          onClick={onPlay}
        >
          {downloaded ? <IconPlay width={13} height={13} /> : <IconCheck width={13} height={13} />}
        </button>
      </div>
    </div>
  )
}
