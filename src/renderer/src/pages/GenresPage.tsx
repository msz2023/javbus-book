import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GenreGroup } from '../../../shared/types'
import { IconSearch, IconSpinner } from '../components/Icons'
import { TopBar } from '../components/TopBar'
import { useApp } from '../state'

/**
 * 类别标签总览：抓站点的 /genre（有码）与 /uncensored/genre（无码），
 * 按站点原有分组展示全部标签，点击进入该类别的影片列表。
 */
export function GenresPage(): JSX.Element {
  const { call, go } = useApp()
  const [uncensored, setUncensored] = useState(false)
  const [groups, setGroups] = useState<GenreGroup[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')

  const load = useCallback(
    async (unc: boolean) => {
      setLoading(true)
      setError(null)
      const res = await call(window.api.movies.genres(unc))
      if (res) setGroups(res)
      else setError('类别列表加载失败，请检查网络 / 代理后重试')
      setLoading(false)
    },
    [call]
  )

  useEffect(() => {
    void load(uncensored)
  }, [load, uncensored])

  // 关键字过滤：只留名字里含关键字的标签，空组不显示
  const shown = useMemo(() => {
    if (!groups) return []
    const kw = keyword.trim().toLowerCase()
    if (!kw) return groups
    return groups
      .map((g) => ({ ...g, items: g.items.filter((it) => it.name.toLowerCase().includes(kw)) }))
      .filter((g) => g.items.length)
  }, [groups, keyword])

  const total = useMemo(() => groups?.reduce((n, g) => n + g.items.length, 0) ?? 0, [groups])

  const openGenre = (id: string, name: string): void =>
    go({
      kind: 'browse',
      query: { kind: uncensored ? 'uncensored-genre' : 'genre', value: id, label: name, page: 1 }
    })

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <TopBar
        title="类别标签"
        subtitle={groups ? `共 ${total} 个标签，点击进入对应影片列表` : '正在加载类别…'}
        onRefresh={() => void load(uncensored)}
        refreshing={loading}
      />

      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-2.5">
        <div className="flex overflow-hidden rounded-lg border border-white/10">
          {([false, true] as const).map((unc) => (
            <button
              key={String(unc)}
              className={`px-3 py-1.5 text-[12px] transition-colors ${
                uncensored === unc
                  ? 'bg-accent/20 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
              onClick={() => setUncensored(unc)}
            >
              {unc ? '无码类别' : '有码类别'}
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-[220px]">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500">
            <IconSearch width={13} height={13} />
          </span>
          <input
            className="field !pl-8"
            placeholder="过滤标签名…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
            <IconSpinner width={18} height={18} /> 正在抓取类别列表…
          </div>
        ) : error ? (
          <div className="grid place-items-center py-24 text-center">
            <div className="max-w-md space-y-3">
              <div className="text-3xl">🔌</div>
              <p className="text-[15px] font-medium text-white">{error}</p>
              <button className="btn-primary mx-auto" onClick={() => void load(uncensored)}>
                重新加载
              </button>
            </div>
          </div>
        ) : !shown.length ? (
          <div className="grid place-items-center py-24 text-slate-500">
            <p className="text-sm">没有匹配「{keyword}」的标签</p>
          </div>
        ) : (
          <div className="space-y-6">
            {shown.map((g) => (
              <section key={g.name}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {g.name} <span className="text-slate-600">({g.items.length})</span>
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((it) => (
                    <button
                      key={it.id}
                      className="chip"
                      title={`浏览「${it.name}」的影片`}
                      onClick={() => openGenre(it.id, it.name)}
                    >
                      {it.name}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
