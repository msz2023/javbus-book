<div align="center">

# JavBus Desktop

**一个把 JavBus 搬到桌面上的影片资料库客户端**
浏览 · 搜索 · 收藏 · 磁力下载（BitComet 实时进度）· 本地影片库对照 · 在线观看 · 安卓版

Electron 33 · React 18 · TypeScript · Tailwind CSS

[功能](#功能一览) · [安装与构建](#安装与构建) · [使用指南](#使用指南) · [安卓版](#安卓版) · [项目结构](#项目结构) · [常见问题](#常见问题) · [English](#english)

</div>

---

## 简介

JavBus Desktop 是一个 Windows 桌面程序，把站点上的影片列表、详情、演员、类别与磁力链接整理成本地可用的资料库界面。
它不托管任何影片资源，只做**检索与本地调度**：抓取网页、解析成结构化数据、缓存到本地，再把磁力交给你机器上的下载工具，把已下载的文件交给系统播放器。

它解决的几个实际痛点：

- 站点页面广告多、翻页慢、图片经常加载不出；桌面端走代理 + 自动补 `Referer`，封面和样品图稳定显示，还能整页批量缓存离线看。
- 磁力点了就不知道下到哪了；接入 **BitComet 远程接口**后，下载页能看到真实进度、速度、剩余时间，可暂停 / 继续 / 删除。
- 硬盘里几百部片，记不清哪部下过；扫描影片库目录、按文件名提取番号，卡片上直接打「已下载」角标，还能自动把没资料的番号补齐入库。
- 想直接看一眼；详情页一键在程序内播放窗口打开 MissAV / Jable / SupJav / Netflav 对应影片，自带三层防广告。

> 界面为深色 HUD 风格：等宽读数、青色遥测色、细网格底纹、状态灯；封面网格悬停放大、骨架屏、抽屉式详情、图片灯箱、Toast 提示。
> 截图放在 `docs/screenshots/`（欢迎补充）。

## 功能一览

| 模块 | 说明 |
|---|---|
| **浏览** | 有码 / 无码首页、导演 / 演员 / 类别 / 系列 / 制作商分页，页码与站点 1:1 对应，`←` `→` 翻页、可跳页 |
| **三种视图** | 完整图像（800×538 横版大封面不裁切）· 小图像（缩略图密排）· 详细信息（表格），`Ctrl+1/2/3` 切换；卡片宽度与界面缩放可调 |
| **搜索** | 番号 / 片名 / 演员名，可切换有码与无码范围，`/` 键快速聚焦 |
| **详情抽屉** | 封面、識別碼、發行日期、長度、導演、製作商、發行商、系列、類別、演員（带头像）、样品图灯箱；点任意标签直接跳到站内对应分页 |
| **磁力** | 名称 / 大小 / 分享日期 / 高清 / 字幕标签；一键 BitComet 下载、交给系统默认程序（迅雷等）、复制磁链 |
| **下载管理** | BitComet 三种模式（远程接口 / 仅命令行 / 系统默认程序）；远程接口模式 2 秒轮询真实进度，支持暂停 / 继续 / 删除，BitComet 里手动加的任务也会一并显示 |
| **本地影片库** | 多目录递归扫描（6 层，忽略 < 50 MB），文件名番号识别覆盖 `SSIS-001` / `ssis00001` / `FC2-PPV-1234567` / `HEYZO-2345` / `010119-001` 等；`fs.watch` 增量刷新；卡片显示「已下载」角标，可筛选已下 / 未下 |
| **自动补齐资料** | 硬盘上有文件但从未抓过资料的番号，进「已下载」页时自动按番号抓取入库（先直连详情页，404 再走搜索） |
| **本地筛选** | 对已缓存资料做 导演 ∧ 类别 ∧ 演员 ∧ 下载状态 的组合筛选，带命中计数 |
| **类别标签页** | 有码 / 无码全部类别按分组展示，点击直达 |
| **收藏夹** | 收藏未缓存的影片时后台自动抓资料入库 |
| **批量抓取** | 按页码区间把详情 + 磁力抓进本地缓存，供离线浏览与本地筛选 |
| **在线观看** | 详情页「在線觀看」区块，按番号定位 MissAV / Jable（直拼地址）与 SupJav / Netflav（搜索页），在独立会话的专用播放窗口打开：禁弹窗 + 锁站内导航 + 广告域名黑名单 |
| **本地播放** | `shell.openPath` 调系统默认播放器，卡片悬停 / 详情 / 下载页 / 本地文件列表都有入口 |
| **网络** | 代理自动探测（7897 / 7890 / 10809 / 1080…）、镜像故障转移、全局节流（默认 420 ms + 并发 3，约 2.5 req/s）、429 自动读 `Retry-After` 降速重试 |
| **缓存** | 元数据 `cache.json` 与封面磁盘缓存可放任意磁盘，改路径自动迁移 |

## 安装与构建

### 环境要求

- Windows 10 / 11（打包目标为 Windows；开发模式在 macOS / Linux 也能跑，但 BitComet 相关功能仅 Windows）
- Node.js ≥ 18（推荐 22）
- 能访问站点的代理（国内必需）

### 从源码运行

```bash
git clone https://github.com/<your-name>/javbus-desktop.git
cd javbus-desktop
npm install          # .npmrc 已配置 npmmirror 镜像，Electron 二进制走国内镜像
npm run dev          # 开发模式（热更新）
```

> **不要在 VS Code 内置终端里启动**：VS Code 会注入 `ELECTRON_RUN_AS_NODE=1`，Electron 会退化成纯 Node 进程并报
> `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`。
> 请用系统终端 / PowerShell，或先 `unset ELECTRON_RUN_AS_NODE`（PowerShell：`Remove-Item Env:ELECTRON_RUN_AS_NODE`）。

### 打包

```bash
npm run build        # 编译到 out/
npm run dist         # 免打包目录 dist/win-unpacked/（排查打包问题用）
npm run pack         # 免安装单文件 exe：dist/JavBus Desktop <版本>.exe
```

打包产物不进仓库。仓库自带 GitHub Actions 工作流（`.github/workflows/build.yml`）：**推送 `v*` 标签**即可在 GitHub 的 Windows 机器上自动打包并挂到 Releases 页面，也可以在 Actions 页手动触发只下载构件。

```bash
git tag v1.0.0 && git push origin v1.0.0
```

### 校验脚本

```bash
npm run typecheck    # TypeScript 类型检查
npm run verify       # 真实请求校验解析器（列表 / 详情 / 磁力）
npm run verify:code  # 文件名 → 番号提取规则（19 个用例，离线）
npm run verify:genre # 类别页解析
npm run verify:bc    # BitComet 接入（离线解析任务表 + 可选联网打接口）
npm run verify:fill  # 按番号补齐资料（LIB="D:\影片;E:\av" 指定目录）
```

## 使用指南

第一次启动请先到 **设置** 页：

1. **网络** — 代理模式选「自动探测」通常即可；探测不到就手动填 `http://127.0.0.1:端口`。封面图也走同一代理。
2. **下载器** — 推荐 **远程接口** 模式（需 BitComet 2.18+）：BitComet → 选项 → 远程下载 → 启用，设好端口与密码，填回设置页点「测试连接」。保存目录必须是 BitComet「下载目录」列表里的一项，设置页会把可用目录列出来直接点选，不在列表里的可一键「加入 BitComet」。
   没装 BitComet 也能用：「仅命令行」零配置但进度有延迟；「系统默认程序」把磁力交给迅雷等，进度改由影片库扫描判断。
3. **影片库** — 添加存放影片的目录（可多个）。之后卡片上的「已下载」角标、「已下载」页、本地筛选都基于它。
4. **缓存位置**（可选）— 元数据与封面缓存默认在 `%APPDATA%\javbus-desktop\data`，可挪到大容量盘。

日常使用：顶部搜索框 → 详情抽屉 → 点磁力 / 在线看 / 收藏；侧栏「类别标签」「本地筛选」「我的收藏」「已下载」「下载管理」各司其职。

### 快捷键

| 键 | 作用 |
|---|---|
| `/` | 聚焦搜索框 |
| `←` `→` | 上一页 / 下一页 |
| `F5` | 刷新当前列表 |
| `Ctrl+1` `Ctrl+2` `Ctrl+3` | 切换视图：完整图像 / 小图像 / 详细信息 |
| `Esc` | 关闭详情 / 关闭图片灯箱 |

更细的配置说明（BitComet 2.20 接口的字段坑、站点抓取的三个坑、请求间隔实测数据等）见 [docs/详细说明.md](docs/详细说明.md)。

## 安卓版

`android/` 目录是一个 **WebView 壳 APK**（Kotlin，零第三方依赖，minSdk 24），只保留**浏览 + 收藏 + 在线观看**，不含下载与本地影片库。

它复用桌面版同一套 React 界面产物，把 Electron 主进程的职责换成安卓原生实现：

| 桌面版 | 安卓版 |
|---|---|
| Electron 主进程 + undici 抓取 | `NativeBridge.kt` 原生 HTTP（绕过 WebView 跨域） |
| cheerio 解析 HTML | `android-adapter.js` 内 DOMParser（同逻辑移植，与 preload 的 `window.api` 100% 对齐） |
| JSON 文件持久化 | localStorage（缓存上限 200 条 LRU） |
| 在线观看 BrowserWindow | `PlayerActivity`（同样三层防广告） |
| webRequest 注入 Referer | `MainActivity.shouldInterceptRequest` 原生代抓图片 |
| BitComet 下载 | 不支持（磁力可交给手机上的 BT 客户端） |

用 Android Studio 打开 `android/` 目录 → **Build → Build APK(s)** 即可，产物在 `android/app/build/outputs/apk/release/`。手机需开启代理 / VPN（如 Clash for Android）。详见 [android/README.md](android/README.md)。

> 桌面版界面代码更新后，需重新生成 bundle 并覆盖 `android/app/src/main/assets/www/assets/` 下的 `bundle.js` / `styles.css`。

## 项目结构

```
src/
  main/                 Electron 主进程
    index.ts            窗口、生命周期、缓存目录重定向
    ipc.ts              全部 IPC 处理（统一 {ok, data | error} 包装）与本地组合筛选
    net.ts              站点请求：代理、镜像故障转移、全局节流、429 冷却、重试
    scraper.ts          cheerio 解析：列表 / 分页 / 详情 / 磁力 / 类别 / URL 构造
    crawler.ts          单部抓取（带缓存与离线回退）、批量抓取、按番号补齐资料
    browser-session.ts  给 Chromium 配代理 + 注入 Referer / Cookie / UA（封面能显示的关键）
    online.ts           在线观看：站点定义、独立会话播放窗、广告拦截
    bitcomet.ts         BitComet 适配：远程接口、命令行拉起、Downloads.xml、路径探测
    bitcomet-proto.ts   BitComet 协议层（接口路径、登录加密、XML 解析），不依赖 electron
    downloads.ts        任务表、进度轮询、命令行模式与外部下载器的兜底判定
    library.ts          影片库扫描、番号提取、fs.watch 增量刷新、调用播放器
    store.ts            JSON 持久化（设置 / 缓存 / 收藏 / 任务），原子写入
  preload/index.ts      contextBridge 暴露的类型化 window.api
  renderer/src/         React 界面
    pages/              Browse / Genres / Local / Downloads / Settings
    components/         MovieGrid / MovieCard / DetailDrawer / Pager / Lightbox / Sidebar / TopBar / CrawlModal / Toasts
    state.tsx           全局状态与 call() 封装
  shared/
    types.ts            主进程与界面共用类型
    code.ts             文件名 → 番号提取、番号归一化（normCode / pickByCode）
scripts/                verify-* 校验脚本
android/                安卓 WebView 壳（Kotlin + 复用桌面 bundle）
docs/                   详细说明、原始需求文档
.github/workflows/      推 tag 自动打包 Windows 便携版
```

## 技术要点

- **列表页返回 301/302 但响应体就是真实页面**：跟随跳转会落到年龄验证页，所以请求层禁用重定向直接用 3xx 的 body。
- **磁力是单独的 AJAX 接口**（`/ajax/uncledatoolsbyajax.php`），参数藏在详情页内联脚本里，必须带详情页 `Referer`，Cookie 需 `existmag=all` 才输出全部磁力。
- **番号写法不统一**（`010119_001` vs `010119-001`）：缓存、影片库索引、「已下载」判断统一按 `normCode()` 去分隔符建键。
- **BitComet 远程接口无官方文档**：协议从其自带 WebUI 前端逆向得出，单独放在 `bitcomet-proto.ts`，换版本用 `npm run verify:bc` 对真机确认。
- **窗口尺寸按工作区裁剪**：高 DPI 屏逻辑分辨率常只有物理的 2/3，写死大数字会让窗口跑出屏幕。

## 常见问题

**封面全是灰块 / 403？** 站点图片有防盗链，需要 `Referer`；程序已在主进程注入。若仍不显示，多半是代理没生效——到设置页点「探测」。

**一直 429？** 站点限速约 2.5 req/s，程序默认已在安全线内并会自动读 `Retry-After` 降速。不要把请求间隔调得比 400 ms 更小。

**BitComet 里在下，客户端显示 0%？** 通常是「保存目录」不在 BitComet 的下载目录列表里，远程接口拒绝后自动落到了命令行模式。到设置页从列表里选一个目录，或点「加入 BitComet」。

**明明有文件却没有「已下载」角标？** 检查文件名能否被识别（`npm run verify:code` 里的规则），以及文件是否 ≥ 50 MB、目录深度是否 ≤ 6 层。

## 免责声明

本项目仅供学习 Electron / React 桌面应用开发与网页解析技术之用。程序本身不存储、不分发任何影片资源；所有元数据来自公开网页，磁力链接由站点用户分享。请遵守所在地法律法规，自行确认所访问与下载内容的合法性，并勿将抓取频率调至影响站点正常运行的程度。使用本软件产生的一切后果由使用者自行承担。

## 许可证

[MIT](LICENSE)

---

## English

**JavBus Desktop** is a Windows desktop client (Electron 33 + React 18 + TypeScript + Tailwind) that turns the JavBus catalogue into a local, ad-free movie library UI. It does not host any media — it scrapes public pages, caches structured metadata locally, hands magnet links to your own downloader, and opens downloaded files with your system player.

Highlights: paginated browsing with 1:1 site page mapping and three view modes; full detail drawer (cover, cast with avatars, genres, samples lightbox); magnet table with one-click **BitComet** download and **real-time progress** via its remote API (pause / resume / delete); local library scanning with filename → code extraction and "downloaded" badges; automatic metadata back-fill for files on disk; combined local filtering (director ∧ genre ∧ actor ∧ downloaded); favourites; batch crawling for offline use; built-in **online playback** window (MissAV / Jable / SupJav / Netflav) with three-layer ad blocking; proxy auto-detect, mirror failover, global throttling with 429 back-off.

An **Android** companion (`android/`) is a zero-dependency Kotlin WebView shell that reuses the same React bundle, with the Electron main-process logic re-implemented natively (browse + favourites + online playback only).

```bash
npm install && npm run dev     # develop
npm run pack                   # portable Windows exe → dist/
```

Push a `v*` tag to build and publish a Windows release automatically via GitHub Actions. See the Chinese sections above and [docs/详细说明.md](docs/详细说明.md) for configuration details. MIT licensed; for educational use only — comply with your local laws.
