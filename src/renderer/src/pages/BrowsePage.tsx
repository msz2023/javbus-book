import { useCallback, useEffect, useRef, useState } from 'react'
import type { ListQuery, ListResult } from '../../../shared/types'
import { CrawlModal } from '../components/CrawlModal'
import { MovieGrid } from '../components/MovieGrid'
import { Pager } from '../components/Pager'
import { TopBar } from '../components/TopBar'
import { useApp } from '../state'

const KIND_TEXT: Record<ListQuery['kind'], string> = {
  home: '有码影片',
  uncensored: '无码影片',
  genre: '类别',
  'uncensored-genre': '无码类别',
  star: '演员',
  'uncensored-star': '无码演员',
  director: '导演',
  studio: '制作商',
  label: '发行商',
  series: '系列',
  search: '搜索',
  'uncensored-search': '无码搜索'
}

export function BrowsePage({ query }: { query: ListQuery }): JSX.Element {
  const { go, call, detailCode } = useApp()
  const [result, setResult] = useState<ListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCrawl, setShowCrawl] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await window.api.movies.list(query)
    if (res.ok) {
      setResult(res.data)
    } else {
      setError(res.error)
      setResult(null)
    }
    setLoading(false)
    scroller.current?.scrollTo({ top: 0 })
  }, [query])

  useEffect(() => {
    void load()
  }, [load])

  const goPage = useCallback(
    (page: number) => {
      if (page < 1) return
      go({ kind: 'browse', query: { ...query, page } }, { replace: true })
    },
    [go, query]
  )

  // ←/→ 翻页，F5 刷新
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = /input|textarea/i.test((e.target as HTMLElement)?.tagName ?? '')
      if (typing || detailCode || showCrawl) return
      if (e.key === 'ArrowLeft' && result?.pagination.hasPrev) goPage(query.page - 1)
      if (e.key === 'ArrowRight' && result?.pagination.hasNext) goPage(query.page + 1)
      if (e.key === 'F5') {
        e.preventDefault()
        void load()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailCode, showCrawl, result, query.page, goPage, load])

  const label = query.label ? `${KIND_TEXT[query.kind]}：${query.label}` : KIND_TEXT[query.kind]
  const subtitle = result
    ? `第 ${query.page} 页 · 本页 ${result.items.length} 部${result.heading ? ` · ${result.heading}` : ''}`
    : `第 ${query.page} 页`

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <TopBar
        title={label}
        subtitle={subtitle}
        onRefresh={() => void load()}
        refreshing={loading}
        onBulkCrawl={() => setShowCrawl(true)}
        showViews
      />

      <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-4">
        <MovieGrid
          items={result?.items ?? []}
          loading={loading}
          error={error}
          onRetry={() => void load()}
        />
        {result && !loading && !error && (
          <Pager pagination={result.pagination} onGo={goPage} />
        )}
      </div>

      {showCrawl && (
        <CrawlModal
          query={query}
          currentPage={query.page}
          maxKnown={result?.pagination.maxKnown ?? query.page}
          onClose={() => setShowCrawl(false)}
        />
      )}
    </div>
  )
}
