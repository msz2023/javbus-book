import { useEffect, useRef, useState } from 'react'
import type { ViewMode } from '../state'
import { useApp } from '../state'
import {
  IconChevronLeft,
  IconLayers,
  IconRefresh,
  IconSearch,
  IconViewCover,
  IconViewDetail,
  IconViewThumb
} from './Icons'

interface Props {
  title: string
  subtitle?: string
  onRefresh?: () => void
  refreshing?: boolean
  onBulkCrawl?: () => void
  /** 影片列表页才显示视图切换 */
  showViews?: boolean
}

const VIEWS: { mode: ViewMode; text: string; Icon: typeof IconViewCover }[] = [
  { mode: 'cover', text: '完整图像', Icon: IconViewCover },
  { mode: 'thumb', text: '小图像', Icon: IconViewThumb },
  { mode: 'detail', text: '详细信息', Icon: IconViewDetail }
]

export function TopBar({
  title,
  subtitle,
  onRefresh,
  refreshing,
  onBulkCrawl,
  showViews
}: Props): JSX.Element {
  const { go, back, canBack, viewMode, setViewMode } = useApp()
  const [keyword, setKeyword] = useState('')
  const [uncensored, setUncensored] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 「/」聚焦搜索框；Ctrl+1/2/3 切视图
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      const typing = /input|textarea/i.test(target?.tagName ?? '')
      if (e.key === '/' && !typing) {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (showViews && e.ctrlKey && !e.shiftKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        setViewMode(VIEWS[Number(e.key) - 1].mode)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showViews, setViewMode])

  const submit = (): void => {
    const kw = keyword.trim()
    if (!kw) return
    go({
      kind: 'browse',
      query: {
        kind: uncensored ? 'uncensored-search' : 'search',
        value: kw,
        label: kw,
        page: 1
      }
    })
  }

  return (
    <header className="flex h-[62px] shrink-0 items-center gap-3 border-b border-white/5 bg-ink-800/40 px-5">
      <button
        className="btn-ghost h-8 w-8 !px-0 disabled:opacity-25"
        title="返回"
        disabled={!canBack}
        onClick={back}
      >
        <IconChevronLeft />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold text-white">{title}</h1>
        {subtitle && <p className="num truncate text-[11px] text-slate-500">{subtitle}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {showViews && (
          <div className="seg" role="group" aria-label="视图">
            {VIEWS.map(({ mode, text, Icon }, i) => (
              <button
                key={mode}
                className={`seg-item ${viewMode === mode ? 'seg-item-on' : ''}`}
                title={`${text}（Ctrl+${i + 1}）`}
                onClick={() => setViewMode(mode)}
              >
                <Icon width={15} height={15} />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center rounded-lg border border-white/10 bg-ink-900/70 focus-within:border-accent/60">
          <span className="pl-2.5 text-slate-500">
            <IconSearch />
          </span>
          <input
            ref={inputRef}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
            }}
            placeholder="搜索番号 / 片名 / 演员"
            className="w-[170px] bg-transparent px-2.5 py-1.5 text-[13px] placeholder:text-slate-500 xl:w-[240px]"
          />
          <button
            onClick={() => setUncensored((v) => !v)}
            title="切换搜索范围"
            className={`mr-1 rounded px-2 py-1 text-[11px] transition-colors ${
              uncensored ? 'bg-accent/20 text-accent-soft' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {uncensored ? '无码' : '有码'}
          </button>
        </div>

        <button className="btn-primary h-8" onClick={submit} disabled={!keyword.trim()}>
          搜索
        </button>

        {onBulkCrawl && (
          <button className="btn-outline h-8" onClick={onBulkCrawl} title="批量抓取多页入库">
            <IconLayers />
            批量抓取
          </button>
        )}

        {onRefresh && (
          <button className="btn-ghost h-8 w-8 !px-0" onClick={onRefresh} title="刷新 (F5)">
            <IconRefresh className={refreshing ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
    </header>
  )
}
