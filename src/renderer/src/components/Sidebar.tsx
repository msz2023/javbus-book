import { useApp, type View } from '../state'
import {
  IconComet,
  IconDownload,
  IconFilter,
  IconFlame,
  IconHeart,
  IconHome,
  IconSettings,
  IconTag
} from './Icons'

interface NavItem {
  key: string
  label: string
  icon: (p: { width: number; height: number }) => JSX.Element
  view: View
  badge?: number
  active: (v: View) => boolean
}

export function Sidebar(): JSX.Element {
  const { view, go, tasks, downloaded, favorites, call, toast } = useApp()
  const running = tasks.filter((t) => !t.done).length

  const items: NavItem[] = [
    {
      key: 'home',
      label: '有码影片',
      icon: IconHome,
      view: { kind: 'browse', query: { kind: 'home', page: 1 } },
      active: (v) => v.kind === 'browse' && v.query.kind === 'home'
    },
    {
      key: 'uncensored',
      label: '无码影片',
      icon: IconFlame,
      view: { kind: 'browse', query: { kind: 'uncensored', page: 1 } },
      active: (v) => v.kind === 'browse' && v.query.kind === 'uncensored'
    },
    {
      key: 'genres',
      label: '类别标签',
      icon: IconTag,
      view: { kind: 'genres' },
      active: (v) =>
        v.kind === 'genres' ||
        (v.kind === 'browse' && (v.query.kind === 'genre' || v.query.kind === 'uncensored-genre'))
    },
    {
      key: 'local',
      label: '本地筛选',
      icon: IconFilter,
      view: { kind: 'local' },
      active: (v) => v.kind === 'local' && !v.preset
    },
    {
      key: 'fav',
      label: '我的收藏',
      icon: IconHeart,
      view: { kind: 'local', preset: 'fav' },
      badge: favorites.length,
      active: (v) => v.kind === 'local' && v.preset === 'fav'
    },
    {
      key: 'downloaded',
      label: '已下载',
      icon: IconFolder2,
      view: { kind: 'local', preset: 'downloaded' },
      badge: downloaded.size,
      active: (v) => v.kind === 'local' && v.preset === 'downloaded'
    },
    {
      key: 'downloads',
      label: '下载管理',
      icon: IconDownload,
      view: { kind: 'downloads' },
      badge: running,
      active: (v) => v.kind === 'downloads'
    },
    {
      key: 'settings',
      label: '设置',
      icon: IconSettings,
      view: { kind: 'settings' },
      active: (v) => v.kind === 'settings'
    }
  ]

  return (
    <aside className="flex h-full w-[196px] shrink-0 flex-col border-r border-white/5 bg-ink-800/60">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-deep text-sm font-bold text-white shadow-glow">
          JB
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-white">JavBus</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Desktop</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {items.map((item) => {
          const on = item.active(view)
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => go(item.view)}
              className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all
                ${on ? 'bg-accent/15 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}
            >
              <span className={on ? 'text-accent' : 'text-slate-500 group-hover:text-slate-300'}>
                <Icon width={16} height={16} />
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {!!item.badge && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    on ? 'bg-accent text-white' : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {item.badge > 999 ? '999+' : item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="px-2 pb-2">
        <button
          className="flex w-full items-center gap-2.5 rounded-md border border-data/25 bg-data/[.06] px-3 py-2
            text-[12px] text-data transition-colors hover:border-data/50 hover:bg-data/[.12]"
          title="唤起本机 BitComet；装在别的机器上就打开它的远程界面"
          onClick={async () => {
            const how = await call(window.api.downloads.openBitComet())
            if (how) toast('ok', how === 'exe' ? '已唤起本机 BitComet' : '已打开 BitComet 远程界面')
          }}
        >
          <IconComet width={15} height={15} />
          打开 BitComet
        </button>
      </div>

      <div className="border-t border-white/[.05] px-4 py-3 text-[10px] leading-relaxed text-slate-600">
        番号可用 <kbd className="num rounded bg-white/10 px-1">/</kbd> 快速搜索 · 翻页{' '}
        <kbd className="num rounded bg-white/10 px-1">←</kbd>{' '}
        <kbd className="num rounded bg-white/10 px-1">→</kbd>
        <br />
        视图切换 <kbd className="num rounded bg-white/10 px-1">Ctrl</kbd>+
        <kbd className="num rounded bg-white/10 px-1">1</kbd>
        <kbd className="num rounded bg-white/10 px-1">2</kbd>
        <kbd className="num rounded bg-white/10 px-1">3</kbd>
      </div>
    </aside>
  )
}

/** 侧栏「已下载」用的文件夹图标（带勾） */
function IconFolder2(p: { width: number; height: number }): JSX.Element {
  return (
    <svg
      {...p}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z" />
      <path d="m8.5 13.5 2 2 4-4" />
    </svg>
  )
}
