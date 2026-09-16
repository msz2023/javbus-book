import { useEffect, useState } from 'react'
import type { Pagination } from '../../../shared/types'
import { IconChevronLeft, IconChevronRight } from './Icons'

interface Props {
  pagination: Pagination
  onGo: (page: number) => void
}

/** 站点页码 1:1 映射：这里显示的页码就是网页端的页码 */
export function Pager({ pagination, onGo }: Props): JSX.Element | null {
  const { current, pages, hasPrev, hasNext, maxKnown } = pagination
  const [jump, setJump] = useState(String(current))

  useEffect(() => setJump(String(current)), [current])

  if (!pages.length && !hasNext && !hasPrev) return null

  const visible = (() => {
    if (pages.length) return pages
    return [current]
  })()

  const submitJump = (): void => {
    const n = parseInt(jump, 10)
    if (Number.isFinite(n) && n >= 1 && n !== current) onGo(n)
    else setJump(String(current))
  }

  return (
    <div className="flex items-center justify-center gap-1.5 py-5">
      <button
        className="btn-ghost h-8 w-8 !px-0"
        disabled={!hasPrev}
        onClick={() => onGo(current - 1)}
        title="上一页 (←)"
      >
        <IconChevronLeft />
      </button>

      {visible[0] > 1 && (
        <>
          <PageBtn page={1} current={current} onGo={onGo} />
          {visible[0] > 2 && <span className="px-1 text-slate-600">…</span>}
        </>
      )}

      {visible.map((p) => (
        <PageBtn key={p} page={p} current={current} onGo={onGo} />
      ))}

      {hasNext && visible[visible.length - 1] === maxKnown && (
        <span className="px-1 text-slate-600">…</span>
      )}

      <button
        className="btn-ghost h-8 w-8 !px-0"
        disabled={!hasNext}
        onClick={() => onGo(current + 1)}
        title="下一页 (→)"
      >
        <IconChevronRight />
      </button>

      <div className="ml-3 flex items-center gap-1.5 text-xs text-slate-500">
        <span>跳至</span>
        <input
          value={jump}
          onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submitJump()}
          onBlur={submitJump}
          className="w-14 rounded-md border border-white/10 bg-ink-900/70 px-2 py-1 text-center text-slate-200 focus:border-accent/60"
        />
        <span>页</span>
      </div>
    </div>
  )
}

function PageBtn({
  page,
  current,
  onGo
}: {
  page: number
  current: number
  onGo: (p: number) => void
}): JSX.Element {
  const on = page === current
  return (
    <button
      onClick={() => !on && onGo(page)}
      className={`h-8 min-w-8 rounded-lg px-2 text-[13px] font-medium transition-colors ${
        on ? 'bg-accent text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {page}
    </button>
  )
}
