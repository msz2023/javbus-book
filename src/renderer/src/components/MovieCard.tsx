import { useState } from 'react'
import type { DownloadTask, MovieBrief } from '../../../shared/types'
import { COVER_RATIO, THUMB_RATIO, coverUrl, formatPercent } from '../lib/format'
import { IconCheck, IconHeart, IconPlay } from './Icons'

interface Props {
  item: MovieBrief
  /** cover = 完整大封面（横版不裁切）；thumb = 站点缩略图（竖版密排） */
  mode: 'cover' | 'thumb'
  downloaded: boolean
  task?: DownloadTask
  favorite: boolean
  onOpen: () => void
  onToggleFav: () => void
  onPlay: () => void
}

export function MovieCard({
  item,
  mode,
  downloaded,
  task,
  favorite,
  onOpen,
  onToggleFav,
  onPlay
}: Props): JSX.Element {
  const [failed, setFailed] = useState(false)
  const full = mode === 'cover'
  const downloading = task && !task.done
  const percent = Math.round((task?.progress ?? 0) * 100)

  // 列表接口给的是 147×200 的缩略图，放到 300px 宽的卡片里必糊，
  // 「完整图像」模式换成 800×538 的大封面（正反面都在里面）
  const src = coverUrl(item.cover, full ? 'cover' : 'thumb')

  return (
    <div className="group relative animate-fade-up">
      <button
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-md border border-white/[.07] bg-ink-700 text-left
          shadow-hud transition-all duration-200 hover:-translate-y-0.5 hover:border-data/40 hover:shadow-data-glow"
      >
        <div
          className="relative overflow-hidden bg-ink-600"
          style={{ aspectRatio: full ? COVER_RATIO : THUMB_RATIO }}
        >
          {failed ? (
            <div className="tag-label grid h-full w-full place-items-center">NO IMAGE</div>
          ) : (
            <img
              src={src}
              alt={item.code}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                // 大封面偶尔不存在（老片只有缩略图），退回原始地址再试一次
                const el = e.currentTarget
                if (full && el.src !== item.cover) el.src = item.cover
                else setFailed(true)
              }}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
          <div className="ticks pointer-events-none absolute inset-0" />

          <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
            {item.tags.slice(0, full ? 3 : 2).map((t) => (
              <span
                key={t}
                className="num rounded-sm border border-amber-400/25 bg-black/70 px-1 py-[1px] text-[10px]
                  font-medium text-amber-300 backdrop-blur-sm"
              >
                {t}
              </span>
            ))}
          </div>

          <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-1">
            {downloaded && (
              <span className="num flex items-center gap-1 rounded-sm bg-emerald-500/90 px-1 py-[1px] text-[10px] font-semibold text-white">
                <IconCheck width={10} height={10} /> 已下载
              </span>
            )}
            {downloading && (
              <span className="num flex items-center gap-1 rounded-sm border border-data/40 bg-black/75 px-1 py-[1px] text-[10px] font-semibold text-data backdrop-blur-sm">
                <i className="dot-live" />
                {formatPercent(task!.progress)}
              </span>
            )}
          </div>

          <div className="absolute inset-x-1.5 bottom-1.5">
            <div className="flex items-end justify-between gap-2">
              <span className="ident rounded-sm border border-white/10 bg-black/65 px-1.5 py-[1px] backdrop-blur-sm">
                {item.code}
              </span>
              <span className="num text-[10px] text-slate-300/90">{item.date}</span>
            </div>
          </div>

          {downloading && (
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/50">
              <div
                className="meter-fill animate-meter-flow bg-data"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>

        <div className="border-t border-white/[.05] px-2 py-1.5">
          <p
            className="line-clamp-2 h-[32px] text-[12px] leading-[16px] text-slate-300 group-hover:text-white"
            title={item.title}
          >
            {item.title || item.code}
          </p>
        </div>
      </button>

      <div className="absolute right-1.5 top-1.5 flex translate-y-1 flex-col gap-1 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFav()
          }}
          title={favorite ? '取消收藏' : '收藏'}
          className={`grid h-7 w-7 place-items-center rounded-md backdrop-blur-sm transition-colors ${
            favorite ? 'bg-accent text-white' : 'bg-black/70 text-slate-300 hover:text-accent-soft'
          }`}
        >
          <IconHeart width={14} height={14} />
        </button>
        {downloaded && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPlay()
            }}
            title="用本机播放器播放"
            className="grid h-7 w-7 place-items-center rounded-md bg-emerald-500/90 text-white backdrop-blur-sm hover:bg-emerald-400"
          >
            <IconPlay width={14} height={14} />
          </button>
        )}
      </div>
    </div>
  )
}
