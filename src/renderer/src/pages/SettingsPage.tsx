import { useEffect, useState, type ReactNode } from 'react'
import type { CacheInfo } from '../../../preload/index'
import type { BcFolder, BcPaths, Settings } from '../../../shared/types'
import {
  IconCheck,
  IconComet,
  IconFolder,
  IconRefresh,
  IconSpinner,
  IconTrash
} from '../components/Icons'
import { TopBar } from '../components/TopBar'
import { formatBytes } from '../lib/format'
import { useApp } from '../state'

export function SettingsPage(): JSX.Element {
  const { settings, saveSettings, call, toast, refreshLibrary, downloaded } = useApp()
  const [draft, setDraft] = useState<Settings | null>(settings)
  const [bcTesting, setBcTesting] = useState(false)
  const [bcProbing, setBcProbing] = useState(false)
  const [bcVersion, setBcVersion] = useState<string | null>(null)
  const [bcPaths, setBcPaths] = useState<BcPaths | null>(null)
  const [cache, setCache] = useState<CacheInfo | null>(null)
  const [scanning, setScanning] = useState(false)
  const [bcFolders, setBcFolders] = useState<BcFolder[]>([])
  const [bcFolderBusy, setBcFolderBusy] = useState(false)

  useEffect(() => setDraft(settings), [settings])
  useEffect(() => {
    void (async () => {
      setCache(await call(window.api.cache.info()))
      setBcPaths(await call(window.api.downloads.detectBitComet()))
    })()
  }, [call])

  // BitComet 的下载目录列表：save_folder 只接受列表内的目录，所以设置页要能看到它
  const bcMode = settings?.bc.mode
  useEffect(() => {
    if (bcMode !== 'webui') return
    void (async () => {
      const res = await window.api.downloads.bcFolders()
      if (res.ok) setBcFolders(res.data.folders)
    })()
  }, [bcMode])

  if (!draft) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-slate-500">
        <IconSpinner width={18} height={18} />
      </div>
    )
  }

  const patch = (p: Partial<Settings>): void => setDraft({ ...draft, ...p })
  const patchBc = (p: Partial<Settings['bc']>): void =>
    setDraft({ ...draft, bc: { ...draft.bc, ...p } })

  const savePathInvalid =
    !!draft.bc.savePath.trim() &&
    bcFolders.length > 0 &&
    !bcFolders.some((f) => samePath(f.path, draft.bc.savePath))

  const commit = async (p: Partial<Settings>): Promise<void> => {
    await saveSettings(p)
    setCache(await call(window.api.cache.info()))
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <TopBar title="设置" subtitle="网络 · 下载器 · 影片库 · 缓存" />

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-[820px] space-y-4">
          {/* 界面 */}
          <Card
            title="界面"
            desc="列表怎么显示、整体缩放多大。视图也可以在列表页右上角直接切（Ctrl+1/2/3）。"
          >
            <Row
              label="默认视图"
              hint="完整图像用站点大封面（正反面，800×538）；小图像用缩略图，密排更省地方；详细信息是一行一部的表格"
            >
              <div className="flex gap-1.5">
                {(
                  [
                    ['cover', '完整图像'],
                    ['thumb', '小图像'],
                    ['detail', '详细信息']
                  ] as const
                ).map(([mode, text]) => (
                  <button
                    key={mode}
                    className={`chip ${draft.viewMode === mode ? 'chip-on' : ''}`}
                    onClick={() => {
                      patch({ viewMode: mode })
                      void commit({ viewMode: mode })
                    }}
                  >
                    {text}
                    {draft.viewMode === mode && <IconCheck width={12} height={12} />}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="卡片宽度" hint="每行放几个由它决定；小图像模式会自动按一半宽度排">
              <div className="flex w-full items-center gap-3">
                <input
                  type="range"
                  min={200}
                  max={480}
                  step={20}
                  value={draft.cardWidth}
                  onChange={(e) => patch({ cardWidth: Number(e.target.value) })}
                  onMouseUp={() => void commit({ cardWidth: draft.cardWidth })}
                  className="h-1 flex-1 accent-[#38e0d0]"
                />
                <span className="num w-[64px] text-right text-[12px] text-data">
                  {draft.cardWidth}px
                </span>
              </div>
            </Row>

            <Row
              label="界面缩放"
              hint="嫌字小、元素小就往右拉。走 Chromium 的页面缩放，图片和边框会一起放大，不会只变字号"
            >
              <div className="flex w-full items-center gap-3">
                <input
                  type="range"
                  min={0.8}
                  max={1.6}
                  step={0.05}
                  value={draft.uiScale}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    patch({ uiScale: v })
                    void window.api.util.zoom(v)
                  }}
                  onMouseUp={() => void commit({ uiScale: draft.uiScale })}
                  className="h-1 flex-1 accent-[#38e0d0]"
                />
                <span className="num w-[64px] text-right text-[12px] text-data">
                  {Math.round(draft.uiScale * 100)}%
                </span>
                <button
                  className="btn-ghost shrink-0"
                  onClick={() => {
                    patch({ uiScale: 1 })
                    void window.api.util.zoom(1)
                    void commit({ uiScale: 1 })
                  }}
                >
                  100%
                </button>
              </div>
            </Row>
          </Card>

          {/* 网络 */}
          <Card title="网络" desc="站点在国内一般需要代理；封面图与页面抓取都会走这里的设置。">
            <Row label="代理模式">
              <div className="flex gap-1.5">
                {(
                  [
                    ['auto', '自动探测'],
                    ['manual', '手动指定'],
                    ['off', '不使用代理']
                  ] as const
                ).map(([mode, text]) => (
                  <button
                    key={mode}
                    className={`chip ${draft.proxyMode === mode ? 'chip-on' : ''}`}
                    onClick={() => {
                      patch({ proxyMode: mode })
                      void commit({ proxyMode: mode })
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="代理地址">
              <div className="flex gap-2">
                <input
                  className="field"
                  value={draft.proxyUrl}
                  placeholder="http://127.0.0.1:7897"
                  onChange={(e) => patch({ proxyUrl: e.target.value })}
                  onBlur={() => void commit({ proxyUrl: draft.proxyUrl })}
                />
                <button
                  className="btn-outline shrink-0"
                  onClick={async () => {
                    const found = await call(window.api.settings.probeProxy())
                    if (found) {
                      patch({ proxyUrl: found })
                      await commit({ proxyUrl: found })
                      toast('ok', `探测到本机代理 ${found}`)
                    } else {
                      toast('err', '没有探测到常见的本机代理端口')
                    }
                  }}
                >
                  <IconRefresh width={13} height={13} /> 探测
                </button>
              </div>
            </Row>

            <Row label="站点域名" hint="第一个是当前使用的域名，其余作为备用镜像自动故障转移">
              <input
                className="field"
                value={draft.mirrors.join(', ')}
                placeholder="https://www.javbus.com, https://javbus.com"
                onChange={(e) =>
                  patch({ mirrors: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
                }
                onBlur={() =>
                  void commit({
                    mirrors: draft.mirrors,
                    activeMirror: draft.mirrors[0] ?? 'https://www.javbus.com'
                  })
                }
              />
            </Row>

            <Row label="抓取并发" hint="批量抓取时同时请求的数量，建议 2~4">
              <input
                type="range"
                min={1}
                max={8}
                value={draft.concurrency}
                onChange={(e) => patch({ concurrency: Number(e.target.value) })}
                onMouseUp={() => void commit({ concurrency: draft.concurrency })}
                className="w-full accent-accent"
              />
              <span className="ml-2 w-6 text-center font-mono text-xs text-slate-400">
                {draft.concurrency}
              </span>
            </Row>

            <Row
              label="请求间隔"
              hint="站点对过快的请求会返回 429 限流（实测约 2.5 请求/秒是安全线）。调小会更快，但失败率上升；遇到 429 时程序会自动读取 Retry-After 并降速重试。"
            >
              <input
                type="range"
                min={0}
                max={1500}
                step={20}
                value={draft.requestGapMs}
                onChange={(e) => patch({ requestGapMs: Number(e.target.value) })}
                onMouseUp={() => void commit({ requestGapMs: draft.requestGapMs })}
                className="w-full accent-accent"
              />
              <span className="ml-2 w-14 text-center font-mono text-xs text-slate-400">
                {draft.requestGapMs}ms
              </span>
            </Row>
          </Card>

          {/* 下载器 */}
          <Card
            title="下载器（BitComet）"
            desc="磁力交给 BitComet。「远程接口」有实时进度、可暂停/继续/删除；「仅命令行」零配置，但进度靠读 BitComet 的 Downloads.xml，有几秒到几十秒延迟。"
          >
            <Row label="模式">
              <div className="flex gap-1.5">
                {(
                  [
                    ['webui', '远程接口'],
                    ['exe', '仅命令行'],
                    ['off', '系统默认程序']
                  ] as const
                ).map(([mode, text]) => (
                  <button
                    key={mode}
                    className={`chip ${draft.bc.mode === mode ? 'chip-on' : ''}`}
                    onClick={() => {
                      patchBc({ mode })
                      void commit({ bc: { ...draft.bc, mode } })
                    }}
                  >
                    {draft.bc.mode === mode && <IconCheck width={12} height={12} />}
                    {text}
                  </button>
                ))}
              </div>
            </Row>

            {draft.bc.mode === 'webui' && (
              <>
                <Row label="远程接口地址">
                  <div className="flex gap-2">
                    <input
                      className="field"
                      value={draft.bc.url}
                      placeholder="http://127.0.0.1:1235"
                      onChange={(e) => patchBc({ url: e.target.value })}
                      onBlur={() => void commit({ bc: draft.bc })}
                    />
                    <button
                      className="btn-ghost shrink-0"
                      disabled={bcProbing}
                      title="扫描本机端口找 BitComet 远程接口"
                      onClick={async () => {
                        setBcProbing(true)
                        const url = await call(window.api.downloads.probeBitComet())
                        setBcProbing(false)
                        if (url) {
                          patchBc({ url })
                          await commit({ bc: { ...draft.bc, url } })
                          toast('ok', `探测到 ${url}`)
                        } else {
                          toast('err', '没找到开着的 BitComet 远程接口，请确认已在选项里启用')
                        }
                      }}
                    >
                      {bcProbing ? <IconSpinner width={13} height={13} /> : <IconRefresh width={13} height={13} />}
                      自动探测
                    </button>
                  </div>
                </Row>

                <Row label="账号 / 密码">
                  <div className="flex gap-2">
                    <input
                      className="field"
                      value={draft.bc.username}
                      placeholder="admin"
                      onChange={(e) => patchBc({ username: e.target.value })}
                      onBlur={() => void commit({ bc: draft.bc })}
                    />
                    <input
                      className="field"
                      type="password"
                      value={draft.bc.password}
                      placeholder="远程下载里设的密码"
                      onChange={(e) => patchBc({ password: e.target.value })}
                      onBlur={() => void commit({ bc: draft.bc })}
                    />
                  </div>
                </Row>
              </>
            )}

            {draft.bc.mode !== 'off' && (
              <Row
                label="保存目录"
                hint="BitComet 只接受它「下载目录」列表里的目录，子目录也不行；不在列表里的可以点「加入 BitComet」"
              >
                <div className="w-full space-y-2">
                  <div className="flex gap-2">
                    <input
                      className="field"
                      value={draft.bc.savePath}
                      placeholder="留空则用 BitComet 的默认目录"
                      onChange={(e) => patchBc({ savePath: e.target.value })}
                      onBlur={() => void commit({ bc: draft.bc })}
                    />
                    <button
                      className="btn-ghost shrink-0"
                      title="选择目录"
                      onClick={async () => {
                        const dir = await call(window.api.settings.pickDir('选择下载保存目录'))
                        if (dir) {
                          patchBc({ savePath: dir })
                          await commit({ bc: { ...draft.bc, savePath: dir } })
                        }
                      }}
                    >
                      <IconFolder width={13} height={13} />
                    </button>
                  </div>

                  {draft.bc.mode === 'webui' && (
                    <>
                      {savePathInvalid && (
                        <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[.07] px-2.5 py-1.5">
                          <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-amber-300/90">
                            这个目录不在 BitComet 的下载目录列表里，加任务会被它拒掉（
                            <code>save_folder invalid</code>）。
                          </span>
                          <button
                            className="btn-outline shrink-0 !py-1"
                            disabled={bcFolderBusy}
                            onClick={async () => {
                              setBcFolderBusy(true)
                              const list = await call(
                                window.api.downloads.bcAddFolder(draft.bc.savePath.trim())
                              )
                              setBcFolderBusy(false)
                              if (list) {
                                setBcFolders(list)
                                toast('ok', '已加入 BitComet 的下载目录')
                              }
                            }}
                          >
                            {bcFolderBusy ? <IconSpinner width={12} height={12} /> : null} 加入 BitComet
                          </button>
                        </div>
                      )}

                      {!!bcFolders.length && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">BitComet 里可用：</span>
                          {bcFolders.map((f) => (
                            <button
                              key={f.path}
                              className={`chip !px-2 !py-0.5 !text-[11px] ${
                                samePath(f.path, draft.bc.savePath) ? 'chip-on' : ''
                              }`}
                              title={f.path}
                              onClick={() => {
                                patchBc({ savePath: f.path })
                                void commit({ bc: { ...draft.bc, savePath: f.path } })
                              }}
                            >
                              {f.display || f.path}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Row>
            )}

            {draft.bc.mode === 'webui' && (
              <Row label="连接测试">
                <div className="flex items-center gap-2">
                  <button
                    className="btn-primary"
                    disabled={bcTesting}
                    onClick={async () => {
                      setBcTesting(true)
                      await commit({ bc: draft.bc })
                      const res = await call(window.api.downloads.testBitComet())
                      setBcTesting(false)
                      if (res) {
                        setBcVersion(res.version)
                        toast('ok', `连接成功，BitComet ${res.version}`)
                      }
                    }}
                  >
                    {bcTesting ? <IconSpinner width={13} height={13} /> : null} 测试连接
                  </button>
                  <button
                    className="btn-data"
                    title="本机装了就唤起主界面，否则打开它的远程网页界面"
                    onClick={async () => {
                      const how = await call(window.api.downloads.openBitComet())
                      if (how) {
                        toast('ok', how === 'exe' ? '已唤起本机 BitComet' : '已打开 BitComet 远程界面')
                      }
                    }}
                  >
                    <IconComet width={13} height={13} /> 打开 BitComet
                  </button>
                  {bcVersion && <span className="text-[12px] text-emerald-400">已连接 {bcVersion}</span>}
                </div>
              </Row>
            )}

            {draft.bc.mode === 'webui' && (
              <Row
                label="外部任务"
                hint="在 BitComet 里手动加的任务也会出现在「下载管理」里，能看进度、能暂停；它们从 BitComet 删掉后这里也会跟着消失"
              >
                <button
                  className={`chip ${draft.bc.adoptRemote ? 'chip-on' : ''}`}
                  onClick={() => {
                    const next = !draft.bc.adoptRemote
                    patchBc({ adoptRemote: next })
                    void commit({ bc: { ...draft.bc, adoptRemote: next } })
                  }}
                >
                  显示 BitComet 里的其它任务
                  {draft.bc.adoptRemote && <IconCheck width={12} height={12} />}
                </button>
              </Row>
            )}

            {draft.bc.mode !== 'off' && (
              <Row label="本机 BitComet">
                <div className="space-y-1.5 text-[11px] leading-relaxed">
                  <p className="font-mono text-slate-400">
                    程序：{bcPaths?.exePath ?? <span className="text-rose-400">未找到</span>}
                  </p>
                  <p className="font-mono text-slate-400">
                    任务表：{bcPaths?.downloadsXml ?? <span className="text-amber-400">未找到</span>}
                  </p>
                  <p className="text-slate-500">
                    这两项是自动探测的（程序路径来自磁力协议的注册表关联）。装了多份 BitComet
                    时会挑任务表最新的那份，不对的话可以下面手动指定。
                  </p>
                </div>
              </Row>
            )}

            {draft.bc.mode !== 'off' && (
              <Row label="手动指定">
                <div className="flex gap-2">
                  <input
                    className="field"
                    value={draft.bc.exePath}
                    placeholder="BitComet.exe 完整路径（留空 = 自动）"
                    onChange={(e) => patchBc({ exePath: e.target.value })}
                    onBlur={async () => {
                      await commit({ bc: draft.bc })
                      setBcPaths(await call(window.api.downloads.detectBitComet()))
                    }}
                  />
                  <input
                    className="field"
                    value={draft.bc.dataDir}
                    placeholder="Downloads.xml 所在目录（留空 = 自动）"
                    onChange={(e) => patchBc({ dataDir: e.target.value })}
                    onBlur={async () => {
                      await commit({ bc: draft.bc })
                      setBcPaths(await call(window.api.downloads.detectBitComet()))
                    }}
                  />
                </div>
              </Row>
            )}

            <p className="rounded-lg bg-white/[.03] px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              开启远程接口：BitComet → 选项 → 远程下载 → 勾选启用，设好端口和密码，填到上面点「测试连接」。
              需要 BitComet <span className="text-slate-300">2.18 及以上</span>版本。
              没开也不影响用——「远程接口」模式连不上时会自动改用命令行拉起 BitComet，只是拿不到实时进度。
            </p>
          </Card>

          {/* 影片库 */}
          <Card
            title="影片库"
            desc="扫描这些目录里的视频文件，按文件名中的番号匹配影片，用于标记「已下载」并支持一键播放。"
          >
            <Row label="目录">
              <div className="w-full space-y-1.5">
                {draft.libraryDirs.map((dir) => (
                  <div
                    key={dir}
                    className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[.02] px-3 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300">{dir}</span>
                    <button
                      className="btn-ghost h-6 w-6 !px-0 hover:text-rose-400"
                      onClick={() =>
                        void commit({ libraryDirs: draft.libraryDirs.filter((d) => d !== dir) })
                      }
                    >
                      <IconTrash width={12} height={12} />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button
                    className="btn-outline"
                    onClick={async () => {
                      const dir = await call(window.api.settings.pickDir('选择影片目录'))
                      if (dir && !draft.libraryDirs.includes(dir)) {
                        await commit({ libraryDirs: [...draft.libraryDirs, dir] })
                        toast('ok', '已添加目录，正在扫描…')
                      }
                    }}
                  >
                    <IconFolder width={13} height={13} /> 添加目录
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={scanning}
                    onClick={async () => {
                      setScanning(true)
                      await refreshLibrary()
                      setScanning(false)
                      toast('ok', '扫描完成')
                    }}
                  >
                    {scanning ? <IconSpinner width={13} height={13} /> : <IconRefresh width={13} height={13} />}
                    重新扫描
                  </button>
                  <span className="self-center text-[11px] text-slate-500">
                    已识别 {downloaded.size} 个番号
                  </span>
                </div>
              </div>
            </Row>

            <Row
              label="自动补齐资料"
              hint="「已下载影片」页是按本地缓存筛选的，硬盘上有文件但没抓过资料的影片在那里看不见；开启后进入该页会自动按番号搜索并入库"
            >
              <button
                className={`chip ${draft.autoFillLibraryMeta ? 'chip-on' : ''}`}
                onClick={() => {
                  const next = !draft.autoFillLibraryMeta
                  patch({ autoFillLibraryMeta: next })
                  void commit({ autoFillLibraryMeta: next })
                }}
              >
                {draft.autoFillLibraryMeta && <IconCheck width={12} height={12} />}
                {draft.autoFillLibraryMeta ? '已开启' : '已关闭'}
              </button>
            </Row>
          </Card>

          {/* 缓存 */}
          <Card
            title="缓存"
            desc="影片元数据与封面图的本地缓存，可以放到任意磁盘（例如空间更大的数据盘）。"
          >
            <Row label="存放位置" hint="留空使用默认位置；修改后已有的元数据缓存会自动迁移">
              <div className="flex gap-2">
                <input
                  className="field"
                  value={draft.cacheDir}
                  placeholder={cache?.dir ?? '默认位置'}
                  onChange={(e) => patch({ cacheDir: e.target.value })}
                  onBlur={() => void commit({ cacheDir: draft.cacheDir })}
                />
                <button
                  className="btn-outline shrink-0"
                  onClick={async () => {
                    const dir = await call(window.api.settings.pickDir('选择缓存存放位置'))
                    if (dir) {
                      patch({ cacheDir: dir })
                      await commit({ cacheDir: dir })
                      toast('ok', '缓存位置已更新（封面图缓存在重启后生效）')
                    }
                  }}
                >
                  <IconFolder width={13} height={13} /> 选择
                </button>
                {!!draft.cacheDir && (
                  <button
                    className="btn-ghost shrink-0"
                    onClick={async () => {
                      patch({ cacheDir: '' })
                      await commit({ cacheDir: '' })
                      toast('ok', '已恢复默认缓存位置')
                    }}
                  >
                    恢复默认
                  </button>
                )}
              </div>
            </Row>

            <Row label="当前缓存">
              <div className="flex w-full items-center gap-3">
                <span className="text-[12px] text-slate-400">
                  {cache ? `${cache.movies} 部影片 · ${formatBytes(cache.bytes)}` : '读取中…'}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[11px] text-slate-600"
                  title={cache?.file}
                >
                  {cache?.file}
                </span>
                <button
                  className="btn-ghost shrink-0 hover:text-rose-400"
                  onClick={async () => {
                    const info = await call(window.api.cache.clear())
                    setCache(info)
                    toast('ok', '元数据缓存已清空')
                  }}
                >
                  <IconTrash width={13} height={13} /> 清空
                </button>
              </div>
            </Row>

            <Row label="缓存有效期" hint="超过该时长会重新抓取；离线时仍会回退到旧缓存">
              <div className="flex items-center gap-2">
                <input
                  className="field w-24"
                  value={String(draft.cacheTtlHours)}
                  onChange={(e) => patch({ cacheTtlHours: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                  onBlur={() => void commit({ cacheTtlHours: draft.cacheTtlHours })}
                />
                <span className="text-[12px] text-slate-500">小时（0 表示永久有效）</span>
              </div>
            </Row>
          </Card>

          <p className="pb-4 text-center text-[11px] leading-relaxed text-slate-600">
            本程序只做检索与本地调度，磁力资源由站点网友分享，请自行确认所下载内容的合法性。
            <br />
            抓取带并发与延迟限制，请勿调得过高。
          </p>
        </div>
      </div>
    </div>
  )
}

function Card({
  title,
  desc,
  children
}: {
  title: string
  desc?: string
  children: ReactNode
}): JSX.Element {
  return (
    <section className="panel p-5">
      <h3 className="text-[14px] font-semibold text-white">{title}</h3>
      {desc && <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{desc}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="flex gap-4">
      <div className="w-[104px] shrink-0 pt-2">
        <div className="text-[12px] text-slate-300">{label}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center">{children}</div>
        {hint && <p className="mt-1 text-[11px] text-slate-600">{hint}</p>}
      </div>
    </div>
  )
}

/** 与主进程 bitcomet.ts 里同一套比较规则：Windows 不分大小写，忽略分隔符方向与末尾分隔符 */
function samePath(a: string, b: string): boolean {
  const norm = (p: string): string =>
    p.replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase()
  return norm(a) === norm(b)
}
