import type { ReactNode } from 'react'
import type { DownloadTask } from '../../../shared/types'
import {
  IconComet,
  IconCopy,
  IconDownload,
  IconFolder,
  IconPause,
  IconPlay,
  IconTrash
} from '../components/Icons'
import { TopBar } from '../components/TopBar'
import { formatBytes, formatEta, formatPercent, formatSpeed, stateText } from '../lib/format'
import { useApp } from '../state'

export function DownloadsPage(): JSX.Element {
  const { tasks, call, toast, refreshTasks, settings, go, openDetail } = useApp()
  const active = tasks.filter((t) => !t.done)
  const finished = tasks.filter((t) => t.done)
  const totalDown = active.reduce((n, t) => n + t.dlspeed, 0)
  const totalUp = active.reduce((n, t) => n + (t.upspeed ?? 0), 0)

  const openBitComet = async (): Promise<void> => {
    const how = await call(window.api.downloads.openBitComet())
    if (how) toast('ok', how === 'exe' ? '已唤起本机 BitComet' : '已在浏览器打开 BitComet 远程界面')
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <TopBar
        title="下载管理"
        subtitle={`进行中 ${active.length} · 已完成 ${finished.length}`}
        onRefresh={() => void refreshTasks()}
      />

      {/* 总览条：整体吞吐一眼可见 */}
      <div className="grid-bg flex shrink-0 items-center gap-5 border-b border-white/[.05] bg-ink-900/40 px-5 py-2">
        <Readout label="DOWN" value={formatSpeed(totalDown)} live={totalDown > 0} />
        <Readout label="UP" value={formatSpeed(totalUp)} />
        <Readout label="ACTIVE" value={String(active.length)} />
        <Readout label="DONE" value={String(finished.length)} />
        <div className="flex-1" />
        <span className="tag-label truncate" title={settings?.bc.url}>
          {settings?.bc.mode === 'webui' ? settings.bc.url : '本地模式'}
        </span>
        <button className="btn-data h-7" onClick={() => void openBitComet()} title="打开 BitComet 主界面">
          <IconComet width={14} height={14} />
          打开 BitComet
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {settings && settings.bc.mode !== 'webui' && (
          <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-500/25 bg-amber-500/[.07] px-4 py-3">
            <span className="mt-0.5 text-amber-400">
              <IconDownload width={16} height={16} />
            </span>
            <div className="flex-1 text-[12px] leading-relaxed text-amber-100/80">
              {settings.bc.mode === 'exe' ? (
                <>
                  当前是「仅命令行」模式，进度来自 BitComet 定期落盘的任务表，
                  会有几秒到几十秒的延迟，也没法在这里暂停/继续。
                  想要实时进度，请在 BitComet 里开启「远程下载」，再到设置里切到「远程接口」。
                </>
              ) : (
                <>
                  当前磁力直接交给系统默认下载工具，这类工具没有本地接口，无法读取真实进度；
                  程序只能通过扫描影片库来判断是否下载完成。想看到实时进度，请在设置里改用 BitComet。
                </>
              )}
            </div>
            <button className="btn-outline shrink-0" onClick={() => go({ kind: 'settings' })}>
              去设置
            </button>
          </div>
        )}

        {!tasks.length ? (
          <div className="grid place-items-center py-24 text-center text-slate-500">
            <div className="space-y-2">
              <div className="text-3xl">🧲</div>
              <p className="text-sm">还没有下载任务，去影片详情页点「下载」试试</p>
              {settings?.bc.mode === 'webui' && (
                <p className="text-[11px] text-slate-600">
                  BitComet 里已有的任务也会自动出现在这里（可在设置里关掉）
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!!active.length && (
              <Group title={`进行中 (${active.length})`}>
                {active.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </Group>
            )}

            {!!finished.length && (
              <Group
                title={`已完成 (${finished.length})`}
                right={
                  <button
                    className="btn-ghost !py-1 !text-[11px]"
                    onClick={async () => {
                      await call(window.api.downloads.clearFinished())
                      toast('ok', '已清理完成的任务记录')
                    }}
                  >
                    清理记录
                  </button>
                }
              >
                {finished.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </Group>
            )}
          </div>
        )}
      </div>
    </div>
  )

  function Readout({
    label,
    value,
    live
  }: {
    label: string
    value: string
    live?: boolean
  }): JSX.Element {
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="tag-label">{label}</span>
        <span className={`num text-[13px] ${live ? 'text-data' : 'text-slate-300'}`}>{value}</span>
      </div>
    )
  }

  function Group({
    title,
    right,
    children
  }: {
    title: string
    right?: ReactNode
    children: ReactNode
  }): JSX.Element {
    return (
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="tag-label">{title}</h3>
          {right}
        </div>
        <div className="space-y-1.5">{children}</div>
      </section>
    )
  }

  function TaskRow({ task }: { task: DownloadTask }): JSX.Element {
    const percent = task.done ? 100 : Math.round(task.progress * 100)
    const paused = /paused|stopped|suspend/i.test(task.state)
    const meta = /metadl|connecting/i.test(task.state)
    /** 只有远程接口那条路能控制单个任务 */
    const controllable = task.source === 'bitcomet' && !!task.bcTaskId
    const dotClass = task.error
      ? 'dot-err'
      : task.done
        ? 'dot-done'
        : paused
          ? 'dot-idle'
          : 'dot-live'

    return (
      <div className="panel grid-bg px-3 py-2">
        <div className="flex items-center gap-2.5">
          <i className={dotClass} />
          {task.code ? (
            <button
              className="ident shrink-0 rounded-sm bg-white/[.06] px-1.5 py-0.5 hover:bg-accent/20"
              onClick={() => openDetail(task.code)}
              title="查看影片详情"
            >
              {task.code}
            </button>
          ) : (
            <span className="num shrink-0 rounded-sm bg-white/[.04] px-1.5 py-0.5 text-[11px] text-slate-500">
              无番号
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-[13px] text-slate-200" title={task.name}>
            {task.name}
          </p>

          <span
            className={`num shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] ${
              task.done
                ? 'bg-emerald-500/15 text-emerald-300'
                : task.error
                  ? 'bg-rose-500/15 text-rose-300'
                  : 'bg-white/[.06] text-slate-300'
            }`}
          >
            {task.error ? '连接异常' : stateText(task.state)}
          </span>
          {task.adopted && (
            <span
              className="num shrink-0 rounded-sm border border-white/10 px-1.5 py-0.5 text-[11px] text-slate-400"
              title="这条是在 BitComet 里加的，本程序自动收进来的"
            >
              外部添加
            </span>
          )}
          {task.source === 'bitcomet-exe' && (
            <span
              className="num shrink-0 rounded-sm bg-sky-500/15 px-1.5 py-0.5 text-[11px] text-sky-300"
              title="由 BitComet 下载，进度读自它的任务表，有落盘延迟"
            >
              命令行
            </span>
          )}
          {task.source === 'external' && (
            <span
              className="num shrink-0 rounded-sm bg-slate-500/20 px-1.5 py-0.5 text-[11px] text-slate-300"
              title="交给了系统默认下载工具，只能靠扫描影片库判断是否完成"
            >
              外部
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-3">
          <div className="meter flex-1">
            <div
              className={`meter-fill ${
                task.done
                  ? 'bg-emerald-500'
                  : paused
                    ? 'bg-slate-500'
                    : meta
                      ? 'bg-amber-500/70'
                      : 'animate-meter-flow bg-data'
              }`}
              style={{ width: `${meta && !percent ? 100 : percent}%`, opacity: meta ? 0.35 : 1 }}
            />
          </div>

          <div className="flex shrink-0 items-baseline gap-3">
            <span className={`num w-[52px] text-right text-[12px] ${task.done ? 'text-emerald-400' : 'text-data'}`}>
              {formatPercent(task.progress)}
            </span>
            <span className="num w-[130px] text-right text-[11px] text-slate-500" title="已下载 / 总大小">
              {formatBytes(task.downloaded ?? 0)} / {formatBytes(task.size)}
            </span>
            <span className="num w-[74px] text-right text-[11px] text-slate-400">
              {task.done ? '—' : `↓${formatSpeed(task.dlspeed)}`}
            </span>
            <span className="num w-[74px] text-right text-[11px] text-slate-600">
              {task.upspeed ? `↑${formatSpeed(task.upspeed)}` : '—'}
            </span>
            <span className="num w-[76px] text-right text-[11px] text-slate-500">
              {task.done ? '—' : formatEta(task.eta)}
            </span>
            <span className="num w-[46px] text-right text-[11px] text-slate-600" title="资源健康度">
              {task.health || '—'}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {controllable && !task.done && (
              <button
                className="btn-ghost h-7 w-7 !px-0"
                title={paused ? '继续' : '暂停'}
                onClick={() =>
                  void call(
                    paused
                      ? window.api.downloads.resume(task.infoHash)
                      : window.api.downloads.pause(task.infoHash)
                  )
                }
              >
                {paused ? <IconPlay width={13} height={13} /> : <IconPause width={13} height={13} />}
              </button>
            )}
            <button
              className="btn-ghost h-7 w-7 !px-0"
              title="播放"
              onClick={async () => {
                const p = await call(window.api.downloads.play(task.infoHash))
                if (p) toast('ok', '已调用本机播放器')
              }}
            >
              <IconPlay width={13} height={13} />
            </button>
            {task.savePath && (
              <button
                className="btn-ghost h-7 w-7 !px-0"
                title="打开所在文件夹"
                onClick={() => void window.api.library.reveal(task.savePath!)}
              >
                <IconFolder width={13} height={13} />
              </button>
            )}
            <button
              className="btn-ghost h-7 w-7 !px-0"
              title="复制磁力链接"
              onClick={async () => {
                await window.api.util.copy(task.magnet)
                toast('ok', '磁力链接已复制')
              }}
            >
              <IconCopy width={13} height={13} />
            </button>
            <button
              className="btn-ghost h-7 w-7 !px-0 hover:text-rose-400"
              title="删除任务（不删文件）"
              onClick={() => void call(window.api.downloads.remove(task.infoHash, false))}
            >
              <IconTrash width={13} height={13} />
            </button>
          </div>
        </div>

        {task.error && (
          <p className="mt-1 truncate text-[11px] text-rose-300/80" title={task.error}>
            {task.error}
          </p>
        )}
      </div>
    )
  }
}
