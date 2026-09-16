import { useEffect, useState } from 'react'
import type { ListQuery } from '../../../shared/types'
import { useApp } from '../state'
import { IconClose, IconLayers, IconSpinner } from './Icons'

interface Props {
  query: ListQuery
  currentPage: number
  maxKnown: number
  onClose: () => void
}

/**
 * 批量抓取：把指定页码区间的影片详情与磁力抓进本地缓存，
 * 之后「本地筛选」页就能对这批数据做导演/类别/演员的组合筛选。
 */
export function CrawlModal({ query, currentPage, maxKnown, onClose }: Props): JSX.Element {
  const { call, crawl, toast } = useApp()
  const [from, setFrom] = useState(String(currentPage))
  const [to, setTo] = useState(String(Math.min(currentPage + 2, Math.max(maxKnown, currentPage + 2))))
  const running = !!crawl?.running
  // 影片库补齐资料共用同一套进度，别把它的数字当成页码进度显示
  const pageCrawl = crawl?.kind === 'pages' ? crawl : null

  useEffect(() => {
    if (crawl && !crawl.running && crawl.message) toast('info', crawl.message)
    // 只在运行状态变化时提示
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawl?.running])

  const start = async (): Promise<void> => {
    const f = Math.max(1, parseInt(from, 10) || 1)
    const t = Math.max(f, parseInt(to, 10) || f)
    if (t - f > 50) {
      toast('err', '一次最多抓取 50 页，避免给站点造成压力')
      return
    }
    await call(window.api.crawl.start(query, f, t))
  }

  const percent =
    pageCrawl && pageCrawl.totalItems > 0
      ? Math.round(((pageCrawl.doneItems + pageCrawl.failedItems) / pageCrawl.totalItems) * 100)
      : 0

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[440px] animate-fade-up rounded-2xl border border-white/10 bg-ink-800 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="text-accent">
            <IconLayers width={18} height={18} />
          </span>
          <h3 className="flex-1 text-[15px] font-semibold text-white">批量抓取入库</h3>
          <button className="btn-ghost h-7 w-7 !px-0" onClick={onClose}>
            <IconClose width={14} height={14} />
          </button>
        </div>

        <p className="mb-4 text-[12px] leading-relaxed text-slate-400">
          按页码区间抓取当前列表的影片详情与磁力，存入本地缓存。抓完后即可在「本地筛选」里按导演 /
          类别 / 演员组合筛选，也支持离线浏览。
        </p>

        <div className="mb-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="label">起始页</label>
            <input
              className="field"
              value={from}
              disabled={running}
              onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <span className="pb-2 text-slate-500">→</span>
          <div className="flex-1">
            <label className="label">结束页</label>
            <input
              className="field"
              value={to}
              disabled={running}
              onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </div>

        {pageCrawl && (pageCrawl.running || pageCrawl.totalItems > 0) && (
          <div className="mb-4 space-y-2 rounded-xl border border-white/5 bg-ink-900/60 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                第 {pageCrawl.currentPage} 页 · 已入库 {pageCrawl.doneItems}
                {pageCrawl.failedItems ? ` · 失败 ${pageCrawl.failedItems}` : ''} / {pageCrawl.totalItems}
              </span>
              <span>{percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-accent to-accent-soft transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="truncate text-[11px] text-slate-500">{pageCrawl.message}</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {running ? (
            <button
              className="btn-outline"
              onClick={() => void call(window.api.crawl.cancel())}
            >
              停止
            </button>
          ) : (
            <button className="btn-ghost" onClick={onClose}>
              关闭
            </button>
          )}
          <button className="btn-primary" disabled={running} onClick={() => void start()}>
            {running ? (
              <>
                <IconSpinner width={14} height={14} /> 抓取中
              </>
            ) : (
              '开始抓取'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
