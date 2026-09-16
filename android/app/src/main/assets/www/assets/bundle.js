/** 主进程与渲染进程共用的数据结构 */
define("shared/types", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("preload/index", ["require", "exports", "electron"], function (require, exports, electron_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const call = (channel, ...args) => electron_1.ipcRenderer.invoke(channel, ...args);
    const on = (channel, cb) => {
        const listener = (_e, payload) => cb(payload);
        electron_1.ipcRenderer.on(channel, listener);
        return () => electron_1.ipcRenderer.removeListener(channel, listener);
    };
    const api = {
        settings: {
            get: () => call('settings:get'),
            save: (patch) => call('settings:save', patch),
            probeProxy: () => call('settings:probeProxy'),
            autoProxy: () => call('settings:autoProxy'),
            pickDir: (title) => call('settings:pickDir', title)
        },
        cache: {
            info: () => call('cache:info'),
            clear: () => call('cache:clear')
        },
        movies: {
            list: (query) => call('list:fetch', query),
            detail: (code, force) => call('movie:fetch', code, force),
            cached: (code) => call('movie:cached', code),
            localFilter: (filter) => call('local:filter', filter),
            /** 类别总览页（有码 / 无码） */
            genres: (uncensored) => call('genres:fetch', uncensored)
        },
        favorites: {
            list: () => call('fav:list'),
            toggle: (code) => call('fav:toggle', code)
        },
        library: {
            scan: () => call('lib:scan'),
            list: () => call('lib:list'),
            files: (code) => call('lib:files', code),
            play: (codeOrPath) => call('lib:play', codeOrPath),
            reveal: (path) => call('lib:reveal', path),
            /** 影片库里还缺资料的番号 */
            missing: () => call('lib:missing'),
            /** 按番号补齐资料入库；不传 codes 就补全部缺的 */
            fill: (codes, retryUnmatched) => call('lib:fill', codes, retryUnmatched)
        },
        downloads: {
            add: (magnet, code, forceExternal) => call('dl:add', magnet, code, forceExternal),
            list: () => call('dl:list'),
            pause: (hash) => call('dl:pause', hash),
            resume: (hash) => call('dl:resume', hash),
            remove: (hash, deleteFiles) => call('dl:remove', hash, deleteFiles),
            clearFinished: () => call('dl:clearFinished'),
            play: (hash) => call('dl:play', hash),
            openExternal: (magnet) => call('dl:openExternal', magnet),
            /** 打开 BitComet 本体（本机没装就打开它的 WebUI），返回实际走的哪条路 */
            openBitComet: (target) => call('bc:open', target),
            testBitComet: () => call('bc:test'),
            /** 扫本机端口找 BitComet 远程接口，返回 http://127.0.0.1:<port> */
            probeBitComet: () => call('bc:probe'),
            /** 自动探测到的 BitComet.exe 与 Downloads.xml 路径 */
            detectBitComet: () => call('bc:detect'),
            /** BitComet 的下载目录列表（save_folder 只接受列表内的目录） */
            bcFolders: (force) => call('bc:folders', force),
            /** 把目录加进 BitComet 的下载目录列表 */
            bcAddFolder: (path) => call('bc:addFolder', path)
        },
        online: {
            /** 可用的在线播放站点（按番号一一对应） */
            sites: () => call('online:sites'),
            /** 在程序内的播放窗口打开该番号的在线观看页，返回实际地址 */
            open: (code, siteId) => call('online:open', code, siteId)
        },
        crawl: {
            start: (query, from, to) => call('crawl:start', query, from, to),
            cancel: () => call('crawl:cancel'),
            progress: () => call('crawl:progress')
        },
        util: {
            copy: (text) => call('app:copy', text),
            openUrl: (url) => call('app:openUrl', url),
            /** 界面缩放，返回实际生效的比例（会夹到 0.7 ~ 2） */
            zoom: (scale) => call('app:zoom', scale)
        },
        events: {
            onDownloads: (cb) => on('downloads:update', cb),
            onLibrary: (cb) => on('library:update', cb),
            onCrawl: (cb) => on('crawl:progress', cb),
            /** 收藏的影片资料后台抓取完成（收藏页需要刷新一次才能显示） */
            onFavHydrated: (cb) => on('fav:hydrated', cb)
        }
    };
    electron_1.contextBridge.exposeInMainWorld('api', api);
});
define("renderer/src/lib/format", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.THUMB_RATIO = exports.COVER_RATIO = void 0;
    exports.formatBytes = formatBytes;
    exports.formatSpeed = formatSpeed;
    exports.formatEta = formatEta;
    exports.stateText = stateText;
    exports.coverUrl = coverUrl;
    exports.formatPercent = formatPercent;
    exports.formatDate = formatDate;
    function formatBytes(n) {
        if (!n || n < 0)
            return '-';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        let v = n;
        while (v >= 1024 && i < units.length - 1) {
            v /= 1024;
            i++;
        }
        return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)}${units[i]}`;
    }
    function formatSpeed(n) {
        return n > 0 ? `${formatBytes(n)}/s` : '—';
    }
    function formatEta(sec) {
        if (!sec || sec <= 0 || sec >= 8640000)
            return '—';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h)
            return `${h}小时${m}分`;
        if (m)
            return `${m}分${s}秒`;
        return `${s}秒`;
    }
    /** BitComet 的状态字符串大小写不统一，查表时统一转小写 */
    const STATE_TEXT = {
        downloading: '下载中',
        running: '下载中',
        metadl: '获取元数据',
        stopped: '已暂停',
        paused: '已暂停',
        suspended: '已暂停',
        seeding: '做种中',
        uploading: '做种中',
        checking: '校验中',
        hashing: '校验中',
        connecting: '连接中',
        stalled: '等待做种者',
        finished: '已完成',
        completed: '已完成',
        error: '出错',
        failed: '出错',
        missingfiles: '文件丢失',
        moving: '移动中',
        queued: '已提交',
        waiting: '排队中',
        external: '已交给外部下载器',
        unknown: '未知'
    };
    function stateText(state) {
        var _a;
        return (_a = STATE_TEXT[state === null || state === void 0 ? void 0 : state.toLowerCase()]) !== null && _a !== void 0 ? _a : state;
    }
    /**
     * 站点上同一张封面有两个尺寸：
     *   缩略图 /pics/thumb/<id>.jpg     约 147×200，竖版，只有正面
     *   大封面 /pics/cover/<id>_b.jpg   约 800×538，横版，正反面完整
     *
     * 列表页给的是缩略图，放到 200px 以上的卡片里必然发虚，所以「完整图像」模式
     * 要自己换成大封面。反过来密排小图时用缩略图，省流量也省解码。
     */
    function coverUrl(url, want) {
        if (!url)
            return url;
        if (want === 'cover') {
            return url.replace(/\/pics\/thumb\/([^/?#]+?)(\.[a-z]+)$/i, '/pics/cover/$1_b$2');
        }
        return url.replace(/\/pics\/cover\/([^/?#]+?)_b(\.[a-z]+)$/i, '/pics/thumb/$1$2');
    }
    /** 大封面是横版（含正反面），缩略图是竖版，卡片比例得跟着变 */
    exports.COVER_RATIO = '3 / 2';
    exports.THUMB_RATIO = '147 / 200';
    function formatPercent(p) {
        const v = Math.max(0, Math.min(1, p)) * 100;
        return `${v >= 99.95 ? '100' : v.toFixed(1)}%`;
    }
    function formatDate(ts) {
        const d = new Date(ts);
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
});
define("shared/code", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractCode = extractCode;
    exports.normCode = normCode;
    exports.pickByCode = pickByCode;
    /**
     * 从文件名/目录名提取番号（纯函数，主进程与校验脚本共用）。
     *
     * 覆盖的命名形态：
     *   SSIS-001 / ssis00001 / SSIS-001-C / ABF-377 [1080p] / [SONE-099]
     *   300MIUM-899 / 259LUXU-1234 / 200GANA-2712  ← 带数字前缀的厂牌，站点番号本身就含前缀
     *   FC2-PPV-1234567 / FC2PPV-1234567
     *   HEYZO-2345
     *   010119-001（加勒比、一本道等按日期编号的无码片）
     */
    function extractCode(fileName) {
        var _a;
        const base = (_a = fileName.replace(/\\/g, '/').split('/').pop()) !== null && _a !== void 0 ? _a : fileName;
        const name = base
            .replace(/\.[a-z0-9]{2,5}$/i, '')
            .toUpperCase()
            .replace(/[_\s]+/g, '-');
        const fc2 = name.match(/FC2[-]?(?:PPV[-]?)?(\d{5,8})/);
        if (fc2)
            return `FC2-PPV-${fc2[1]}`;
        const heyzo = name.match(/HEYZO-?(\d{3,5})/);
        if (heyzo)
            return `HEYZO-${heyzo[1]}`;
        // 带数字前缀的厂牌：300MIUM-899、259LUXU-1234
        const prefixed = name.match(/(?<![0-9A-Z])(\d{2,4}[A-Z]{2,6})-?(\d{2,5})(?![0-9])/);
        if (prefixed)
            return `${prefixed[1]}-${normalizeNumber(prefixed[2])}`;
        // 日期式编号：010119-001
        const dated = name.match(/(?<![0-9A-Z])(\d{6})-(\d{2,3})(?![0-9])/);
        if (dated)
            return `${dated[1]}-${dated[2]}`;
        // 标准番号：字母 2~6 位 + 数字 2~5 位
        const std = name.match(/(?<![0-9A-Z])([A-Z]{2,6})-?(\d{2,5})(?![0-9])/);
        if (std && !NON_LABEL.has(std[1]))
            return `${std[1]}-${normalizeNumber(std[2])}`;
        return null;
    }
    /** 番号比较用：去掉横线、空格等分隔符，抹平大小写 */
    function normCode(code) {
        return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    /**
     * 从一批影片里挑与目标番号最贴合的一条：先精确匹配，再退到前缀匹配。
     *
     * 前缀匹配是为了「本地番号 → 站点番号」多出后缀的情况（搜 SONE-099 命中 SONE-099-C 之类），
     * 反过来不成立，所以不做双向 startsWith。
     */
    function pickByCode(items, code) {
        var _a, _b;
        const want = normCode(code);
        return ((_b = (_a = items.find((it) => normCode(it.code) === want)) !== null && _a !== void 0 ? _a : items.find((it) => normCode(it.code).startsWith(want))) !== null && _b !== void 0 ? _b : null);
    }
    /** 常见的非番号英文词，避免把普通影片名误判成番号 */
    const NON_LABEL = new Set([
        'MOVIE',
        'VIDEO',
        'PART',
        'DISC',
        'VOL',
        'CD',
        'EP',
        'S',
        'SEASON',
        'HD',
        'FHD',
        'UHD',
        'BDRIP',
        'WEBRIP',
        'X',
        'H',
        'AAC',
        'MP',
        'AVC',
        'HEVC'
    ]);
    /** ssis00001 → 001；SSIS-1 → 001 */
    function normalizeNumber(num) {
        const trimmed = num.length > 3 ? num.replace(/^0+(?=\d{3})/, '') : num;
        return trimmed.padStart(3, '0');
    }
});
define("renderer/src/state", ["require", "exports", "react"], function (require, exports, react_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.useApp = useApp;
    exports.AppProvider = AppProvider;
    const Ctx = (0, react_1.createContext)(null);
    function useApp() {
        const ctx = (0, react_1.useContext)(Ctx);
        if (!ctx)
            throw new Error('useApp 必须在 AppProvider 内使用');
        return ctx;
    }
    const HOME = { kind: 'browse', query: { kind: 'home', page: 1 } };
    function AppProvider({ children }) {
        var _a;
        const [stack, setStack] = (0, react_1.useState)([HOME]);
        const [settings, setSettings] = (0, react_1.useState)(null);
        const [favorites, setFavorites] = (0, react_1.useState)([]);
        const [downloaded, setDownloaded] = (0, react_1.useState)(new Set());
        const [tasks, setTasks] = (0, react_1.useState)([]);
        const [crawl, setCrawl] = (0, react_1.useState)(null);
        const [toasts, setToasts] = (0, react_1.useState)([]);
        const [detailCode, setDetailCode] = (0, react_1.useState)(null);
        const toastId = (0, react_1.useRef)(1);
        const view = stack[stack.length - 1];
        const go = (0, react_1.useCallback)((next, opts) => {
            setDetailCode(null);
            setStack((prev) => ((opts === null || opts === void 0 ? void 0 : opts.replace) ? [...prev.slice(0, -1), next] : [...prev, next]));
        }, []);
        const back = (0, react_1.useCallback)(() => {
            setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
        }, []);
        const dismissToast = (0, react_1.useCallback)((id) => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, []);
        const toast = (0, react_1.useCallback)((kind, message, detail) => {
            const id = toastId.current++;
            setToasts((prev) => [...prev.slice(-4), { id, kind, message, detail }]);
            setTimeout(() => dismissToast(id), kind === 'err' ? 6000 : 2800);
        }, [dismissToast]);
        const call = (0, react_1.useCallback)(async (p, okMessage) => {
            try {
                const res = await p;
                if (!res.ok) {
                    toast('err', res.error, res.detail);
                    return null;
                }
                if (okMessage)
                    toast('ok', okMessage);
                return res.data;
            }
            catch (e) {
                toast('err', e instanceof Error ? e.message : String(e));
                return null;
            }
        }, [toast]);
        const reloadSettings = (0, react_1.useCallback)(async () => {
            const s = await call(window.api.settings.get());
            if (s)
                setSettings(s);
        }, [call]);
        // 界面缩放交给 Chromium 的 zoomFactor：图片、边框、字号一起缩，不会只放大字导致布局崩
        const uiScale = settings === null || settings === void 0 ? void 0 : settings.uiScale;
        (0, react_1.useEffect)(() => {
            if (uiScale)
                void window.api.util.zoom(uiScale);
        }, [uiScale]);
        const saveSettings = (0, react_1.useCallback)(async (patch) => {
            const s = await call(window.api.settings.save(patch));
            if (s)
                setSettings(s);
        }, [call]);
        const refreshLibrary = (0, react_1.useCallback)(async () => {
            const payload = await call(window.api.library.scan());
            if (payload)
                setDownloaded(new Set(payload.codes));
        }, [call]);
        const refreshTasks = (0, react_1.useCallback)(async () => {
            const list = await call(window.api.downloads.list());
            if (list)
                setTasks(list);
        }, [call]);
        const toggleFavorite = (0, react_1.useCallback)(async (code) => {
            const next = await call(window.api.favorites.toggle(code));
            if (next)
                setFavorites(next);
        }, [call]);
        (0, react_1.useEffect)(() => {
            void reloadSettings();
            void (async () => {
                const favs = await call(window.api.favorites.list());
                if (favs)
                    setFavorites(favs);
                const lib = await call(window.api.library.list());
                if (lib)
                    setDownloaded(new Set(lib.codes));
                await refreshTasks();
            })();
            const offDl = window.api.events.onDownloads((next) => setTasks(next));
            const offLib = window.api.events.onLibrary((payload) => setDownloaded(new Set(payload.codes)));
            const offCrawl = window.api.events.onCrawl((p) => setCrawl(p));
            // 收藏的影片资料在后台抓完了：换一个数组引用，触发「我的收藏」页重新加载
            const offFav = window.api.events.onFavHydrated(() => setFavorites((prev) => [...prev]));
            return () => {
                offDl();
                offLib();
                offCrawl();
                offFav();
            };
        }, [call, reloadSettings, refreshTasks]);
        const taskByCode = (0, react_1.useMemo)(() => {
            const map = new Map();
            for (const t of tasks) {
                const prev = map.get(t.code);
                // 同一番号有多个任务时，优先显示未完成的那个
                if (!prev || (prev.done && !t.done) || (!prev.done && !t.done && t.progress > prev.progress)) {
                    map.set(t.code, t);
                }
            }
            return map;
        }, [tasks]);
        const value = {
            view,
            go,
            back,
            canBack: stack.length > 1,
            settings,
            reloadSettings,
            saveSettings,
            viewMode: (_a = settings === null || settings === void 0 ? void 0 : settings.viewMode) !== null && _a !== void 0 ? _a : 'cover',
            setViewMode: (mode) => {
                // 先本地生效再落盘，切换视图不该等一次 IPC 往返
                setSettings((prev) => (prev ? { ...prev, viewMode: mode } : prev));
                void window.api.settings.save({ viewMode: mode });
            },
            cardWidth: (settings === null || settings === void 0 ? void 0 : settings.cardWidth) || 300,
            favorites,
            toggleFavorite,
            isFavorite: (code) => favorites.includes(code.toUpperCase()),
            downloaded,
            refreshLibrary,
            tasks,
            taskByCode,
            refreshTasks,
            crawl,
            toasts,
            toast,
            dismissToast,
            call,
            detailCode,
            openDetail: setDetailCode,
            closeDetail: () => setDetailCode(null)
        };
        return React.createElement(Ctx.Provider, { value: value }, children);
    }
});
define("renderer/src/components/Icons", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.IconComet = exports.IconViewDetail = exports.IconViewThumb = exports.IconViewCover = exports.IconLayers = exports.IconExternal = exports.IconSpinner = exports.IconTrash = exports.IconCheck = exports.IconClose = exports.IconChevronRight = exports.IconChevronLeft = exports.IconRefresh = exports.IconMagnet = exports.IconCopy = exports.IconFolder = exports.IconPause = exports.IconPlay = exports.IconSettings = exports.IconFilter = exports.IconDownload = exports.IconHeart = exports.IconFlame = exports.IconHome = exports.IconTag = exports.IconSearch = void 0;
    const base = (props) => ({
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        ...props
    });
    const IconSearch = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("circle", { cx: "11", cy: "11", r: "7" }),
        React.createElement("path", { d: "m20 20-3.5-3.5" })));
    exports.IconSearch = IconSearch;
    const IconTag = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M11.6 2.6H4a1.4 1.4 0 0 0-1.4 1.4v7.6a1.4 1.4 0 0 0 .41 1L11.6 21.2a1.4 1.4 0 0 0 2 0l7.6-7.6a1.4 1.4 0 0 0 0-2L12.6 3a1.4 1.4 0 0 0-1-.4Z" }),
        React.createElement("circle", { cx: "7.5", cy: "7.5", r: "1.2" })));
    exports.IconTag = IconTag;
    const IconHome = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M3 10.5 12 3l9 7.5" }),
        React.createElement("path", { d: "M5 9.5V21h14V9.5" })));
    exports.IconHome = IconHome;
    const IconFlame = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.5.5-2.5 1-3 0 2 1 3 2 3s-1-5 2-9Z" })));
    exports.IconFlame = IconFlame;
    const IconHeart = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M12 20s-7-4.6-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.6c0 4.8-7 9.4-7 9.4Z" })));
    exports.IconHeart = IconHeart;
    const IconDownload = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M12 4v10" }),
        React.createElement("path", { d: "m8 11 4 4 4-4" }),
        React.createElement("path", { d: "M5 19h14" })));
    exports.IconDownload = IconDownload;
    const IconFilter = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M4 6h16" }),
        React.createElement("path", { d: "M7 12h10" }),
        React.createElement("path", { d: "M10 18h4" })));
    exports.IconFilter = IconFilter;
    const IconSettings = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("circle", { cx: "12", cy: "12", r: "3" }),
        React.createElement("path", { d: "M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2A1.6 1.6 0 0 0 7.5 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.7-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10.2 3.6V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z" })));
    exports.IconSettings = IconSettings;
    const IconPlay = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M8 5.5 18 12 8 18.5Z", fill: "currentColor", stroke: "none" })));
    exports.IconPlay = IconPlay;
    const IconPause = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("rect", { x: "7", y: "5", width: "3.5", height: "14", rx: "1", fill: "currentColor", stroke: "none" }),
        React.createElement("rect", { x: "13.5", y: "5", width: "3.5", height: "14", rx: "1", fill: "currentColor", stroke: "none" })));
    exports.IconPause = IconPause;
    const IconFolder = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z" })));
    exports.IconFolder = IconFolder;
    const IconCopy = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("rect", { x: "9", y: "9", width: "11", height: "11", rx: "2" }),
        React.createElement("path", { d: "M15 5H6a1 1 0 0 0-1 1v9" })));
    exports.IconCopy = IconCopy;
    const IconMagnet = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M5 4v7a7 7 0 0 0 14 0V4h-4v7a3 3 0 0 1-6 0V4Z" }),
        React.createElement("path", { d: "M5 8h4M15 8h4" })));
    exports.IconMagnet = IconMagnet;
    const IconRefresh = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M20 12a8 8 0 1 1-2.4-5.7" }),
        React.createElement("path", { d: "M20 4v5h-5" })));
    exports.IconRefresh = IconRefresh;
    const IconChevronLeft = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "m14 6-6 6 6 6" })));
    exports.IconChevronLeft = IconChevronLeft;
    const IconChevronRight = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "m10 6 6 6-6 6" })));
    exports.IconChevronRight = IconChevronRight;
    const IconClose = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M6 6l12 12M18 6 6 18" })));
    exports.IconClose = IconClose;
    const IconCheck = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "m5 13 4 4 10-10" })));
    exports.IconCheck = IconCheck;
    const IconTrash = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M4 7h16" }),
        React.createElement("path", { d: "M9 7V5h6v2" }),
        React.createElement("path", { d: "M6 7l1 13h10l1-13" })));
    exports.IconTrash = IconTrash;
    const IconSpinner = (p) => {
        var _a;
        return (React.createElement("svg", { ...base(p), className: `animate-spin ${(_a = p.className) !== null && _a !== void 0 ? _a : ''}` },
            React.createElement("path", { d: "M12 3a9 9 0 1 0 9 9" })));
    };
    exports.IconSpinner = IconSpinner;
    const IconExternal = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "M14 5h5v5" }),
        React.createElement("path", { d: "M19 5l-8 8" }),
        React.createElement("path", { d: "M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" })));
    exports.IconExternal = IconExternal;
    const IconLayers = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("path", { d: "m12 3 8 4.5-8 4.5-8-4.5Z" }),
        React.createElement("path", { d: "m4 12 8 4.5 8-4.5" }),
        React.createElement("path", { d: "m4 16.5 8 4.5 8-4.5" })));
    exports.IconLayers = IconLayers;
    // ---- 视图切换：完整图像 / 小图像 / 详细信息 ----
    const IconViewCover = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("rect", { x: "3", y: "5", width: "18", height: "14", rx: "1.5" }),
        React.createElement("path", { d: "m3 15 5-4 4 3 3-2 6 4" }),
        React.createElement("circle", { cx: "8.5", cy: "9.5", r: "1.2" })));
    exports.IconViewCover = IconViewCover;
    const IconViewThumb = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("rect", { x: "3", y: "3", width: "7", height: "8", rx: "1" }),
        React.createElement("rect", { x: "14", y: "3", width: "7", height: "8", rx: "1" }),
        React.createElement("rect", { x: "3", y: "13", width: "7", height: "8", rx: "1" }),
        React.createElement("rect", { x: "14", y: "13", width: "7", height: "8", rx: "1" })));
    exports.IconViewThumb = IconViewThumb;
    const IconViewDetail = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("rect", { x: "3", y: "4", width: "5", height: "5", rx: "1" }),
        React.createElement("rect", { x: "3", y: "15", width: "5", height: "5", rx: "1" }),
        React.createElement("path", { d: "M11 5.5h10M11 8h6M11 16.5h10M11 19h6" })));
    exports.IconViewDetail = IconViewDetail;
    /** 「打开 BitComet」用：一个彗星/流星 */
    const IconComet = (p) => (React.createElement("svg", { ...base(p) },
        React.createElement("circle", { cx: "16", cy: "8", r: "4" }),
        React.createElement("path", { d: "M13.2 10.8 4 20" }),
        React.createElement("path", { d: "M8.5 12.5 5 13.5M11.5 15.5l-1 3.5" })));
    exports.IconComet = IconComet;
});
define("renderer/src/components/Lightbox", ["require", "exports", "react", "renderer/src/components/Icons"], function (require, exports, react_2, Icons_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Lightbox = Lightbox;
    function Lightbox({ images, index, onIndex, onClose }) {
        (0, react_2.useEffect)(() => {
            const onKey = (e) => {
                if (e.key === 'Escape')
                    onClose();
                if (e.key === 'ArrowLeft' && index > 0)
                    onIndex(index - 1);
                if (e.key === 'ArrowRight' && index < images.length - 1)
                    onIndex(index + 1);
            };
            window.addEventListener('keydown', onKey, true);
            return () => window.removeEventListener('keydown', onKey, true);
        }, [index, images.length, onIndex, onClose]);
        return (React.createElement("div", { className: "fixed inset-0 z-50 grid place-items-center bg-black/90 p-8 backdrop-blur", onClick: onClose },
            React.createElement("img", { src: images[index], alt: "", className: "max-h-full max-w-full animate-fade-up rounded-lg object-contain shadow-2xl", onClick: (e) => e.stopPropagation() }),
            React.createElement("button", { className: "btn-ghost absolute right-4 top-4 h-9 w-9 !px-0", onClick: onClose },
                React.createElement(Icons_1.IconClose, { width: 18, height: 18 })),
            images.length > 1 && (React.createElement(React.Fragment, null,
                React.createElement("button", { className: "btn-ghost absolute left-4 h-11 w-11 !px-0 disabled:opacity-20", disabled: index === 0, onClick: (e) => {
                        e.stopPropagation();
                        onIndex(index - 1);
                    } },
                    React.createElement(Icons_1.IconChevronLeft, { width: 22, height: 22 })),
                React.createElement("button", { className: "btn-ghost absolute right-4 h-11 w-11 !px-0 disabled:opacity-20", disabled: index === images.length - 1, onClick: (e) => {
                        e.stopPropagation();
                        onIndex(index + 1);
                    } },
                    React.createElement(Icons_1.IconChevronRight, { width: 22, height: 22 })),
                React.createElement("div", { className: "absolute bottom-5 rounded-full bg-black/60 px-3 py-1 text-xs text-slate-300" },
                    index + 1,
                    " / ",
                    images.length)))));
    }
});
define("renderer/src/components/DetailDrawer", ["require", "exports", "react", "shared/code", "renderer/src/lib/format", "renderer/src/state", "renderer/src/components/Icons", "renderer/src/components/Lightbox"], function (require, exports, react_3, code_1, format_1, state_1, Icons_2, Lightbox_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DetailDrawer = DetailDrawer;
    function DetailDrawer() {
        var _a, _b, _c, _d, _e;
        const { detailCode, closeDetail, call, toast, go, downloaded, isFavorite, toggleFavorite, taskByCode, settings } = (0, state_1.useApp)();
        const [movie, setMovie] = (0, react_3.useState)(null);
        const [loading, setLoading] = (0, react_3.useState)(false);
        const [refreshing, setRefreshing] = (0, react_3.useState)(false);
        const [lightbox, setLightbox] = (0, react_3.useState)(null);
        const [adding, setAdding] = (0, react_3.useState)(null);
        const load = (0, react_3.useCallback)(async (code, force = false) => {
            if (force)
                setRefreshing(true);
            else
                setLoading(true);
            const data = await call(window.api.movies.detail(code, force));
            setMovie(data);
            setLoading(false);
            setRefreshing(false);
        }, [call]);
        (0, react_3.useEffect)(() => {
            if (!detailCode) {
                setMovie(null);
                return;
            }
            void load(detailCode);
        }, [detailCode, load]);
        (0, react_3.useEffect)(() => {
            const onKey = (e) => {
                if (e.key === 'Escape' && detailCode && !lightbox)
                    closeDetail();
            };
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [detailCode, closeDetail, lightbox]);
        if (!detailCode)
            return null;
        const isDownloaded = movie ? downloaded.has((0, code_1.normCode)(movie.code)) : false;
        const task = movie ? taskByCode.get(movie.code.toUpperCase()) : undefined;
        const openRef = (ref) => {
            const kindMap = {
                genre: 'genre',
                star: 'star',
                director: 'director',
                studio: 'studio',
                label: 'label',
                series: 'series'
            };
            closeDetail();
            go({
                kind: 'browse',
                query: { kind: kindMap[ref.kind], value: ref.id, label: ref.name, page: 1 }
            });
        };
        const addMagnet = async (m, forceExternal) => {
            if (!movie)
                return;
            setAdding(m.infoHash + (forceExternal ? '-x' : ''));
            const res = await call(window.api.downloads.add(m, movie.code, forceExternal));
            setAdding(null);
            if (res) {
                if (res.source === 'external')
                    toast('ok', '已交给本机默认下载工具');
                else if (res.source === 'bitcomet')
                    toast('ok', '已加进 BitComet，可在「下载管理」看实时进度');
                else if (res.error) {
                    // 远程接口不可用时自动降级了，把原因告诉用户
                    toast('info', `已用命令行交给 BitComet（远程接口不可用：${res.error}）`);
                }
                else
                    toast('ok', '已交给 BitComet，进度会稍有延迟');
            }
        };
        return (React.createElement(React.Fragment, null,
            React.createElement("div", { className: "fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm", onClick: closeDetail },
                React.createElement("div", { className: "flex h-full w-full max-w-[980px] animate-fade-up flex-col border-l border-white/10 bg-ink-900 shadow-2xl", onClick: (e) => e.stopPropagation() },
                    React.createElement("div", { className: "flex h-[54px] shrink-0 items-center gap-2 border-b border-white/5 px-4" },
                        React.createElement("span", { className: "font-mono text-[13px] font-bold tracking-wide text-accent-soft" }, (_a = movie === null || movie === void 0 ? void 0 : movie.code) !== null && _a !== void 0 ? _a : detailCode),
                        isDownloaded && (React.createElement("span", { className: "flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] text-emerald-300" },
                            React.createElement(Icons_2.IconCheck, { width: 11, height: 11 }),
                            " \u672C\u5730\u5DF2\u6709")),
                        task && !task.done && (React.createElement("span", { className: "rounded bg-accent/20 px-1.5 py-0.5 text-[11px] text-accent-soft" },
                            "\u4E0B\u8F7D\u4E2D ",
                            Math.round(task.progress * 100),
                            "%")),
                        React.createElement("div", { className: "flex-1" }),
                        React.createElement("button", { className: `${isDownloaded ? 'btn-ghost' : 'btn-primary'} h-8`, title: "\u5728\u7A0B\u5E8F\u5185\u7684\u64AD\u653E\u7A97\u53E3\u5728\u7EBF\u89C2\u770B\uFF08\u9ED8\u8BA4\u6E90\uFF09", onClick: async () => {
                                var _a;
                                const url = await call(window.api.online.open((_a = movie === null || movie === void 0 ? void 0 : movie.code) !== null && _a !== void 0 ? _a : detailCode, 'missav'));
                                if (url)
                                    toast('ok', '已在播放窗口打开在线观看');
                            } },
                            React.createElement(Icons_2.IconPlay, { width: 14, height: 14 }),
                            " \u5728\u7EBF\u770B"),
                        isDownloaded && (React.createElement("button", { className: "btn-primary h-8", onClick: async () => {
                                var _a;
                                const p = await call(window.api.library.play((_a = movie === null || movie === void 0 ? void 0 : movie.code) !== null && _a !== void 0 ? _a : detailCode));
                                if (p)
                                    toast('ok', '已调用本机播放器');
                            } },
                            React.createElement(Icons_2.IconPlay, { width: 14, height: 14 }),
                            " \u64AD\u653E")),
                        React.createElement("button", { className: `btn-ghost h-8 w-8 !px-0 ${isFavorite(detailCode) ? 'text-accent' : ''}`, title: "\u6536\u85CF", onClick: () => { var _a; return void toggleFavorite((_a = movie === null || movie === void 0 ? void 0 : movie.code) !== null && _a !== void 0 ? _a : detailCode); } },
                            React.createElement(Icons_2.IconHeart, null)),
                        React.createElement("button", { className: "btn-ghost h-8 w-8 !px-0", title: "\u91CD\u65B0\u6293\u53D6", onClick: () => void load(detailCode, true) },
                            React.createElement(Icons_2.IconRefresh, { className: refreshing ? 'animate-spin' : '' })),
                        movie && (React.createElement("button", { className: "btn-ghost h-8 w-8 !px-0", title: "\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u539F\u9875\u9762", onClick: () => void window.api.util.openUrl(movie.detailUrl) },
                            React.createElement(Icons_2.IconExternal, null))),
                        React.createElement("button", { className: "btn-ghost h-8 w-8 !px-0", title: "\u5173\u95ED (Esc)", onClick: closeDetail },
                            React.createElement(Icons_2.IconClose, null))),
                    loading || !movie ? (React.createElement("div", { className: "flex flex-1 items-center justify-center gap-2 text-slate-500" },
                        React.createElement(Icons_2.IconSpinner, { width: 18, height: 18 }),
                        " \u6B63\u5728\u6293\u53D6\u5F71\u7247\u4FE1\u606F\u2026")) : (React.createElement("div", { className: "flex-1 overflow-y-auto px-5 py-4" },
                        React.createElement("div", { className: "flex flex-col gap-5 lg:flex-row" },
                            React.createElement("button", { className: "group relative w-full shrink-0 overflow-hidden rounded-xl border border-white/10 lg:w-[420px]", onClick: () => setLightbox({ images: [movie.cover], index: 0 }) },
                                React.createElement("img", { src: movie.cover, alt: movie.code, className: "aspect-[3/2] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" })),
                            React.createElement("div", { className: "min-w-0 flex-1 space-y-3" },
                                React.createElement("h2", { className: "text-[17px] font-semibold leading-relaxed text-white" }, movie.title),
                                React.createElement("div", { className: "grid grid-cols-2 gap-y-2 text-[13px]" },
                                    React.createElement(Meta, { label: "\u8B58\u5225\u78BC", value: movie.code, mono: true }),
                                    React.createElement(Meta, { label: "\u767C\u884C\u65E5\u671F", value: movie.date }),
                                    React.createElement(Meta, { label: "\u9577\u5EA6", value: movie.length }),
                                    React.createElement(Meta, { label: "\u5C0E\u6F14", value: (_b = movie.director) === null || _b === void 0 ? void 0 : _b.name, onClick: movie.director ? () => openRef(movie.director) : undefined }),
                                    React.createElement(Meta, { label: "\u88FD\u4F5C\u5546", value: (_c = movie.studio) === null || _c === void 0 ? void 0 : _c.name, onClick: movie.studio ? () => openRef(movie.studio) : undefined }),
                                    React.createElement(Meta, { label: "\u767C\u884C\u5546", value: (_d = movie.label) === null || _d === void 0 ? void 0 : _d.name, onClick: movie.label ? () => openRef(movie.label) : undefined }),
                                    React.createElement(Meta, { label: "\u7CFB\u5217", value: (_e = movie.series) === null || _e === void 0 ? void 0 : _e.name, onClick: movie.series ? () => openRef(movie.series) : undefined })),
                                !!movie.stars.length && (React.createElement(Section, { title: `演員 (${movie.stars.length})` },
                                    React.createElement("div", { className: "flex flex-wrap gap-2" }, movie.stars.map((s) => (React.createElement("button", { key: s.id, onClick: () => openRef(s), className: "flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] py-1 pl-1 pr-3\n                              transition-colors hover:border-accent/60 hover:bg-accent/10" },
                                        s.avatar ? (React.createElement("img", { src: s.avatar, alt: s.name, className: "h-7 w-7 rounded-full object-cover" })) : (React.createElement("span", { className: "grid h-7 w-7 place-items-center rounded-full bg-ink-600 text-[10px]" }, s.name.slice(0, 1))),
                                        React.createElement("span", { className: "text-xs text-slate-200" }, s.name))))))),
                                !!movie.genres.length && (React.createElement(Section, { title: `類別 (${movie.genres.length})` },
                                    React.createElement("div", { className: "flex flex-wrap gap-1.5" }, movie.genres.map((g) => (React.createElement("button", { key: g.id, className: "chip", onClick: () => openRef(g) }, g.name)))))))),
                        !!movie.samples.length && (React.createElement(Section, { title: `样品图 (${movie.samples.length})`, className: "mt-6" },
                            React.createElement("div", { className: "grid grid-cols-5 gap-2" }, movie.samples.map((s, i) => (React.createElement("button", { key: s.thumb + i, onClick: () => setLightbox({ images: movie.samples.map((x) => x.full), index: i }), className: "overflow-hidden rounded-lg border border-white/5 transition-all hover:border-accent/50" },
                                React.createElement("img", { src: s.thumb, loading: "lazy", alt: "", className: "aspect-[3/2] w-full object-cover transition-transform duration-300 hover:scale-105" }))))))),
                        React.createElement(OnlineSection, { code: movie.code }),
                        React.createElement(Section, { title: `磁力連結 (${movie.magnets.length})`, className: "mt-6", right: (settings === null || settings === void 0 ? void 0 : settings.bc.mode) === 'webui' ? (React.createElement("span", { className: "text-[11px] text-emerald-400" }, "BitComet \u8FDC\u7A0B\u63A5\u53E3")) : (settings === null || settings === void 0 ? void 0 : settings.bc.mode) === 'exe' ? (React.createElement("span", { className: "text-[11px] text-sky-400" }, "\u4EA4\u7ED9 BitComet\uFF08\u547D\u4EE4\u884C\uFF09")) : (React.createElement("span", { className: "text-[11px] text-slate-500" }, "\u5C06\u4EA4\u7ED9\u7CFB\u7EDF\u9ED8\u8BA4\u4E0B\u8F7D\u5DE5\u5177")) }, !movie.magnets.length ? (React.createElement("p", { className: "rounded-lg border border-dashed border-white/10 py-6 text-center text-xs text-slate-500" }, "\u66AB\u6642\u6C92\u6709\u78C1\u529B\u9023\u7D50")) : (React.createElement("div", { className: "overflow-hidden rounded-xl border border-white/5" },
                            React.createElement("table", { className: "w-full text-[12px]" },
                                React.createElement("thead", { className: "bg-white/[.03] text-[11px] uppercase tracking-wide text-slate-500" },
                                    React.createElement("tr", null,
                                        React.createElement("th", { className: "px-3 py-2 text-left font-medium" }, "\u540D\u7A31"),
                                        React.createElement("th", { className: "w-20 px-2 py-2 text-right font-medium" }, "\u5927\u5C0F"),
                                        React.createElement("th", { className: "w-24 px-2 py-2 text-center font-medium" }, "\u5206\u4EAB\u65E5\u671F"),
                                        React.createElement("th", { className: "w-[176px] px-2 py-2 text-center font-medium" }, "\u64CD\u4F5C"))),
                                React.createElement("tbody", null, movie.magnets.map((m) => (React.createElement("tr", { key: m.infoHash, className: "border-t border-white/5 transition-colors hover:bg-white/[.03]" },
                                    React.createElement("td", { className: "max-w-0 px-3 py-2" },
                                        React.createElement("div", { className: "flex items-center gap-1.5" },
                                            React.createElement("span", { className: "truncate text-slate-300", title: m.name }, m.name),
                                            m.hd && (React.createElement("span", { className: "shrink-0 rounded bg-sky-500/20 px-1 text-[10px] text-sky-300" }, "\u9AD8\u6E05")),
                                            m.subtitle && (React.createElement("span", { className: "shrink-0 rounded bg-amber-500/20 px-1 text-[10px] text-amber-300" }, "\u5B57\u5E55")))),
                                    React.createElement("td", { className: "px-2 py-2 text-right font-mono text-slate-400" }, m.size || (0, format_1.formatBytes)(m.sizeBytes)),
                                    React.createElement("td", { className: "px-2 py-2 text-center text-slate-500" }, m.shareDate),
                                    React.createElement("td", { className: "px-2 py-2" },
                                        React.createElement("div", { className: "flex items-center justify-center gap-1" },
                                            React.createElement("button", { className: "btn-primary h-7 !px-2", title: (settings === null || settings === void 0 ? void 0 : settings.bc.mode) === 'off'
                                                    ? '交给系统默认下载工具'
                                                    : '用 BitComet 下载', disabled: adding === m.infoHash, onClick: () => void addMagnet(m, false) },
                                                adding === m.infoHash ? (React.createElement(Icons_2.IconSpinner, { width: 13, height: 13 })) : (React.createElement(Icons_2.IconDownload, { width: 13, height: 13 })),
                                                "\u4E0B\u8F7D"),
                                            React.createElement("button", { className: "btn-ghost h-7 w-7 !px-0", title: "\u7528\u7CFB\u7EDF\u9ED8\u8BA4\u7A0B\u5E8F\u6253\u5F00\uFF08\u8FC5\u96F7\u7B49\uFF09", onClick: () => void addMagnet(m, true) },
                                                React.createElement(Icons_2.IconMagnet, { width: 13, height: 13 })),
                                            React.createElement("button", { className: "btn-ghost h-7 w-7 !px-0", title: "\u590D\u5236\u78C1\u529B\u94FE\u63A5", onClick: async () => {
                                                    await window.api.util.copy(m.link);
                                                    toast('ok', '磁力链接已复制');
                                                } },
                                                React.createElement(Icons_2.IconCopy, { width: 13, height: 13 })))))))))))),
                        isDownloaded && React.createElement(LocalFiles, { code: movie.code }))))),
            lightbox && (React.createElement(Lightbox_1.Lightbox, { images: lightbox.images, index: lightbox.index, onIndex: (i) => setLightbox({ ...lightbox, index: i }), onClose: () => setLightbox(null) }))));
    }
    function Meta({ label, value, mono, onClick }) {
        return (React.createElement("div", { className: "flex gap-2" },
            React.createElement("span", { className: "w-16 shrink-0 text-slate-500" }, label),
            value ? (onClick ? (React.createElement("button", { onClick: onClick, className: "truncate text-left text-accent-soft hover:text-accent hover:underline" }, value)) : (React.createElement("span", { className: `truncate text-slate-200 ${mono ? 'font-mono' : ''}` }, value))) : (React.createElement("span", { className: "text-slate-600" }, "\u2014"))));
    }
    function Section({ title, children, className, right }) {
        return (React.createElement("section", { className: className },
            React.createElement("div", { className: "mb-2 flex items-center justify-between" },
                React.createElement("h3", { className: "text-[11px] font-semibold uppercase tracking-wider text-slate-400" }, title),
                right),
            children));
    }
    /**
     * 在线观看：番号 → 各站点页面一一对应。
     * 「直達」站点（Jable / MissAV）的地址直接由番号拼出，点开即播；
     * 「搜索」站点（SupJav / Netflav）的详情页是站内 id，打开的是该番号的搜索结果页。
     */
    function OnlineSection({ code }) {
        const { call, toast } = (0, state_1.useApp)();
        const [sites, setSites] = (0, react_3.useState)([]);
        const [opening, setOpening] = (0, react_3.useState)(null);
        (0, react_3.useEffect)(() => {
            void (async () => {
                const list = await call(window.api.online.sites());
                if (list)
                    setSites(list);
            })();
        }, [call]);
        if (!sites.length)
            return null;
        return (React.createElement(Section, { title: "\u5728\u7DDA\u89C0\u770B", className: "mt-6", right: React.createElement("span", { className: "text-[11px] text-slate-500" }, "\u5728\u7A0B\u5E8F\u5185\u7684\u64AD\u653E\u7A97\u53E3\u6253\u5F00\uFF0C\u5DF2\u81EA\u52A8\u62E6\u622A\u5F39\u7A97\u5E7F\u544A") },
            React.createElement("div", { className: "flex flex-wrap gap-2" }, sites.map((s) => (React.createElement("button", { key: s.id, className: "btn-ghost h-8 gap-1.5 border border-white/10", disabled: opening === s.id, title: s.kind === 'direct'
                    ? `按番号直达 ${s.name} 对应影片页`
                    : `在 ${s.name} 内按番号搜索定位`, onClick: async () => {
                    setOpening(s.id);
                    const url = await call(window.api.online.open(code, s.id));
                    setOpening(null);
                    if (url)
                        toast('ok', `已在播放窗口打开 ${s.name}`);
                } },
                opening === s.id ? (React.createElement(Icons_2.IconSpinner, { width: 13, height: 13 })) : (React.createElement(Icons_2.IconPlay, { width: 13, height: 13 })),
                s.name,
                React.createElement("span", { className: `rounded px-1 text-[10px] ${s.kind === 'direct'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-sky-500/20 text-sky-300'}` }, s.kind === 'direct' ? '直達' : '搜索')))))));
    }
    function LocalFiles({ code }) {
        const { call, toast } = (0, state_1.useApp)();
        const [files, setFiles] = (0, react_3.useState)([]);
        (0, react_3.useEffect)(() => {
            void (async () => {
                const list = await call(window.api.library.files(code));
                setFiles(list !== null && list !== void 0 ? list : []);
            })();
        }, [code, call]);
        if (!files.length)
            return null;
        return (React.createElement(Section, { title: `本地文件 (${files.length})`, className: "mt-6" },
            React.createElement("div", { className: "space-y-1.5" }, files.map((f) => (React.createElement("div", { key: f.path, className: "flex items-center gap-2 rounded-lg border border-white/5 bg-white/[.02] px-3 py-2" },
                React.createElement("span", { className: "min-w-0 flex-1 truncate text-[12px] text-slate-300", title: f.path }, f.path),
                React.createElement("span", { className: "shrink-0 font-mono text-[11px] text-slate-500" }, (0, format_1.formatBytes)(f.size)),
                React.createElement("button", { className: "btn-primary h-7 !px-2", onClick: async () => {
                        const p = await call(window.api.library.play(f.path));
                        if (p)
                            toast('ok', '已调用本机播放器');
                    } },
                    React.createElement(Icons_2.IconPlay, { width: 13, height: 13 }),
                    " \u64AD\u653E"),
                React.createElement("button", { className: "btn-ghost h-7 w-7 !px-0", title: "\u5728\u6587\u4EF6\u5939\u4E2D\u663E\u793A", onClick: () => void window.api.library.reveal(f.path) },
                    React.createElement(Icons_2.IconFolder, { width: 13, height: 13 }))))))));
    }
});
define("renderer/src/components/Sidebar", ["require", "exports", "renderer/src/state", "renderer/src/components/Icons"], function (require, exports, state_2, Icons_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Sidebar = Sidebar;
    function Sidebar() {
        const { view, go, tasks, downloaded, favorites, call, toast } = (0, state_2.useApp)();
        const running = tasks.filter((t) => !t.done).length;
        const items = [
            {
                key: 'home',
                label: '有码影片',
                icon: Icons_3.IconHome,
                view: { kind: 'browse', query: { kind: 'home', page: 1 } },
                active: (v) => v.kind === 'browse' && v.query.kind === 'home'
            },
            {
                key: 'uncensored',
                label: '无码影片',
                icon: Icons_3.IconFlame,
                view: { kind: 'browse', query: { kind: 'uncensored', page: 1 } },
                active: (v) => v.kind === 'browse' && v.query.kind === 'uncensored'
            },
            {
                key: 'genres',
                label: '类别标签',
                icon: Icons_3.IconTag,
                view: { kind: 'genres' },
                active: (v) => v.kind === 'genres' ||
                    (v.kind === 'browse' && (v.query.kind === 'genre' || v.query.kind === 'uncensored-genre'))
            },
            {
                key: 'local',
                label: '本地筛选',
                icon: Icons_3.IconFilter,
                view: { kind: 'local' },
                active: (v) => v.kind === 'local' && !v.preset
            },
            {
                key: 'fav',
                label: '我的收藏',
                icon: Icons_3.IconHeart,
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
                icon: Icons_3.IconDownload,
                view: { kind: 'downloads' },
                badge: running,
                active: (v) => v.kind === 'downloads'
            },
            {
                key: 'settings',
                label: '设置',
                icon: Icons_3.IconSettings,
                view: { kind: 'settings' },
                active: (v) => v.kind === 'settings'
            }
        ];
        return (React.createElement("aside", { className: "flex h-full w-[196px] shrink-0 flex-col border-r border-white/5 bg-ink-800/60" },
            React.createElement("div", { className: "flex items-center gap-2.5 px-4 py-4" },
                React.createElement("div", { className: "grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-deep text-sm font-bold text-white shadow-glow" }, "JB"),
                React.createElement("div", { className: "leading-tight" },
                    React.createElement("div", { className: "text-[13px] font-semibold text-white" }, "JavBus"),
                    React.createElement("div", { className: "text-[10px] uppercase tracking-widest text-slate-500" }, "Desktop"))),
            React.createElement("nav", { className: "flex-1 space-y-0.5 px-2" }, items.map((item) => {
                const on = item.active(view);
                const Icon = item.icon;
                return (React.createElement("button", { key: item.key, onClick: () => go(item.view), className: `group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all
                ${on ? 'bg-accent/15 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}` },
                    React.createElement("span", { className: on ? 'text-accent' : 'text-slate-500 group-hover:text-slate-300' },
                        React.createElement(Icon, { width: 16, height: 16 })),
                    React.createElement("span", { className: "flex-1 text-left" }, item.label),
                    !!item.badge && (React.createElement("span", { className: `rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${on ? 'bg-accent text-white' : 'bg-white/10 text-slate-300'}` }, item.badge > 999 ? '999+' : item.badge))));
            })),
            React.createElement("div", { className: "px-2 pb-2" },
                React.createElement("button", { className: "flex w-full items-center gap-2.5 rounded-md border border-data/25 bg-data/[.06] px-3 py-2\n            text-[12px] text-data transition-colors hover:border-data/50 hover:bg-data/[.12]", title: "\u5524\u8D77\u672C\u673A BitComet\uFF1B\u88C5\u5728\u522B\u7684\u673A\u5668\u4E0A\u5C31\u6253\u5F00\u5B83\u7684\u8FDC\u7A0B\u754C\u9762", onClick: async () => {
                        const how = await call(window.api.downloads.openBitComet());
                        if (how)
                            toast('ok', how === 'exe' ? '已唤起本机 BitComet' : '已打开 BitComet 远程界面');
                    } },
                    React.createElement(Icons_3.IconComet, { width: 15, height: 15 }),
                    "\u6253\u5F00 BitComet")),
            React.createElement("div", { className: "border-t border-white/[.05] px-4 py-3 text-[10px] leading-relaxed text-slate-600" },
                "\u756A\u53F7\u53EF\u7528 ",
                React.createElement("kbd", { className: "num rounded bg-white/10 px-1" }, "/"),
                " \u5FEB\u901F\u641C\u7D22 \u00B7 \u7FFB\u9875",
                ' ',
                React.createElement("kbd", { className: "num rounded bg-white/10 px-1" }, "\u2190"),
                ' ',
                React.createElement("kbd", { className: "num rounded bg-white/10 px-1" }, "\u2192"),
                React.createElement("br", null),
                "\u89C6\u56FE\u5207\u6362 ",
                React.createElement("kbd", { className: "num rounded bg-white/10 px-1" }, "Ctrl"),
                "+",
                React.createElement("kbd", { className: "num rounded bg-white/10 px-1" }, "1"),
                React.createElement("kbd", { className: "num rounded bg-white/10 px-1" }, "2"),
                React.createElement("kbd", { className: "num rounded bg-white/10 px-1" }, "3"))));
    }
    /** 侧栏「已下载」用的文件夹图标（带勾） */
    function IconFolder2(p) {
        return (React.createElement("svg", { ...p, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
            React.createElement("path", { d: "M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z" }),
            React.createElement("path", { d: "m8.5 13.5 2 2 4-4" })));
    }
});
define("renderer/src/components/Toasts", ["require", "exports", "renderer/src/state", "renderer/src/components/Icons"], function (require, exports, state_3, Icons_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Toasts = Toasts;
    function Toasts() {
        const { toasts, dismissToast } = (0, state_3.useApp)();
        return (React.createElement("div", { className: "pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] flex-col gap-2" }, toasts.map((t) => (React.createElement("div", { key: t.id, className: `pointer-events-auto animate-fade-up rounded-xl border px-3.5 py-2.5 shadow-card backdrop-blur
            ${t.kind === 'err'
                ? 'border-rose-500/30 bg-rose-950/80'
                : t.kind === 'ok'
                    ? 'border-emerald-500/30 bg-emerald-950/80'
                    : 'border-white/10 bg-ink-700/90'}` },
            React.createElement("div", { className: "flex items-start gap-2" },
                React.createElement("span", { className: `mt-0.5 ${t.kind === 'err' ? 'text-rose-400' : t.kind === 'ok' ? 'text-emerald-400' : 'text-slate-400'}` }, t.kind === 'ok' ? React.createElement(Icons_4.IconCheck, { width: 14, height: 14 }) : React.createElement(Icons_4.IconClose, { width: 14, height: 14 })),
                React.createElement("div", { className: "min-w-0 flex-1" },
                    React.createElement("p", { className: "text-[13px] leading-snug text-slate-100" }, t.message),
                    t.detail && (React.createElement("p", { className: "mt-0.5 break-all text-[11px] leading-snug text-slate-400" }, t.detail))),
                React.createElement("button", { className: "text-slate-500 transition-colors hover:text-slate-200", onClick: () => dismissToast(t.id) },
                    React.createElement(Icons_4.IconClose, { width: 13, height: 13 }))))))));
    }
});
define("renderer/src/components/CrawlModal", ["require", "exports", "react", "renderer/src/state", "renderer/src/components/Icons"], function (require, exports, react_4, state_4, Icons_5) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CrawlModal = CrawlModal;
    /**
     * 批量抓取：把指定页码区间的影片详情与磁力抓进本地缓存，
     * 之后「本地筛选」页就能对这批数据做导演/类别/演员的组合筛选。
     */
    function CrawlModal({ query, currentPage, maxKnown, onClose }) {
        const { call, crawl, toast } = (0, state_4.useApp)();
        const [from, setFrom] = (0, react_4.useState)(String(currentPage));
        const [to, setTo] = (0, react_4.useState)(String(Math.min(currentPage + 2, Math.max(maxKnown, currentPage + 2))));
        const running = !!(crawl === null || crawl === void 0 ? void 0 : crawl.running);
        // 影片库补齐资料共用同一套进度，别把它的数字当成页码进度显示
        const pageCrawl = (crawl === null || crawl === void 0 ? void 0 : crawl.kind) === 'pages' ? crawl : null;
        (0, react_4.useEffect)(() => {
            if (crawl && !crawl.running && crawl.message)
                toast('info', crawl.message);
            // 只在运行状态变化时提示
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [crawl === null || crawl === void 0 ? void 0 : crawl.running]);
        const start = async () => {
            const f = Math.max(1, parseInt(from, 10) || 1);
            const t = Math.max(f, parseInt(to, 10) || f);
            if (t - f > 50) {
                toast('err', '一次最多抓取 50 页，避免给站点造成压力');
                return;
            }
            await call(window.api.crawl.start(query, f, t));
        };
        const percent = pageCrawl && pageCrawl.totalItems > 0
            ? Math.round(((pageCrawl.doneItems + pageCrawl.failedItems) / pageCrawl.totalItems) * 100)
            : 0;
        return (React.createElement("div", { className: "fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm", onClick: onClose },
            React.createElement("div", { className: "w-[440px] animate-fade-up rounded-2xl border border-white/10 bg-ink-800 p-5 shadow-2xl", onClick: (e) => e.stopPropagation() },
                React.createElement("div", { className: "mb-4 flex items-center gap-2" },
                    React.createElement("span", { className: "text-accent" },
                        React.createElement(Icons_5.IconLayers, { width: 18, height: 18 })),
                    React.createElement("h3", { className: "flex-1 text-[15px] font-semibold text-white" }, "\u6279\u91CF\u6293\u53D6\u5165\u5E93"),
                    React.createElement("button", { className: "btn-ghost h-7 w-7 !px-0", onClick: onClose },
                        React.createElement(Icons_5.IconClose, { width: 14, height: 14 }))),
                React.createElement("p", { className: "mb-4 text-[12px] leading-relaxed text-slate-400" }, "\u6309\u9875\u7801\u533A\u95F4\u6293\u53D6\u5F53\u524D\u5217\u8868\u7684\u5F71\u7247\u8BE6\u60C5\u4E0E\u78C1\u529B\uFF0C\u5B58\u5165\u672C\u5730\u7F13\u5B58\u3002\u6293\u5B8C\u540E\u5373\u53EF\u5728\u300C\u672C\u5730\u7B5B\u9009\u300D\u91CC\u6309\u5BFC\u6F14 / \u7C7B\u522B / \u6F14\u5458\u7EC4\u5408\u7B5B\u9009\uFF0C\u4E5F\u652F\u6301\u79BB\u7EBF\u6D4F\u89C8\u3002"),
                React.createElement("div", { className: "mb-4 flex items-end gap-3" },
                    React.createElement("div", { className: "flex-1" },
                        React.createElement("label", { className: "label" }, "\u8D77\u59CB\u9875"),
                        React.createElement("input", { className: "field", value: from, disabled: running, onChange: (e) => setFrom(e.target.value.replace(/\D/g, '')) })),
                    React.createElement("span", { className: "pb-2 text-slate-500" }, "\u2192"),
                    React.createElement("div", { className: "flex-1" },
                        React.createElement("label", { className: "label" }, "\u7ED3\u675F\u9875"),
                        React.createElement("input", { className: "field", value: to, disabled: running, onChange: (e) => setTo(e.target.value.replace(/\D/g, '')) }))),
                pageCrawl && (pageCrawl.running || pageCrawl.totalItems > 0) && (React.createElement("div", { className: "mb-4 space-y-2 rounded-xl border border-white/5 bg-ink-900/60 p-3" },
                    React.createElement("div", { className: "flex items-center justify-between text-[11px] text-slate-400" },
                        React.createElement("span", null,
                            "\u7B2C ",
                            pageCrawl.currentPage,
                            " \u9875 \u00B7 \u5DF2\u5165\u5E93 ",
                            pageCrawl.doneItems,
                            pageCrawl.failedItems ? ` · 失败 ${pageCrawl.failedItems}` : '',
                            " / ",
                            pageCrawl.totalItems),
                        React.createElement("span", null,
                            percent,
                            "%")),
                    React.createElement("div", { className: "h-1.5 overflow-hidden rounded-full bg-white/10" },
                        React.createElement("div", { className: "h-full bg-gradient-to-r from-accent to-accent-soft transition-all", style: { width: `${percent}%` } })),
                    React.createElement("p", { className: "truncate text-[11px] text-slate-500" }, pageCrawl.message))),
                React.createElement("div", { className: "flex justify-end gap-2" },
                    running ? (React.createElement("button", { className: "btn-outline", onClick: () => void call(window.api.crawl.cancel()) }, "\u505C\u6B62")) : (React.createElement("button", { className: "btn-ghost", onClick: onClose }, "\u5173\u95ED")),
                    React.createElement("button", { className: "btn-primary", disabled: running, onClick: () => void start() }, running ? (React.createElement(React.Fragment, null,
                        React.createElement(Icons_5.IconSpinner, { width: 14, height: 14 }),
                        " \u6293\u53D6\u4E2D")) : ('开始抓取'))))));
    }
});
define("renderer/src/components/MovieCard", ["require", "exports", "react", "renderer/src/lib/format", "renderer/src/components/Icons"], function (require, exports, react_5, format_2, Icons_6) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MovieCard = MovieCard;
    function MovieCard({ item, mode, downloaded, task, favorite, onOpen, onToggleFav, onPlay }) {
        var _a;
        const [failed, setFailed] = (0, react_5.useState)(false);
        const full = mode === 'cover';
        const downloading = task && !task.done;
        const percent = Math.round(((_a = task === null || task === void 0 ? void 0 : task.progress) !== null && _a !== void 0 ? _a : 0) * 100);
        // 列表接口给的是 147×200 的缩略图，放到 300px 宽的卡片里必糊，
        // 「完整图像」模式换成 800×538 的大封面（正反面都在里面）
        const src = (0, format_2.coverUrl)(item.cover, full ? 'cover' : 'thumb');
        return (React.createElement("div", { className: "group relative animate-fade-up" },
            React.createElement("button", { onClick: onOpen, className: "block w-full overflow-hidden rounded-md border border-white/[.07] bg-ink-700 text-left\n          shadow-hud transition-all duration-200 hover:-translate-y-0.5 hover:border-data/40 hover:shadow-data-glow" },
                React.createElement("div", { className: "relative overflow-hidden bg-ink-600", style: { aspectRatio: full ? format_2.COVER_RATIO : format_2.THUMB_RATIO } },
                    failed ? (React.createElement("div", { className: "tag-label grid h-full w-full place-items-center" }, "NO IMAGE")) : (React.createElement("img", { src: src, alt: item.code, loading: "lazy", decoding: "async", onError: (e) => {
                            // 大封面偶尔不存在（老片只有缩略图），退回原始地址再试一次
                            const el = e.currentTarget;
                            if (full && el.src !== item.cover)
                                el.src = item.cover;
                            else
                                setFailed(true);
                        }, className: "h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" })),
                    React.createElement("div", { className: "pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/25 to-transparent" }),
                    React.createElement("div", { className: "ticks pointer-events-none absolute inset-0" }),
                    React.createElement("div", { className: "absolute left-1.5 top-1.5 flex flex-wrap gap-1" }, item.tags.slice(0, full ? 3 : 2).map((t) => (React.createElement("span", { key: t, className: "num rounded-sm border border-amber-400/25 bg-black/70 px-1 py-[1px] text-[10px]\n                  font-medium text-amber-300 backdrop-blur-sm" }, t)))),
                    React.createElement("div", { className: "absolute right-1.5 top-1.5 flex flex-col items-end gap-1" },
                        downloaded && (React.createElement("span", { className: "num flex items-center gap-1 rounded-sm bg-emerald-500/90 px-1 py-[1px] text-[10px] font-semibold text-white" },
                            React.createElement(Icons_6.IconCheck, { width: 10, height: 10 }),
                            " \u5DF2\u4E0B\u8F7D")),
                        downloading && (React.createElement("span", { className: "num flex items-center gap-1 rounded-sm border border-data/40 bg-black/75 px-1 py-[1px] text-[10px] font-semibold text-data backdrop-blur-sm" },
                            React.createElement("i", { className: "dot-live" }),
                            (0, format_2.formatPercent)(task.progress)))),
                    React.createElement("div", { className: "absolute inset-x-1.5 bottom-1.5" },
                        React.createElement("div", { className: "flex items-end justify-between gap-2" },
                            React.createElement("span", { className: "ident rounded-sm border border-white/10 bg-black/65 px-1.5 py-[1px] backdrop-blur-sm" }, item.code),
                            React.createElement("span", { className: "num text-[10px] text-slate-300/90" }, item.date))),
                    downloading && (React.createElement("div", { className: "absolute inset-x-0 bottom-0 h-[3px] bg-black/50" },
                        React.createElement("div", { className: "meter-fill animate-meter-flow bg-data", style: { width: `${percent}%` } })))),
                React.createElement("div", { className: "border-t border-white/[.05] px-2 py-1.5" },
                    React.createElement("p", { className: "line-clamp-2 h-[32px] text-[12px] leading-[16px] text-slate-300 group-hover:text-white", title: item.title }, item.title || item.code))),
            React.createElement("div", { className: "absolute right-1.5 top-1.5 flex translate-y-1 flex-col gap-1 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100" },
                React.createElement("button", { onClick: (e) => {
                        e.stopPropagation();
                        onToggleFav();
                    }, title: favorite ? '取消收藏' : '收藏', className: `grid h-7 w-7 place-items-center rounded-md backdrop-blur-sm transition-colors ${favorite ? 'bg-accent text-white' : 'bg-black/70 text-slate-300 hover:text-accent-soft'}` },
                    React.createElement(Icons_6.IconHeart, { width: 14, height: 14 })),
                downloaded && (React.createElement("button", { onClick: (e) => {
                        e.stopPropagation();
                        onPlay();
                    }, title: "\u7528\u672C\u673A\u64AD\u653E\u5668\u64AD\u653E", className: "grid h-7 w-7 place-items-center rounded-md bg-emerald-500/90 text-white backdrop-blur-sm hover:bg-emerald-400" },
                    React.createElement(Icons_6.IconPlay, { width: 14, height: 14 }))))));
    }
});
define("renderer/src/components/MovieGrid", ["require", "exports", "react", "shared/code", "renderer/src/lib/format", "renderer/src/state", "renderer/src/components/Icons", "renderer/src/components/MovieCard"], function (require, exports, react_6, code_2, format_3, state_5, Icons_7, MovieCard_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MovieGrid = MovieGrid;
    function MovieGrid({ items, loading, error, emptyText, onRetry }) {
        const { downloaded, taskByCode, isFavorite, toggleFavorite, openDetail, call, toast, viewMode, cardWidth } = (0, state_5.useApp)();
        // 小图像模式排得更密：站点缩略图本来就只有 147px 宽，铺太大也没意义
        const minWidth = viewMode === 'thumb' ? Math.round(cardWidth * 0.52) : cardWidth;
        const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` };
        if (loading) {
            return viewMode === 'detail' ? (React.createElement("div", { className: "space-y-1" }, Array.from({ length: 12 }).map((_, i) => (React.createElement("div", { key: i, className: "skeleton h-[54px] rounded-md" }))))) : (React.createElement("div", { className: "grid gap-3", style: gridStyle }, Array.from({ length: 18 }).map((_, i) => (React.createElement("div", { key: i, className: "overflow-hidden rounded-md border border-white/[.07]" },
                React.createElement("div", { className: "skeleton", style: { aspectRatio: viewMode === 'cover' ? '3 / 2' : '147 / 200' } }),
                React.createElement("div", { className: "space-y-1.5 p-2" },
                    React.createElement("div", { className: "skeleton h-3 w-full rounded-sm" }),
                    React.createElement("div", { className: "skeleton h-3 w-2/3 rounded-sm" })))))));
        }
        if (error) {
            return (React.createElement("div", { className: "grid place-items-center py-24 text-center" },
                React.createElement("div", { className: "max-w-md space-y-3" },
                    React.createElement("div", { className: "text-3xl" }, "\uD83D\uDD0C"),
                    React.createElement("p", { className: "text-[15px] font-medium text-white" }, error),
                    React.createElement("p", { className: "text-xs leading-relaxed text-slate-500" }, "\u7AD9\u70B9\u5728\u56FD\u5185\u901A\u5E38\u9700\u8981\u4EE3\u7406\u624D\u80FD\u8BBF\u95EE\u3002\u8BF7\u5230\u300C\u8BBE\u7F6E \u2192 \u7F51\u7EDC\u300D\u68C0\u67E5\u4EE3\u7406\u5730\u5740\uFF0C\u6216\u70B9\u4E0B\u9762\u7684\u6309\u94AE\u91CD\u8BD5\u3002"),
                    onRetry && (React.createElement("button", { className: "btn-primary mx-auto", onClick: onRetry }, "\u91CD\u65B0\u52A0\u8F7D")))));
        }
        if (!items.length) {
            return (React.createElement("div", { className: "grid place-items-center py-24 text-center text-slate-500" },
                React.createElement("div", { className: "space-y-2" },
                    React.createElement("div", { className: "text-3xl" }, "\uD83D\uDCED"),
                    React.createElement("p", { className: "text-sm" }, emptyText !== null && emptyText !== void 0 ? emptyText : '没有找到影片'))));
        }
        const shared = (item) => ({
            downloaded: downloaded.has((0, code_2.normCode)(item.code)),
            task: taskByCode.get(item.code.toUpperCase()),
            favorite: isFavorite(item.code),
            onOpen: () => openDetail(item.code),
            onToggleFav: () => void toggleFavorite(item.code),
            onPlay: async () => {
                const path = await call(window.api.library.play(item.code));
                if (path)
                    toast('ok', '已调用本机播放器');
            }
        });
        if (viewMode === 'detail') {
            return (React.createElement("div", { className: "overflow-hidden rounded-md border border-white/[.07] bg-ink-800/50" },
                React.createElement("div", { className: "flex items-center gap-3 border-b border-white/[.07] bg-ink-900/50 px-3 py-1.5" },
                    React.createElement("span", { className: "tag-label w-[34px]" }),
                    React.createElement("span", { className: "tag-label w-[104px]" }, "\u756A\u53F7"),
                    React.createElement("span", { className: "tag-label flex-1" }, "\u6807\u9898"),
                    React.createElement("span", { className: "tag-label w-[86px]" }, "\u53D1\u884C\u65E5\u671F"),
                    React.createElement("span", { className: "tag-label w-[112px]" }, "\u6807\u8BB0"),
                    React.createElement("span", { className: "tag-label w-[132px] text-right" }, "\u72B6\u6001")),
                React.createElement("div", { className: "divide-y divide-white/[.04]" }, items.map((item) => (React.createElement(MovieRow, { key: item.code + item.detailUrl, item: item, ...shared(item) }))))));
        }
        return (React.createElement("div", { className: "grid gap-3", style: gridStyle }, items.map((item) => (React.createElement(MovieCard_1.MovieCard, { key: item.code + item.detailUrl, item: item, mode: viewMode === 'cover' ? 'cover' : 'thumb', ...shared(item) })))));
    }
    /** 详细信息模式的一行：缩略图 + 全部元数据 + 下载状态，一屏能看很多部 */
    function MovieRow({ item, downloaded, task, favorite, onOpen, onToggleFav, onPlay }) {
        const [failed, setFailed] = (0, react_6.useState)(false);
        const downloading = task && !task.done;
        return (React.createElement("div", { className: "group flex items-center gap-3 px-3 py-1.5 transition-colors hover:bg-white/[.035]" },
            React.createElement("button", { onClick: onOpen, className: "shrink-0", title: "\u67E5\u770B\u8BE6\u60C5" },
                React.createElement("div", { className: "h-[46px] w-[34px] overflow-hidden rounded-sm border border-white/10 bg-ink-600" }, !failed && (React.createElement("img", { src: (0, format_3.coverUrl)(item.cover, 'thumb'), alt: "", loading: "lazy", decoding: "async", onError: () => setFailed(true), className: "h-full w-full object-cover" })))),
            React.createElement("button", { onClick: onOpen, className: "ident w-[104px] shrink-0 text-left hover:text-white" }, item.code),
            React.createElement("button", { onClick: onOpen, className: "min-w-0 flex-1 truncate text-left text-[13px] text-slate-300 hover:text-white", title: item.title }, item.title || item.code),
            React.createElement("span", { className: "num w-[86px] shrink-0 text-[11px] text-slate-500" }, item.date),
            React.createElement("div", { className: "flex w-[112px] shrink-0 flex-wrap gap-1" }, item.tags.slice(0, 2).map((t) => (React.createElement("span", { key: t, className: "num rounded-sm border border-amber-400/25 bg-amber-400/10 px-1 text-[10px] text-amber-300" }, t)))),
            React.createElement("div", { className: "flex w-[132px] shrink-0 items-center justify-end gap-1.5" }, downloaded ? (React.createElement("span", { className: "num flex items-center gap-1 text-[11px] text-emerald-400" },
                React.createElement("i", { className: "dot-done" }),
                " \u5DF2\u4E0B\u8F7D")) : downloading ? (React.createElement("span", { className: "telemetry flex items-center gap-1", title: (0, format_3.stateText)(task.state) },
                React.createElement("i", { className: "dot-live" }),
                (0, format_3.formatPercent)(task.progress),
                React.createElement("span", { className: "text-slate-500" }, (0, format_3.formatSpeed)(task.dlspeed)))) : (React.createElement("span", { className: "num text-[11px] text-slate-600" }, "\u2014"))),
            React.createElement("div", { className: "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" },
                React.createElement("button", { className: `grid h-6 w-6 place-items-center rounded ${favorite ? 'text-accent' : 'text-slate-500 hover:text-accent-soft'}`, title: favorite ? '取消收藏' : '收藏', onClick: onToggleFav },
                    React.createElement(Icons_7.IconHeart, { width: 13, height: 13 })),
                React.createElement("button", { className: `grid h-6 w-6 place-items-center rounded ${downloaded ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-700'}`, title: downloaded ? '播放' : '本地还没有这部影片', disabled: !downloaded, onClick: onPlay }, downloaded ? React.createElement(Icons_7.IconPlay, { width: 13, height: 13 }) : React.createElement(Icons_7.IconCheck, { width: 13, height: 13 })))));
    }
});
define("renderer/src/components/Pager", ["require", "exports", "react", "renderer/src/components/Icons"], function (require, exports, react_7, Icons_8) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Pager = Pager;
    /** 站点页码 1:1 映射：这里显示的页码就是网页端的页码 */
    function Pager({ pagination, onGo }) {
        const { current, pages, hasPrev, hasNext, maxKnown } = pagination;
        const [jump, setJump] = (0, react_7.useState)(String(current));
        (0, react_7.useEffect)(() => setJump(String(current)), [current]);
        if (!pages.length && !hasNext && !hasPrev)
            return null;
        const visible = (() => {
            if (pages.length)
                return pages;
            return [current];
        })();
        const submitJump = () => {
            const n = parseInt(jump, 10);
            if (Number.isFinite(n) && n >= 1 && n !== current)
                onGo(n);
            else
                setJump(String(current));
        };
        return (React.createElement("div", { className: "flex items-center justify-center gap-1.5 py-5" },
            React.createElement("button", { className: "btn-ghost h-8 w-8 !px-0", disabled: !hasPrev, onClick: () => onGo(current - 1), title: "\u4E0A\u4E00\u9875 (\u2190)" },
                React.createElement(Icons_8.IconChevronLeft, null)),
            visible[0] > 1 && (React.createElement(React.Fragment, null,
                React.createElement(PageBtn, { page: 1, current: current, onGo: onGo }),
                visible[0] > 2 && React.createElement("span", { className: "px-1 text-slate-600" }, "\u2026"))),
            visible.map((p) => (React.createElement(PageBtn, { key: p, page: p, current: current, onGo: onGo }))),
            hasNext && visible[visible.length - 1] === maxKnown && (React.createElement("span", { className: "px-1 text-slate-600" }, "\u2026")),
            React.createElement("button", { className: "btn-ghost h-8 w-8 !px-0", disabled: !hasNext, onClick: () => onGo(current + 1), title: "\u4E0B\u4E00\u9875 (\u2192)" },
                React.createElement(Icons_8.IconChevronRight, null)),
            React.createElement("div", { className: "ml-3 flex items-center gap-1.5 text-xs text-slate-500" },
                React.createElement("span", null, "\u8DF3\u81F3"),
                React.createElement("input", { value: jump, onChange: (e) => setJump(e.target.value.replace(/\D/g, '')), onKeyDown: (e) => e.key === 'Enter' && submitJump(), onBlur: submitJump, className: "w-14 rounded-md border border-white/10 bg-ink-900/70 px-2 py-1 text-center text-slate-200 focus:border-accent/60" }),
                React.createElement("span", null, "\u9875"))));
    }
    function PageBtn({ page, current, onGo }) {
        const on = page === current;
        return (React.createElement("button", { onClick: () => !on && onGo(page), className: `h-8 min-w-8 rounded-lg px-2 text-[13px] font-medium transition-colors ${on ? 'bg-accent text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}` }, page));
    }
});
define("renderer/src/components/TopBar", ["require", "exports", "react", "renderer/src/state", "renderer/src/components/Icons"], function (require, exports, react_8, state_6, Icons_9) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TopBar = TopBar;
    const VIEWS = [
        { mode: 'cover', text: '完整图像', Icon: Icons_9.IconViewCover },
        { mode: 'thumb', text: '小图像', Icon: Icons_9.IconViewThumb },
        { mode: 'detail', text: '详细信息', Icon: Icons_9.IconViewDetail }
    ];
    function TopBar({ title, subtitle, onRefresh, refreshing, onBulkCrawl, showViews }) {
        const { go, back, canBack, viewMode, setViewMode } = (0, state_6.useApp)();
        const [keyword, setKeyword] = (0, react_8.useState)('');
        const [uncensored, setUncensored] = (0, react_8.useState)(false);
        const inputRef = (0, react_8.useRef)(null);
        // 「/」聚焦搜索框；Ctrl+1/2/3 切视图
        (0, react_8.useEffect)(() => {
            const onKey = (e) => {
                var _a, _b;
                const target = e.target;
                const typing = /input|textarea/i.test((_a = target === null || target === void 0 ? void 0 : target.tagName) !== null && _a !== void 0 ? _a : '');
                if (e.key === '/' && !typing) {
                    e.preventDefault();
                    (_b = inputRef.current) === null || _b === void 0 ? void 0 : _b.focus();
                }
                if (showViews && e.ctrlKey && !e.shiftKey && ['1', '2', '3'].includes(e.key)) {
                    e.preventDefault();
                    setViewMode(VIEWS[Number(e.key) - 1].mode);
                }
            };
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [showViews, setViewMode]);
        const submit = () => {
            const kw = keyword.trim();
            if (!kw)
                return;
            go({
                kind: 'browse',
                query: {
                    kind: uncensored ? 'uncensored-search' : 'search',
                    value: kw,
                    label: kw,
                    page: 1
                }
            });
        };
        return (React.createElement("header", { className: "flex h-[62px] shrink-0 items-center gap-3 border-b border-white/5 bg-ink-800/40 px-5" },
            React.createElement("button", { className: "btn-ghost h-8 w-8 !px-0 disabled:opacity-25", title: "\u8FD4\u56DE", disabled: !canBack, onClick: back },
                React.createElement(Icons_9.IconChevronLeft, null)),
            React.createElement("div", { className: "min-w-0 flex-1" },
                React.createElement("h1", { className: "truncate text-[15px] font-semibold text-white" }, title),
                subtitle && React.createElement("p", { className: "num truncate text-[11px] text-slate-500" }, subtitle)),
            React.createElement("div", { className: "flex shrink-0 items-center gap-2" },
                showViews && (React.createElement("div", { className: "seg", role: "group", "aria-label": "\u89C6\u56FE" }, VIEWS.map(({ mode, text, Icon }, i) => (React.createElement("button", { key: mode, className: `seg-item ${viewMode === mode ? 'seg-item-on' : ''}`, title: `${text}（Ctrl+${i + 1}）`, onClick: () => setViewMode(mode) },
                    React.createElement(Icon, { width: 15, height: 15 })))))),
                React.createElement("div", { className: "flex items-center rounded-lg border border-white/10 bg-ink-900/70 focus-within:border-accent/60" },
                    React.createElement("span", { className: "pl-2.5 text-slate-500" },
                        React.createElement(Icons_9.IconSearch, null)),
                    React.createElement("input", { ref: inputRef, value: keyword, onChange: (e) => setKeyword(e.target.value), onKeyDown: (e) => {
                            if (e.key === 'Enter')
                                submit();
                            if (e.key === 'Escape')
                                e.target.blur();
                        }, placeholder: "\u641C\u7D22\u756A\u53F7 / \u7247\u540D / \u6F14\u5458", className: "w-[170px] bg-transparent px-2.5 py-1.5 text-[13px] placeholder:text-slate-500 xl:w-[240px]" }),
                    React.createElement("button", { onClick: () => setUncensored((v) => !v), title: "\u5207\u6362\u641C\u7D22\u8303\u56F4", className: `mr-1 rounded px-2 py-1 text-[11px] transition-colors ${uncensored ? 'bg-accent/20 text-accent-soft' : 'text-slate-500 hover:text-slate-300'}` }, uncensored ? '无码' : '有码')),
                React.createElement("button", { className: "btn-primary h-8", onClick: submit, disabled: !keyword.trim() }, "\u641C\u7D22"),
                onBulkCrawl && (React.createElement("button", { className: "btn-outline h-8", onClick: onBulkCrawl, title: "\u6279\u91CF\u6293\u53D6\u591A\u9875\u5165\u5E93" },
                    React.createElement(Icons_9.IconLayers, null),
                    "\u6279\u91CF\u6293\u53D6")),
                onRefresh && (React.createElement("button", { className: "btn-ghost h-8 w-8 !px-0", onClick: onRefresh, title: "\u5237\u65B0 (F5)" },
                    React.createElement(Icons_9.IconRefresh, { className: refreshing ? 'animate-spin' : '' }))))));
    }
});
define("renderer/src/pages/BrowsePage", ["require", "exports", "react", "renderer/src/components/CrawlModal", "renderer/src/components/MovieGrid", "renderer/src/components/Pager", "renderer/src/components/TopBar", "renderer/src/state"], function (require, exports, react_9, CrawlModal_1, MovieGrid_1, Pager_1, TopBar_1, state_7) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BrowsePage = BrowsePage;
    const KIND_TEXT = {
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
    };
    function BrowsePage({ query }) {
        var _a, _b;
        const { go, call, detailCode } = (0, state_7.useApp)();
        const [result, setResult] = (0, react_9.useState)(null);
        const [loading, setLoading] = (0, react_9.useState)(true);
        const [error, setError] = (0, react_9.useState)(null);
        const [showCrawl, setShowCrawl] = (0, react_9.useState)(false);
        const scroller = (0, react_9.useRef)(null);
        const load = (0, react_9.useCallback)(async () => {
            var _a;
            setLoading(true);
            setError(null);
            const res = await window.api.movies.list(query);
            if (res.ok) {
                setResult(res.data);
            }
            else {
                setError(res.error);
                setResult(null);
            }
            setLoading(false);
            (_a = scroller.current) === null || _a === void 0 ? void 0 : _a.scrollTo({ top: 0 });
        }, [query]);
        (0, react_9.useEffect)(() => {
            void load();
        }, [load]);
        const goPage = (0, react_9.useCallback)((page) => {
            if (page < 1)
                return;
            go({ kind: 'browse', query: { ...query, page } }, { replace: true });
        }, [go, query]);
        // ←/→ 翻页，F5 刷新
        (0, react_9.useEffect)(() => {
            const onKey = (e) => {
                var _a, _b;
                const typing = /input|textarea/i.test((_b = (_a = e.target) === null || _a === void 0 ? void 0 : _a.tagName) !== null && _b !== void 0 ? _b : '');
                if (typing || detailCode || showCrawl)
                    return;
                if (e.key === 'ArrowLeft' && (result === null || result === void 0 ? void 0 : result.pagination.hasPrev))
                    goPage(query.page - 1);
                if (e.key === 'ArrowRight' && (result === null || result === void 0 ? void 0 : result.pagination.hasNext))
                    goPage(query.page + 1);
                if (e.key === 'F5') {
                    e.preventDefault();
                    void load();
                }
            };
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [detailCode, showCrawl, result, query.page, goPage, load]);
        const label = query.label ? `${KIND_TEXT[query.kind]}：${query.label}` : KIND_TEXT[query.kind];
        const subtitle = result
            ? `第 ${query.page} 页 · 本页 ${result.items.length} 部${result.heading ? ` · ${result.heading}` : ''}`
            : `第 ${query.page} 页`;
        return (React.createElement("div", { className: "flex h-full min-w-0 flex-1 flex-col" },
            React.createElement(TopBar_1.TopBar, { title: label, subtitle: subtitle, onRefresh: () => void load(), refreshing: loading, onBulkCrawl: () => setShowCrawl(true), showViews: true }),
            React.createElement("div", { ref: scroller, className: "flex-1 overflow-y-auto px-5 py-4" },
                React.createElement(MovieGrid_1.MovieGrid, { items: (_a = result === null || result === void 0 ? void 0 : result.items) !== null && _a !== void 0 ? _a : [], loading: loading, error: error, onRetry: () => void load() }),
                result && !loading && !error && (React.createElement(Pager_1.Pager, { pagination: result.pagination, onGo: goPage }))),
            showCrawl && (React.createElement(CrawlModal_1.CrawlModal, { query: query, currentPage: query.page, maxKnown: (_b = result === null || result === void 0 ? void 0 : result.pagination.maxKnown) !== null && _b !== void 0 ? _b : query.page, onClose: () => setShowCrawl(false) }))));
    }
});
define("renderer/src/pages/DownloadsPage", ["require", "exports", "renderer/src/components/Icons", "renderer/src/components/TopBar", "renderer/src/lib/format", "renderer/src/state"], function (require, exports, Icons_10, TopBar_2, format_4, state_8) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DownloadsPage = DownloadsPage;
    function DownloadsPage() {
        const { tasks, call, toast, refreshTasks, settings, go, openDetail } = (0, state_8.useApp)();
        const active = tasks.filter((t) => !t.done);
        const finished = tasks.filter((t) => t.done);
        const totalDown = active.reduce((n, t) => n + t.dlspeed, 0);
        const totalUp = active.reduce((n, t) => { var _a; return n + ((_a = t.upspeed) !== null && _a !== void 0 ? _a : 0); }, 0);
        const openBitComet = async () => {
            const how = await call(window.api.downloads.openBitComet());
            if (how)
                toast('ok', how === 'exe' ? '已唤起本机 BitComet' : '已在浏览器打开 BitComet 远程界面');
        };
        return (React.createElement("div", { className: "flex h-full min-w-0 flex-1 flex-col" },
            React.createElement(TopBar_2.TopBar, { title: "\u4E0B\u8F7D\u7BA1\u7406", subtitle: `进行中 ${active.length} · 已完成 ${finished.length}`, onRefresh: () => void refreshTasks() }),
            React.createElement("div", { className: "grid-bg flex shrink-0 items-center gap-5 border-b border-white/[.05] bg-ink-900/40 px-5 py-2" },
                React.createElement(Readout, { label: "DOWN", value: (0, format_4.formatSpeed)(totalDown), live: totalDown > 0 }),
                React.createElement(Readout, { label: "UP", value: (0, format_4.formatSpeed)(totalUp) }),
                React.createElement(Readout, { label: "ACTIVE", value: String(active.length) }),
                React.createElement(Readout, { label: "DONE", value: String(finished.length) }),
                React.createElement("div", { className: "flex-1" }),
                React.createElement("span", { className: "tag-label truncate", title: settings === null || settings === void 0 ? void 0 : settings.bc.url }, (settings === null || settings === void 0 ? void 0 : settings.bc.mode) === 'webui' ? settings.bc.url : '本地模式'),
                React.createElement("button", { className: "btn-data h-7", onClick: () => void openBitComet(), title: "\u6253\u5F00 BitComet \u4E3B\u754C\u9762" },
                    React.createElement(Icons_10.IconComet, { width: 14, height: 14 }),
                    "\u6253\u5F00 BitComet")),
            React.createElement("div", { className: "flex-1 overflow-y-auto px-5 py-4" },
                settings && settings.bc.mode !== 'webui' && (React.createElement("div", { className: "mb-4 flex items-start gap-3 rounded-md border border-amber-500/25 bg-amber-500/[.07] px-4 py-3" },
                    React.createElement("span", { className: "mt-0.5 text-amber-400" },
                        React.createElement(Icons_10.IconDownload, { width: 16, height: 16 })),
                    React.createElement("div", { className: "flex-1 text-[12px] leading-relaxed text-amber-100/80" }, settings.bc.mode === 'exe' ? (React.createElement(React.Fragment, null, "\u5F53\u524D\u662F\u300C\u4EC5\u547D\u4EE4\u884C\u300D\u6A21\u5F0F\uFF0C\u8FDB\u5EA6\u6765\u81EA BitComet \u5B9A\u671F\u843D\u76D8\u7684\u4EFB\u52A1\u8868\uFF0C \u4F1A\u6709\u51E0\u79D2\u5230\u51E0\u5341\u79D2\u7684\u5EF6\u8FDF\uFF0C\u4E5F\u6CA1\u6CD5\u5728\u8FD9\u91CC\u6682\u505C/\u7EE7\u7EED\u3002 \u60F3\u8981\u5B9E\u65F6\u8FDB\u5EA6\uFF0C\u8BF7\u5728 BitComet \u91CC\u5F00\u542F\u300C\u8FDC\u7A0B\u4E0B\u8F7D\u300D\uFF0C\u518D\u5230\u8BBE\u7F6E\u91CC\u5207\u5230\u300C\u8FDC\u7A0B\u63A5\u53E3\u300D\u3002")) : (React.createElement(React.Fragment, null, "\u5F53\u524D\u78C1\u529B\u76F4\u63A5\u4EA4\u7ED9\u7CFB\u7EDF\u9ED8\u8BA4\u4E0B\u8F7D\u5DE5\u5177\uFF0C\u8FD9\u7C7B\u5DE5\u5177\u6CA1\u6709\u672C\u5730\u63A5\u53E3\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u771F\u5B9E\u8FDB\u5EA6\uFF1B \u7A0B\u5E8F\u53EA\u80FD\u901A\u8FC7\u626B\u63CF\u5F71\u7247\u5E93\u6765\u5224\u65AD\u662F\u5426\u4E0B\u8F7D\u5B8C\u6210\u3002\u60F3\u770B\u5230\u5B9E\u65F6\u8FDB\u5EA6\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u91CC\u6539\u7528 BitComet\u3002"))),
                    React.createElement("button", { className: "btn-outline shrink-0", onClick: () => go({ kind: 'settings' }) }, "\u53BB\u8BBE\u7F6E"))),
                !tasks.length ? (React.createElement("div", { className: "grid place-items-center py-24 text-center text-slate-500" },
                    React.createElement("div", { className: "space-y-2" },
                        React.createElement("div", { className: "text-3xl" }, "\uD83E\uDDF2"),
                        React.createElement("p", { className: "text-sm" }, "\u8FD8\u6CA1\u6709\u4E0B\u8F7D\u4EFB\u52A1\uFF0C\u53BB\u5F71\u7247\u8BE6\u60C5\u9875\u70B9\u300C\u4E0B\u8F7D\u300D\u8BD5\u8BD5"),
                        (settings === null || settings === void 0 ? void 0 : settings.bc.mode) === 'webui' && (React.createElement("p", { className: "text-[11px] text-slate-600" }, "BitComet \u91CC\u5DF2\u6709\u7684\u4EFB\u52A1\u4E5F\u4F1A\u81EA\u52A8\u51FA\u73B0\u5728\u8FD9\u91CC\uFF08\u53EF\u5728\u8BBE\u7F6E\u91CC\u5173\u6389\uFF09"))))) : (React.createElement("div", { className: "space-y-4" },
                    !!active.length && (React.createElement(Group, { title: `进行中 (${active.length})` }, active.map((t) => (React.createElement(TaskRow, { key: t.id, task: t }))))),
                    !!finished.length && (React.createElement(Group, { title: `已完成 (${finished.length})`, right: React.createElement("button", { className: "btn-ghost !py-1 !text-[11px]", onClick: async () => {
                                await call(window.api.downloads.clearFinished());
                                toast('ok', '已清理完成的任务记录');
                            } }, "\u6E05\u7406\u8BB0\u5F55") }, finished.map((t) => (React.createElement(TaskRow, { key: t.id, task: t }))))))))));
        function Readout({ label, value, live }) {
            return (React.createElement("div", { className: "flex items-baseline gap-1.5" },
                React.createElement("span", { className: "tag-label" }, label),
                React.createElement("span", { className: `num text-[13px] ${live ? 'text-data' : 'text-slate-300'}` }, value)));
        }
        function Group({ title, right, children }) {
            return (React.createElement("section", null,
                React.createElement("div", { className: "mb-2 flex items-center justify-between" },
                    React.createElement("h3", { className: "tag-label" }, title),
                    right),
                React.createElement("div", { className: "space-y-1.5" }, children)));
        }
        function TaskRow({ task }) {
            var _a;
            const percent = task.done ? 100 : Math.round(task.progress * 100);
            const paused = /paused|stopped|suspend/i.test(task.state);
            const meta = /metadl|connecting/i.test(task.state);
            /** 只有远程接口那条路能控制单个任务 */
            const controllable = task.source === 'bitcomet' && !!task.bcTaskId;
            const dotClass = task.error
                ? 'dot-err'
                : task.done
                    ? 'dot-done'
                    : paused
                        ? 'dot-idle'
                        : 'dot-live';
            return (React.createElement("div", { className: "panel grid-bg px-3 py-2" },
                React.createElement("div", { className: "flex items-center gap-2.5" },
                    React.createElement("i", { className: dotClass }),
                    task.code ? (React.createElement("button", { className: "ident shrink-0 rounded-sm bg-white/[.06] px-1.5 py-0.5 hover:bg-accent/20", onClick: () => openDetail(task.code), title: "\u67E5\u770B\u5F71\u7247\u8BE6\u60C5" }, task.code)) : (React.createElement("span", { className: "num shrink-0 rounded-sm bg-white/[.04] px-1.5 py-0.5 text-[11px] text-slate-500" }, "\u65E0\u756A\u53F7")),
                    React.createElement("p", { className: "min-w-0 flex-1 truncate text-[13px] text-slate-200", title: task.name }, task.name),
                    React.createElement("span", { className: `num shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] ${task.done
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : task.error
                                ? 'bg-rose-500/15 text-rose-300'
                                : 'bg-white/[.06] text-slate-300'}` }, task.error ? '连接异常' : (0, format_4.stateText)(task.state)),
                    task.adopted && (React.createElement("span", { className: "num shrink-0 rounded-sm border border-white/10 px-1.5 py-0.5 text-[11px] text-slate-400", title: "\u8FD9\u6761\u662F\u5728 BitComet \u91CC\u52A0\u7684\uFF0C\u672C\u7A0B\u5E8F\u81EA\u52A8\u6536\u8FDB\u6765\u7684" }, "\u5916\u90E8\u6DFB\u52A0")),
                    task.source === 'bitcomet-exe' && (React.createElement("span", { className: "num shrink-0 rounded-sm bg-sky-500/15 px-1.5 py-0.5 text-[11px] text-sky-300", title: "\u7531 BitComet \u4E0B\u8F7D\uFF0C\u8FDB\u5EA6\u8BFB\u81EA\u5B83\u7684\u4EFB\u52A1\u8868\uFF0C\u6709\u843D\u76D8\u5EF6\u8FDF" }, "\u547D\u4EE4\u884C")),
                    task.source === 'external' && (React.createElement("span", { className: "num shrink-0 rounded-sm bg-slate-500/20 px-1.5 py-0.5 text-[11px] text-slate-300", title: "\u4EA4\u7ED9\u4E86\u7CFB\u7EDF\u9ED8\u8BA4\u4E0B\u8F7D\u5DE5\u5177\uFF0C\u53EA\u80FD\u9760\u626B\u63CF\u5F71\u7247\u5E93\u5224\u65AD\u662F\u5426\u5B8C\u6210" }, "\u5916\u90E8"))),
                React.createElement("div", { className: "mt-1.5 flex items-center gap-3" },
                    React.createElement("div", { className: "meter flex-1" },
                        React.createElement("div", { className: `meter-fill ${task.done
                                ? 'bg-emerald-500'
                                : paused
                                    ? 'bg-slate-500'
                                    : meta
                                        ? 'bg-amber-500/70'
                                        : 'animate-meter-flow bg-data'}`, style: { width: `${meta && !percent ? 100 : percent}%`, opacity: meta ? 0.35 : 1 } })),
                    React.createElement("div", { className: "flex shrink-0 items-baseline gap-3" },
                        React.createElement("span", { className: `num w-[52px] text-right text-[12px] ${task.done ? 'text-emerald-400' : 'text-data'}` }, (0, format_4.formatPercent)(task.progress)),
                        React.createElement("span", { className: "num w-[130px] text-right text-[11px] text-slate-500", title: "\u5DF2\u4E0B\u8F7D / \u603B\u5927\u5C0F" },
                            (0, format_4.formatBytes)((_a = task.downloaded) !== null && _a !== void 0 ? _a : 0),
                            " / ",
                            (0, format_4.formatBytes)(task.size)),
                        React.createElement("span", { className: "num w-[74px] text-right text-[11px] text-slate-400" }, task.done ? '—' : `↓${(0, format_4.formatSpeed)(task.dlspeed)}`),
                        React.createElement("span", { className: "num w-[74px] text-right text-[11px] text-slate-600" }, task.upspeed ? `↑${(0, format_4.formatSpeed)(task.upspeed)}` : '—'),
                        React.createElement("span", { className: "num w-[76px] text-right text-[11px] text-slate-500" }, task.done ? '—' : (0, format_4.formatEta)(task.eta)),
                        React.createElement("span", { className: "num w-[46px] text-right text-[11px] text-slate-600", title: "\u8D44\u6E90\u5065\u5EB7\u5EA6" }, task.health || '—')),
                    React.createElement("div", { className: "flex shrink-0 items-center gap-0.5" },
                        controllable && !task.done && (React.createElement("button", { className: "btn-ghost h-7 w-7 !px-0", title: paused ? '继续' : '暂停', onClick: () => void call(paused
                                ? window.api.downloads.resume(task.infoHash)
                                : window.api.downloads.pause(task.infoHash)) }, paused ? React.createElement(Icons_10.IconPlay, { width: 13, height: 13 }) : React.createElement(Icons_10.IconPause, { width: 13, height: 13 }))),
                        React.createElement("button", { className: "btn-ghost h-7 w-7 !px-0", title: "\u64AD\u653E", onClick: async () => {
                                const p = await call(window.api.downloads.play(task.infoHash));
                                if (p)
                                    toast('ok', '已调用本机播放器');
                            } },
                            React.createElement(Icons_10.IconPlay, { width: 13, height: 13 })),
                        task.savePath && (React.createElement("button", { className: "btn-ghost h-7 w-7 !px-0", title: "\u6253\u5F00\u6240\u5728\u6587\u4EF6\u5939", onClick: () => void window.api.library.reveal(task.savePath) },
                            React.createElement(Icons_10.IconFolder, { width: 13, height: 13 }))),
                        React.createElement("button", { className: "btn-ghost h-7 w-7 !px-0", title: "\u590D\u5236\u78C1\u529B\u94FE\u63A5", onClick: async () => {
                                await window.api.util.copy(task.magnet);
                                toast('ok', '磁力链接已复制');
                            } },
                            React.createElement(Icons_10.IconCopy, { width: 13, height: 13 })),
                        React.createElement("button", { className: "btn-ghost h-7 w-7 !px-0 hover:text-rose-400", title: "\u5220\u9664\u4EFB\u52A1\uFF08\u4E0D\u5220\u6587\u4EF6\uFF09", onClick: () => void call(window.api.downloads.remove(task.infoHash, false)) },
                            React.createElement(Icons_10.IconTrash, { width: 13, height: 13 })))),
                task.error && (React.createElement("p", { className: "mt-1 truncate text-[11px] text-rose-300/80", title: task.error }, task.error))));
        }
    }
});
define("renderer/src/pages/GenresPage", ["require", "exports", "react", "renderer/src/components/Icons", "renderer/src/components/TopBar", "renderer/src/state"], function (require, exports, react_10, Icons_11, TopBar_3, state_9) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GenresPage = GenresPage;
    /**
     * 类别标签总览：抓站点的 /genre（有码）与 /uncensored/genre（无码），
     * 按站点原有分组展示全部标签，点击进入该类别的影片列表。
     */
    function GenresPage() {
        const { call, go } = (0, state_9.useApp)();
        const [uncensored, setUncensored] = (0, react_10.useState)(false);
        const [groups, setGroups] = (0, react_10.useState)(null);
        const [loading, setLoading] = (0, react_10.useState)(true);
        const [error, setError] = (0, react_10.useState)(null);
        const [keyword, setKeyword] = (0, react_10.useState)('');
        const load = (0, react_10.useCallback)(async (unc) => {
            setLoading(true);
            setError(null);
            const res = await call(window.api.movies.genres(unc));
            if (res)
                setGroups(res);
            else
                setError('类别列表加载失败，请检查网络 / 代理后重试');
            setLoading(false);
        }, [call]);
        (0, react_10.useEffect)(() => {
            void load(uncensored);
        }, [load, uncensored]);
        // 关键字过滤：只留名字里含关键字的标签，空组不显示
        const shown = (0, react_10.useMemo)(() => {
            if (!groups)
                return [];
            const kw = keyword.trim().toLowerCase();
            if (!kw)
                return groups;
            return groups
                .map((g) => ({ ...g, items: g.items.filter((it) => it.name.toLowerCase().includes(kw)) }))
                .filter((g) => g.items.length);
        }, [groups, keyword]);
        const total = (0, react_10.useMemo)(() => { var _a; return (_a = groups === null || groups === void 0 ? void 0 : groups.reduce((n, g) => n + g.items.length, 0)) !== null && _a !== void 0 ? _a : 0; }, [groups]);
        const openGenre = (id, name) => go({
            kind: 'browse',
            query: { kind: uncensored ? 'uncensored-genre' : 'genre', value: id, label: name, page: 1 }
        });
        return (React.createElement("div", { className: "flex h-full min-w-0 flex-1 flex-col" },
            React.createElement(TopBar_3.TopBar, { title: "\u7C7B\u522B\u6807\u7B7E", subtitle: groups ? `共 ${total} 个标签，点击进入对应影片列表` : '正在加载类别…', onRefresh: () => void load(uncensored), refreshing: loading }),
            React.createElement("div", { className: "flex items-center gap-2 border-b border-white/5 px-5 py-2.5" },
                React.createElement("div", { className: "flex overflow-hidden rounded-lg border border-white/10" }, [false, true].map((unc) => (React.createElement("button", { key: String(unc), className: `px-3 py-1.5 text-[12px] transition-colors ${uncensored === unc
                        ? 'bg-accent/20 text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`, onClick: () => setUncensored(unc) }, unc ? '无码类别' : '有码类别')))),
                React.createElement("div", { className: "relative ml-auto w-[220px]" },
                    React.createElement("span", { className: "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" },
                        React.createElement(Icons_11.IconSearch, { width: 13, height: 13 })),
                    React.createElement("input", { className: "field !pl-8", placeholder: "\u8FC7\u6EE4\u6807\u7B7E\u540D\u2026", value: keyword, onChange: (e) => setKeyword(e.target.value) }))),
            React.createElement("div", { className: "min-w-0 flex-1 overflow-y-auto px-5 py-4" }, loading ? (React.createElement("div", { className: "flex items-center justify-center gap-2 py-24 text-slate-500" },
                React.createElement(Icons_11.IconSpinner, { width: 18, height: 18 }),
                " \u6B63\u5728\u6293\u53D6\u7C7B\u522B\u5217\u8868\u2026")) : error ? (React.createElement("div", { className: "grid place-items-center py-24 text-center" },
                React.createElement("div", { className: "max-w-md space-y-3" },
                    React.createElement("div", { className: "text-3xl" }, "\uD83D\uDD0C"),
                    React.createElement("p", { className: "text-[15px] font-medium text-white" }, error),
                    React.createElement("button", { className: "btn-primary mx-auto", onClick: () => void load(uncensored) }, "\u91CD\u65B0\u52A0\u8F7D")))) : !shown.length ? (React.createElement("div", { className: "grid place-items-center py-24 text-slate-500" },
                React.createElement("p", { className: "text-sm" },
                    "\u6CA1\u6709\u5339\u914D\u300C",
                    keyword,
                    "\u300D\u7684\u6807\u7B7E"))) : (React.createElement("div", { className: "space-y-6" }, shown.map((g) => (React.createElement("section", { key: g.name },
                React.createElement("h3", { className: "mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400" },
                    g.name,
                    " ",
                    React.createElement("span", { className: "text-slate-600" },
                        "(",
                        g.items.length,
                        ")")),
                React.createElement("div", { className: "flex flex-wrap gap-1.5" }, g.items.map((it) => (React.createElement("button", { key: it.id, className: "chip", title: `浏览「${it.name}」的影片`, onClick: () => openGenre(it.id, it.name) }, it.name))))))))))));
    }
});
define("renderer/src/pages/LocalPage", ["require", "exports", "react", "renderer/src/components/MovieGrid", "renderer/src/components/TopBar", "renderer/src/state", "renderer/src/components/Icons"], function (require, exports, react_11, MovieGrid_2, TopBar_4, state_10, Icons_12) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LocalPage = LocalPage;
    const FACET_TITLE = {
        genres: '類別',
        stars: '演員',
        directors: '導演',
        studios: '製作商'
    };
    const SORTS = [
        { key: 'date-desc', text: '发行日期 ↓' },
        { key: 'date-asc', text: '发行日期 ↑' },
        { key: 'added-desc', text: '入库时间 ↓' },
        { key: 'code', text: '番号' }
    ];
    function LocalPage({ preset }) {
        const { call, downloaded, favorites, crawl, settings, toast } = (0, state_10.useApp)();
        const [missing, setMissing] = (0, react_11.useState)(null);
        const autoFired = (0, react_11.useRef)(false);
        const [result, setResult] = (0, react_11.useState)(null);
        const [loading, setLoading] = (0, react_11.useState)(true);
        const [keyword, setKeyword] = (0, react_11.useState)('');
        const [sel, setSel] = (0, react_11.useState)({
            genres: [],
            stars: [],
            directors: [],
            studios: []
        });
        const [onlyDownloaded, setOnlyDownloaded] = (0, react_11.useState)(preset === 'downloaded');
        const [onlyMissing, setOnlyMissing] = (0, react_11.useState)(false);
        const [sort, setSort] = (0, react_11.useState)('date-desc');
        (0, react_11.useEffect)(() => {
            setOnlyDownloaded(preset === 'downloaded');
            setOnlyMissing(false);
            setSel({ genres: [], stars: [], directors: [], studios: [] });
        }, [preset]);
        const filter = (0, react_11.useMemo)(() => ({
            keyword: keyword.trim() || undefined,
            genres: sel.genres,
            stars: sel.stars,
            directors: sel.directors,
            studios: sel.studios,
            onlyDownloaded,
            onlyMissing,
            favOnly: preset === 'fav',
            sort
        }), [keyword, sel, onlyDownloaded, onlyMissing, preset, sort]);
        const load = (0, react_11.useCallback)(async () => {
            setLoading(true);
            const res = await call(window.api.movies.localFilter(filter));
            setResult(res);
            setLoading(false);
        }, [call, filter]);
        (0, react_11.useEffect)(() => {
            void load();
        }, [load, downloaded, favorites]);
        const showFill = preset !== 'fav';
        const filling = (crawl === null || crawl === void 0 ? void 0 : crawl.kind) === 'library' && crawl.running;
        const refreshMissing = (0, react_11.useCallback)(async () => {
            if (!showFill)
                return;
            const res = await call(window.api.library.missing());
            if (res)
                setMissing(res);
        }, [call, showFill]);
        (0, react_11.useEffect)(() => {
            void refreshMissing();
        }, [refreshMissing, downloaded]);
        const fill = (0, react_11.useCallback)(async (retryUnmatched = false) => {
            await call(window.api.library.fill(undefined, retryUnmatched));
        }, [call]);
        // 「若发现已下载中的，则按番号搜索并缓存」——进「已下载影片」页就自动补，可在设置里关掉。
        // 「本地筛选」页只给手动按钮，不自动打请求。
        (0, react_11.useEffect)(() => {
            if (preset !== 'downloaded' || autoFired.current)
                return;
            if (!(settings === null || settings === void 0 ? void 0 : settings.autoFillLibraryMeta))
                return;
            if (!(missing === null || missing === void 0 ? void 0 : missing.pending.length) || (crawl === null || crawl === void 0 ? void 0 : crawl.running))
                return;
            autoFired.current = true;
            void fill();
        }, [preset, settings === null || settings === void 0 ? void 0 : settings.autoFillLibraryMeta, missing, crawl === null || crawl === void 0 ? void 0 : crawl.running, fill]);
        // 补齐跑完：刷新列表与缺口统计
        const wasFilling = (0, react_11.useRef)(false);
        (0, react_11.useEffect)(() => {
            if (wasFilling.current && !filling) {
                void load();
                void refreshMissing();
                if ((crawl === null || crawl === void 0 ? void 0 : crawl.kind) === 'library' && crawl.message)
                    toast('info', crawl.message);
            }
            wasFilling.current = !!filling;
            // crawl.message 只在结束时读一次，不进依赖
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [filling]);
        const items = (0, react_11.useMemo)(() => {
            var _a;
            return ((_a = result === null || result === void 0 ? void 0 : result.items) !== null && _a !== void 0 ? _a : []).map((m) => ({
                code: m.code,
                title: m.title,
                cover: m.cover,
                date: m.date,
                tags: [
                    ...(m.magnets.some((x) => x.hd) ? ['高清'] : []),
                    ...(m.magnets.some((x) => x.subtitle) ? ['字幕'] : [])
                ],
                detailUrl: m.detailUrl
            }));
        }, [result]);
        const toggle = (key, name) => setSel((prev) => ({
            ...prev,
            [key]: prev[key].includes(name) ? prev[key].filter((n) => n !== name) : [...prev[key], name]
        }));
        const activeCount = Object.values(sel).reduce((n, arr) => n + arr.length, 0);
        const title = preset === 'fav' ? '我的收藏' : preset === 'downloaded' ? '已下载影片' : '本地筛选';
        return (React.createElement("div", { className: "flex h-full min-w-0 flex-1 flex-col" },
            React.createElement(TopBar_4.TopBar, { title: title, subtitle: result
                    ? `命中 ${result.total} 部（本地缓存 ${result.items.length} 部可见）`
                    : '正在读取本地缓存…', onRefresh: () => void load(), refreshing: loading, showViews: true }),
            React.createElement("div", { className: "flex min-h-0 flex-1" },
                React.createElement("div", { className: "w-[232px] shrink-0 space-y-4 overflow-y-auto border-r border-white/5 px-3.5 py-4" },
                    React.createElement("div", null,
                        React.createElement("label", { className: "label" }, "\u5173\u952E\u5B57"),
                        React.createElement("input", { className: "field", placeholder: "\u756A\u53F7 / \u7247\u540D / \u6F14\u5458", value: keyword, onChange: (e) => setKeyword(e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", { className: "label" }, "\u6392\u5E8F"),
                        React.createElement("select", { className: "field", value: sort, onChange: (e) => setSort(e.target.value) }, SORTS.map((s) => (React.createElement("option", { key: s.key, value: s.key, className: "bg-ink-800" }, s.text))))),
                    React.createElement("div", { className: "space-y-1.5" },
                        React.createElement("label", { className: "label" }, "\u4E0B\u8F7D\u72B6\u6001"),
                        React.createElement("div", { className: "flex gap-1.5" },
                            React.createElement("button", { className: `chip flex-1 justify-center ${onlyDownloaded ? 'chip-on' : ''}`, onClick: () => {
                                    setOnlyDownloaded((v) => !v);
                                    setOnlyMissing(false);
                                } }, "\u5DF2\u4E0B\u8F7D"),
                            React.createElement("button", { className: `chip flex-1 justify-center ${onlyMissing ? 'chip-on' : ''}`, onClick: () => {
                                    setOnlyMissing((v) => !v);
                                    setOnlyDownloaded(false);
                                } }, "\u672A\u4E0B\u8F7D"))),
                    activeCount > 0 && (React.createElement("button", { className: "btn-ghost w-full", onClick: () => setSel({ genres: [], stars: [], directors: [], studios: [] }) },
                        React.createElement(Icons_12.IconRefresh, { width: 13, height: 13 }),
                        " \u6E05\u7A7A ",
                        activeCount,
                        " \u4E2A\u7B5B\u9009")),
                    ['stars', 'genres', 'directors', 'studios'].map((key) => {
                        var _a;
                        return (React.createElement(FacetBlock, { key: key, title: FACET_TITLE[key], facets: (_a = result === null || result === void 0 ? void 0 : result.facets[key]) !== null && _a !== void 0 ? _a : [], selected: sel[key], onToggle: (name) => toggle(key, name) }));
                    })),
                React.createElement("div", { className: "min-w-0 flex-1 overflow-y-auto px-5 py-4" },
                    showFill && (filling || !!(missing === null || missing === void 0 ? void 0 : missing.pending.length) || !!(missing === null || missing === void 0 ? void 0 : missing.skipped.length)) && (React.createElement(FillBanner, { missing: missing, filling: !!filling, progress: (crawl === null || crawl === void 0 ? void 0 : crawl.kind) === 'library' ? crawl : null, onFill: () => void fill(), onRetry: () => void fill(true), onStop: () => void call(window.api.crawl.cancel()) })),
                    React.createElement(MovieGrid_2.MovieGrid, { items: items, loading: loading, emptyText: preset === 'fav'
                            ? '还没有收藏，去列表里点卡片右上角的心形收藏'
                            : preset === 'downloaded'
                                ? downloaded.size === 0
                                    ? '本地库里还没有识别到影片，请到「设置」添加影片目录'
                                    : `影片库识别到 ${downloaded.size} 个番号，但它们还没有资料——点上方「补齐资料」按番号抓取`
                                : '本地缓存是空的。浏览影片详情或使用「批量抓取」即可入库' })))));
    }
    /**
     * 硬盘上有文件、但本地缓存没有资料的影片在这个页面是看不见的（筛选是拿缓存做的），
     * 所以这里直接把缺口摆出来，并提供按番号补齐的入口。
     */
    function FillBanner({ missing, filling, progress, onFill, onRetry, onStop }) {
        const percent = progress && progress.totalItems > 0
            ? Math.round(((progress.doneItems + progress.failedItems) / progress.totalItems) * 100)
            : 0;
        return (React.createElement("div", { className: "mb-4 rounded-xl border border-accent/25 bg-accent/[.07] px-4 py-3" }, filling ? (React.createElement(React.Fragment, null,
            React.createElement("div", { className: "flex items-center gap-2 text-[12px] text-slate-300" },
                React.createElement("span", { className: "text-accent" },
                    React.createElement(Icons_12.IconSpinner, { width: 13, height: 13 })),
                React.createElement("span", { className: "flex-1" },
                    "\u6B63\u5728\u6309\u756A\u53F7\u8865\u9F50\u8D44\u6599 ",
                    progress ? `${progress.doneItems + progress.failedItems}/${progress.totalItems}` : ''),
                React.createElement("span", { className: "text-slate-400" },
                    percent,
                    "%"),
                React.createElement("button", { className: "btn-ghost !py-1", onClick: onStop }, "\u505C\u6B62")),
            React.createElement("div", { className: "mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" },
                React.createElement("div", { className: "h-full bg-gradient-to-r from-accent to-accent-soft transition-all", style: { width: `${percent}%` } })),
            (progress === null || progress === void 0 ? void 0 : progress.message) && (React.createElement("p", { className: "mt-1.5 truncate text-[11px] text-slate-500" }, progress.message)))) : (React.createElement("div", { className: "flex items-center gap-3" },
            React.createElement("div", { className: "min-w-0 flex-1 text-[12px] leading-relaxed text-slate-300" },
                !!(missing === null || missing === void 0 ? void 0 : missing.pending.length) && (React.createElement("p", null,
                    "\u5F71\u7247\u5E93\u91CC\u6709 ",
                    React.createElement("span", { className: "font-semibold text-accent" }, missing.pending.length),
                    ' ',
                    "\u90E8\u5F71\u7247\u8FD8\u6CA1\u6709\u8D44\u6599\uFF0C\u8865\u9F50\u540E\u624D\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002")),
                !!(missing === null || missing === void 0 ? void 0 : missing.skipped.length) && (React.createElement("p", { className: "text-[11px] text-slate-500" },
                    "\u53E6\u6709 ",
                    missing.skipped.length,
                    " \u4E2A\u756A\u53F7\u7AD9\u70B9\u4E0A\u641C\u4E0D\u5230\uFF0C\u5DF2\u8DF3\u8FC7\uFF1A",
                    missing.skipped.slice(0, 6).join('、'),
                    missing.skipped.length > 6 ? ` 等 ${missing.skipped.length} 个` : ''))),
            !!(missing === null || missing === void 0 ? void 0 : missing.pending.length) && (React.createElement("button", { className: "btn-primary shrink-0", onClick: onFill },
                "\u8865\u9F50 ",
                missing.pending.length,
                " \u90E8\u8D44\u6599")),
            !!(missing === null || missing === void 0 ? void 0 : missing.skipped.length) && (React.createElement("button", { className: "btn-ghost shrink-0", onClick: onRetry, title: "\u8FDE\u4E4B\u524D\u641C\u4E0D\u5230\u7684\u756A\u53F7\u4E00\u8D77\u91CD\u8BD5" },
                React.createElement(Icons_12.IconRefresh, { width: 13, height: 13 }),
                " \u91CD\u8BD5\u5168\u90E8"))))));
    }
    function FacetBlock({ title, facets, selected, onToggle }) {
        const [expanded, setExpanded] = (0, react_11.useState)(false);
        if (!facets.length)
            return null;
        const shown = expanded ? facets.slice(0, 200) : facets.slice(0, 12);
        return (React.createElement("div", null,
            React.createElement("label", { className: "label" },
                title,
                " ",
                React.createElement("span", { className: "text-slate-600" },
                    "(",
                    facets.length,
                    ")")),
            React.createElement("div", { className: "flex flex-wrap gap-1.5" },
                shown.map((f) => (React.createElement("button", { key: f.name, className: `chip !px-2 !py-0.5 !text-[11px] ${selected.includes(f.name) ? 'chip-on' : ''}`, onClick: () => onToggle(f.name), title: `${f.name} · ${f.count} 部` },
                    f.name,
                    React.createElement("span", { className: "text-slate-500" }, f.count)))),
                facets.length > 12 && (React.createElement("button", { className: "chip !px-2 !py-0.5 !text-[11px] text-slate-500", onClick: () => setExpanded((v) => !v) }, expanded ? '收起' : `+${facets.length - 12}`)))));
    }
});
define("renderer/src/pages/SettingsPage", ["require", "exports", "react", "renderer/src/components/Icons", "renderer/src/components/TopBar", "renderer/src/lib/format", "renderer/src/state"], function (require, exports, react_12, Icons_13, TopBar_5, format_5, state_11) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SettingsPage = SettingsPage;
    function SettingsPage() {
        var _a, _b, _c;
        const { settings, saveSettings, call, toast, refreshLibrary, downloaded } = (0, state_11.useApp)();
        const [draft, setDraft] = (0, react_12.useState)(settings);
        const [bcTesting, setBcTesting] = (0, react_12.useState)(false);
        const [bcProbing, setBcProbing] = (0, react_12.useState)(false);
        const [bcVersion, setBcVersion] = (0, react_12.useState)(null);
        const [bcPaths, setBcPaths] = (0, react_12.useState)(null);
        const [cache, setCache] = (0, react_12.useState)(null);
        const [scanning, setScanning] = (0, react_12.useState)(false);
        const [bcFolders, setBcFolders] = (0, react_12.useState)([]);
        const [bcFolderBusy, setBcFolderBusy] = (0, react_12.useState)(false);
        (0, react_12.useEffect)(() => setDraft(settings), [settings]);
        (0, react_12.useEffect)(() => {
            void (async () => {
                setCache(await call(window.api.cache.info()));
                setBcPaths(await call(window.api.downloads.detectBitComet()));
            })();
        }, [call]);
        // BitComet 的下载目录列表：save_folder 只接受列表内的目录，所以设置页要能看到它
        const bcMode = settings === null || settings === void 0 ? void 0 : settings.bc.mode;
        (0, react_12.useEffect)(() => {
            if (bcMode !== 'webui')
                return;
            void (async () => {
                const res = await window.api.downloads.bcFolders();
                if (res.ok)
                    setBcFolders(res.data.folders);
            })();
        }, [bcMode]);
        if (!draft) {
            return (React.createElement("div", { className: "flex h-full flex-1 items-center justify-center text-slate-500" },
                React.createElement(Icons_13.IconSpinner, { width: 18, height: 18 })));
        }
        const patch = (p) => setDraft({ ...draft, ...p });
        const patchBc = (p) => setDraft({ ...draft, bc: { ...draft.bc, ...p } });
        const savePathInvalid = !!draft.bc.savePath.trim() &&
            bcFolders.length > 0 &&
            !bcFolders.some((f) => samePath(f.path, draft.bc.savePath));
        const commit = async (p) => {
            await saveSettings(p);
            setCache(await call(window.api.cache.info()));
        };
        return (React.createElement("div", { className: "flex h-full min-w-0 flex-1 flex-col" },
            React.createElement(TopBar_5.TopBar, { title: "\u8BBE\u7F6E", subtitle: "\u7F51\u7EDC \u00B7 \u4E0B\u8F7D\u5668 \u00B7 \u5F71\u7247\u5E93 \u00B7 \u7F13\u5B58" }),
            React.createElement("div", { className: "flex-1 overflow-y-auto px-5 py-4" },
                React.createElement("div", { className: "mx-auto max-w-[820px] space-y-4" },
                    React.createElement(Card, { title: "\u754C\u9762", desc: "\u5217\u8868\u600E\u4E48\u663E\u793A\u3001\u6574\u4F53\u7F29\u653E\u591A\u5927\u3002\u89C6\u56FE\u4E5F\u53EF\u4EE5\u5728\u5217\u8868\u9875\u53F3\u4E0A\u89D2\u76F4\u63A5\u5207\uFF08Ctrl+1/2/3\uFF09\u3002" },
                        React.createElement(Row, { label: "\u9ED8\u8BA4\u89C6\u56FE", hint: "\u5B8C\u6574\u56FE\u50CF\u7528\u7AD9\u70B9\u5927\u5C01\u9762\uFF08\u6B63\u53CD\u9762\uFF0C800\u00D7538\uFF09\uFF1B\u5C0F\u56FE\u50CF\u7528\u7F29\u7565\u56FE\uFF0C\u5BC6\u6392\u66F4\u7701\u5730\u65B9\uFF1B\u8BE6\u7EC6\u4FE1\u606F\u662F\u4E00\u884C\u4E00\u90E8\u7684\u8868\u683C" },
                            React.createElement("div", { className: "flex gap-1.5" }, [
                                ['cover', '完整图像'],
                                ['thumb', '小图像'],
                                ['detail', '详细信息']
                            ].map(([mode, text]) => (React.createElement("button", { key: mode, className: `chip ${draft.viewMode === mode ? 'chip-on' : ''}`, onClick: () => {
                                    patch({ viewMode: mode });
                                    void commit({ viewMode: mode });
                                } },
                                text,
                                draft.viewMode === mode && React.createElement(Icons_13.IconCheck, { width: 12, height: 12 })))))),
                        React.createElement(Row, { label: "\u5361\u7247\u5BBD\u5EA6", hint: "\u6BCF\u884C\u653E\u51E0\u4E2A\u7531\u5B83\u51B3\u5B9A\uFF1B\u5C0F\u56FE\u50CF\u6A21\u5F0F\u4F1A\u81EA\u52A8\u6309\u4E00\u534A\u5BBD\u5EA6\u6392" },
                            React.createElement("div", { className: "flex w-full items-center gap-3" },
                                React.createElement("input", { type: "range", min: 200, max: 480, step: 20, value: draft.cardWidth, onChange: (e) => patch({ cardWidth: Number(e.target.value) }), onMouseUp: () => void commit({ cardWidth: draft.cardWidth }), className: "h-1 flex-1 accent-[#38e0d0]" }),
                                React.createElement("span", { className: "num w-[64px] text-right text-[12px] text-data" },
                                    draft.cardWidth,
                                    "px"))),
                        React.createElement(Row, { label: "\u754C\u9762\u7F29\u653E", hint: "\u5ACC\u5B57\u5C0F\u3001\u5143\u7D20\u5C0F\u5C31\u5F80\u53F3\u62C9\u3002\u8D70 Chromium \u7684\u9875\u9762\u7F29\u653E\uFF0C\u56FE\u7247\u548C\u8FB9\u6846\u4F1A\u4E00\u8D77\u653E\u5927\uFF0C\u4E0D\u4F1A\u53EA\u53D8\u5B57\u53F7" },
                            React.createElement("div", { className: "flex w-full items-center gap-3" },
                                React.createElement("input", { type: "range", min: 0.8, max: 1.6, step: 0.05, value: draft.uiScale, onChange: (e) => {
                                        const v = Number(e.target.value);
                                        patch({ uiScale: v });
                                        void window.api.util.zoom(v);
                                    }, onMouseUp: () => void commit({ uiScale: draft.uiScale }), className: "h-1 flex-1 accent-[#38e0d0]" }),
                                React.createElement("span", { className: "num w-[64px] text-right text-[12px] text-data" },
                                    Math.round(draft.uiScale * 100),
                                    "%"),
                                React.createElement("button", { className: "btn-ghost shrink-0", onClick: () => {
                                        patch({ uiScale: 1 });
                                        void window.api.util.zoom(1);
                                        void commit({ uiScale: 1 });
                                    } }, "100%")))),
                    React.createElement(Card, { title: "\u7F51\u7EDC", desc: "\u7AD9\u70B9\u5728\u56FD\u5185\u4E00\u822C\u9700\u8981\u4EE3\u7406\uFF1B\u5C01\u9762\u56FE\u4E0E\u9875\u9762\u6293\u53D6\u90FD\u4F1A\u8D70\u8FD9\u91CC\u7684\u8BBE\u7F6E\u3002" },
                        React.createElement(Row, { label: "\u4EE3\u7406\u6A21\u5F0F" },
                            React.createElement("div", { className: "flex gap-1.5" }, [
                                ['auto', '自动探测'],
                                ['manual', '手动指定'],
                                ['off', '不使用代理']
                            ].map(([mode, text]) => (React.createElement("button", { key: mode, className: `chip ${draft.proxyMode === mode ? 'chip-on' : ''}`, onClick: () => {
                                    patch({ proxyMode: mode });
                                    void commit({ proxyMode: mode });
                                } }, text))))),
                        React.createElement(Row, { label: "\u4EE3\u7406\u5730\u5740" },
                            React.createElement("div", { className: "flex gap-2" },
                                React.createElement("input", { className: "field", value: draft.proxyUrl, placeholder: "http://127.0.0.1:7897", onChange: (e) => patch({ proxyUrl: e.target.value }), onBlur: () => void commit({ proxyUrl: draft.proxyUrl }) }),
                                React.createElement("button", { className: "btn-outline shrink-0", onClick: async () => {
                                        const found = await call(window.api.settings.probeProxy());
                                        if (found) {
                                            patch({ proxyUrl: found });
                                            await commit({ proxyUrl: found });
                                            toast('ok', `探测到本机代理 ${found}`);
                                        }
                                        else {
                                            toast('err', '没有探测到常见的本机代理端口');
                                        }
                                    } },
                                    React.createElement(Icons_13.IconRefresh, { width: 13, height: 13 }),
                                    " \u63A2\u6D4B"))),
                        React.createElement(Row, { label: "\u7AD9\u70B9\u57DF\u540D", hint: "\u7B2C\u4E00\u4E2A\u662F\u5F53\u524D\u4F7F\u7528\u7684\u57DF\u540D\uFF0C\u5176\u4F59\u4F5C\u4E3A\u5907\u7528\u955C\u50CF\u81EA\u52A8\u6545\u969C\u8F6C\u79FB" },
                            React.createElement("input", { className: "field", value: draft.mirrors.join(', '), placeholder: "https://www.javbus.com, https://javbus.com", onChange: (e) => patch({ mirrors: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }), onBlur: () => {
                                    var _a;
                                    return void commit({
                                        mirrors: draft.mirrors,
                                        activeMirror: (_a = draft.mirrors[0]) !== null && _a !== void 0 ? _a : 'https://www.javbus.com'
                                    });
                                } })),
                        React.createElement(Row, { label: "\u6293\u53D6\u5E76\u53D1", hint: "\u6279\u91CF\u6293\u53D6\u65F6\u540C\u65F6\u8BF7\u6C42\u7684\u6570\u91CF\uFF0C\u5EFA\u8BAE 2~4" },
                            React.createElement("input", { type: "range", min: 1, max: 8, value: draft.concurrency, onChange: (e) => patch({ concurrency: Number(e.target.value) }), onMouseUp: () => void commit({ concurrency: draft.concurrency }), className: "w-full accent-accent" }),
                            React.createElement("span", { className: "ml-2 w-6 text-center font-mono text-xs text-slate-400" }, draft.concurrency)),
                        React.createElement(Row, { label: "\u8BF7\u6C42\u95F4\u9694", hint: "\u7AD9\u70B9\u5BF9\u8FC7\u5FEB\u7684\u8BF7\u6C42\u4F1A\u8FD4\u56DE 429 \u9650\u6D41\uFF08\u5B9E\u6D4B\u7EA6 2.5 \u8BF7\u6C42/\u79D2\u662F\u5B89\u5168\u7EBF\uFF09\u3002\u8C03\u5C0F\u4F1A\u66F4\u5FEB\uFF0C\u4F46\u5931\u8D25\u7387\u4E0A\u5347\uFF1B\u9047\u5230 429 \u65F6\u7A0B\u5E8F\u4F1A\u81EA\u52A8\u8BFB\u53D6 Retry-After \u5E76\u964D\u901F\u91CD\u8BD5\u3002" },
                            React.createElement("input", { type: "range", min: 0, max: 1500, step: 20, value: draft.requestGapMs, onChange: (e) => patch({ requestGapMs: Number(e.target.value) }), onMouseUp: () => void commit({ requestGapMs: draft.requestGapMs }), className: "w-full accent-accent" }),
                            React.createElement("span", { className: "ml-2 w-14 text-center font-mono text-xs text-slate-400" },
                                draft.requestGapMs,
                                "ms"))),
                    React.createElement(Card, { title: "\u4E0B\u8F7D\u5668\uFF08BitComet\uFF09", desc: "\u78C1\u529B\u4EA4\u7ED9 BitComet\u3002\u300C\u8FDC\u7A0B\u63A5\u53E3\u300D\u6709\u5B9E\u65F6\u8FDB\u5EA6\u3001\u53EF\u6682\u505C/\u7EE7\u7EED/\u5220\u9664\uFF1B\u300C\u4EC5\u547D\u4EE4\u884C\u300D\u96F6\u914D\u7F6E\uFF0C\u4F46\u8FDB\u5EA6\u9760\u8BFB BitComet \u7684 Downloads.xml\uFF0C\u6709\u51E0\u79D2\u5230\u51E0\u5341\u79D2\u5EF6\u8FDF\u3002" },
                        React.createElement(Row, { label: "\u6A21\u5F0F" },
                            React.createElement("div", { className: "flex gap-1.5" }, [
                                ['webui', '远程接口'],
                                ['exe', '仅命令行'],
                                ['off', '系统默认程序']
                            ].map(([mode, text]) => (React.createElement("button", { key: mode, className: `chip ${draft.bc.mode === mode ? 'chip-on' : ''}`, onClick: () => {
                                    patchBc({ mode });
                                    void commit({ bc: { ...draft.bc, mode } });
                                } },
                                draft.bc.mode === mode && React.createElement(Icons_13.IconCheck, { width: 12, height: 12 }),
                                text))))),
                        draft.bc.mode === 'webui' && (React.createElement(React.Fragment, null,
                            React.createElement(Row, { label: "\u8FDC\u7A0B\u63A5\u53E3\u5730\u5740" },
                                React.createElement("div", { className: "flex gap-2" },
                                    React.createElement("input", { className: "field", value: draft.bc.url, placeholder: "http://127.0.0.1:1235", onChange: (e) => patchBc({ url: e.target.value }), onBlur: () => void commit({ bc: draft.bc }) }),
                                    React.createElement("button", { className: "btn-ghost shrink-0", disabled: bcProbing, title: "\u626B\u63CF\u672C\u673A\u7AEF\u53E3\u627E BitComet \u8FDC\u7A0B\u63A5\u53E3", onClick: async () => {
                                            setBcProbing(true);
                                            const url = await call(window.api.downloads.probeBitComet());
                                            setBcProbing(false);
                                            if (url) {
                                                patchBc({ url });
                                                await commit({ bc: { ...draft.bc, url } });
                                                toast('ok', `探测到 ${url}`);
                                            }
                                            else {
                                                toast('err', '没找到开着的 BitComet 远程接口，请确认已在选项里启用');
                                            }
                                        } },
                                        bcProbing ? React.createElement(Icons_13.IconSpinner, { width: 13, height: 13 }) : React.createElement(Icons_13.IconRefresh, { width: 13, height: 13 }),
                                        "\u81EA\u52A8\u63A2\u6D4B"))),
                            React.createElement(Row, { label: "\u8D26\u53F7 / \u5BC6\u7801" },
                                React.createElement("div", { className: "flex gap-2" },
                                    React.createElement("input", { className: "field", value: draft.bc.username, placeholder: "admin", onChange: (e) => patchBc({ username: e.target.value }), onBlur: () => void commit({ bc: draft.bc }) }),
                                    React.createElement("input", { className: "field", type: "password", value: draft.bc.password, placeholder: "\u8FDC\u7A0B\u4E0B\u8F7D\u91CC\u8BBE\u7684\u5BC6\u7801", onChange: (e) => patchBc({ password: e.target.value }), onBlur: () => void commit({ bc: draft.bc }) }))))),
                        draft.bc.mode !== 'off' && (React.createElement(Row, { label: "\u4FDD\u5B58\u76EE\u5F55", hint: "BitComet \u53EA\u63A5\u53D7\u5B83\u300C\u4E0B\u8F7D\u76EE\u5F55\u300D\u5217\u8868\u91CC\u7684\u76EE\u5F55\uFF0C\u5B50\u76EE\u5F55\u4E5F\u4E0D\u884C\uFF1B\u4E0D\u5728\u5217\u8868\u91CC\u7684\u53EF\u4EE5\u70B9\u300C\u52A0\u5165 BitComet\u300D" },
                            React.createElement("div", { className: "w-full space-y-2" },
                                React.createElement("div", { className: "flex gap-2" },
                                    React.createElement("input", { className: "field", value: draft.bc.savePath, placeholder: "\u7559\u7A7A\u5219\u7528 BitComet \u7684\u9ED8\u8BA4\u76EE\u5F55", onChange: (e) => patchBc({ savePath: e.target.value }), onBlur: () => void commit({ bc: draft.bc }) }),
                                    React.createElement("button", { className: "btn-ghost shrink-0", title: "\u9009\u62E9\u76EE\u5F55", onClick: async () => {
                                            const dir = await call(window.api.settings.pickDir('选择下载保存目录'));
                                            if (dir) {
                                                patchBc({ savePath: dir });
                                                await commit({ bc: { ...draft.bc, savePath: dir } });
                                            }
                                        } },
                                        React.createElement(Icons_13.IconFolder, { width: 13, height: 13 }))),
                                draft.bc.mode === 'webui' && (React.createElement(React.Fragment, null,
                                    savePathInvalid && (React.createElement("div", { className: "flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[.07] px-2.5 py-1.5" },
                                        React.createElement("span", { className: "min-w-0 flex-1 text-[11px] leading-relaxed text-amber-300/90" },
                                            "\u8FD9\u4E2A\u76EE\u5F55\u4E0D\u5728 BitComet \u7684\u4E0B\u8F7D\u76EE\u5F55\u5217\u8868\u91CC\uFF0C\u52A0\u4EFB\u52A1\u4F1A\u88AB\u5B83\u62D2\u6389\uFF08",
                                            React.createElement("code", null, "save_folder invalid"),
                                            "\uFF09\u3002"),
                                        React.createElement("button", { className: "btn-outline shrink-0 !py-1", disabled: bcFolderBusy, onClick: async () => {
                                                setBcFolderBusy(true);
                                                const list = await call(window.api.downloads.bcAddFolder(draft.bc.savePath.trim()));
                                                setBcFolderBusy(false);
                                                if (list) {
                                                    setBcFolders(list);
                                                    toast('ok', '已加入 BitComet 的下载目录');
                                                }
                                            } },
                                            bcFolderBusy ? React.createElement(Icons_13.IconSpinner, { width: 12, height: 12 }) : null,
                                            " \u52A0\u5165 BitComet"))),
                                    !!bcFolders.length && (React.createElement("div", { className: "flex flex-wrap items-center gap-1.5" },
                                        React.createElement("span", { className: "text-[11px] text-slate-500" }, "BitComet \u91CC\u53EF\u7528\uFF1A"),
                                        bcFolders.map((f) => (React.createElement("button", { key: f.path, className: `chip !px-2 !py-0.5 !text-[11px] ${samePath(f.path, draft.bc.savePath) ? 'chip-on' : ''}`, title: f.path, onClick: () => {
                                                patchBc({ savePath: f.path });
                                                void commit({ bc: { ...draft.bc, savePath: f.path } });
                                            } }, f.display || f.path)))))))))),
                        draft.bc.mode === 'webui' && (React.createElement(Row, { label: "\u8FDE\u63A5\u6D4B\u8BD5" },
                            React.createElement("div", { className: "flex items-center gap-2" },
                                React.createElement("button", { className: "btn-primary", disabled: bcTesting, onClick: async () => {
                                        setBcTesting(true);
                                        await commit({ bc: draft.bc });
                                        const res = await call(window.api.downloads.testBitComet());
                                        setBcTesting(false);
                                        if (res) {
                                            setBcVersion(res.version);
                                            toast('ok', `连接成功，BitComet ${res.version}`);
                                        }
                                    } },
                                    bcTesting ? React.createElement(Icons_13.IconSpinner, { width: 13, height: 13 }) : null,
                                    " \u6D4B\u8BD5\u8FDE\u63A5"),
                                React.createElement("button", { className: "btn-data", title: "\u672C\u673A\u88C5\u4E86\u5C31\u5524\u8D77\u4E3B\u754C\u9762\uFF0C\u5426\u5219\u6253\u5F00\u5B83\u7684\u8FDC\u7A0B\u7F51\u9875\u754C\u9762", onClick: async () => {
                                        const how = await call(window.api.downloads.openBitComet());
                                        if (how) {
                                            toast('ok', how === 'exe' ? '已唤起本机 BitComet' : '已打开 BitComet 远程界面');
                                        }
                                    } },
                                    React.createElement(Icons_13.IconComet, { width: 13, height: 13 }),
                                    " \u6253\u5F00 BitComet"),
                                bcVersion && React.createElement("span", { className: "text-[12px] text-emerald-400" },
                                    "\u5DF2\u8FDE\u63A5 ",
                                    bcVersion)))),
                        draft.bc.mode === 'webui' && (React.createElement(Row, { label: "\u5916\u90E8\u4EFB\u52A1", hint: "\u5728 BitComet \u91CC\u624B\u52A8\u52A0\u7684\u4EFB\u52A1\u4E5F\u4F1A\u51FA\u73B0\u5728\u300C\u4E0B\u8F7D\u7BA1\u7406\u300D\u91CC\uFF0C\u80FD\u770B\u8FDB\u5EA6\u3001\u80FD\u6682\u505C\uFF1B\u5B83\u4EEC\u4ECE BitComet \u5220\u6389\u540E\u8FD9\u91CC\u4E5F\u4F1A\u8DDF\u7740\u6D88\u5931" },
                            React.createElement("button", { className: `chip ${draft.bc.adoptRemote ? 'chip-on' : ''}`, onClick: () => {
                                    const next = !draft.bc.adoptRemote;
                                    patchBc({ adoptRemote: next });
                                    void commit({ bc: { ...draft.bc, adoptRemote: next } });
                                } },
                                "\u663E\u793A BitComet \u91CC\u7684\u5176\u5B83\u4EFB\u52A1",
                                draft.bc.adoptRemote && React.createElement(Icons_13.IconCheck, { width: 12, height: 12 })))),
                        draft.bc.mode !== 'off' && (React.createElement(Row, { label: "\u672C\u673A BitComet" },
                            React.createElement("div", { className: "space-y-1.5 text-[11px] leading-relaxed" },
                                React.createElement("p", { className: "font-mono text-slate-400" },
                                    "\u7A0B\u5E8F\uFF1A", (_a = bcPaths === null || bcPaths === void 0 ? void 0 : bcPaths.exePath) !== null && _a !== void 0 ? _a : React.createElement("span", { className: "text-rose-400" }, "\u672A\u627E\u5230")),
                                React.createElement("p", { className: "font-mono text-slate-400" },
                                    "\u4EFB\u52A1\u8868\uFF1A", (_b = bcPaths === null || bcPaths === void 0 ? void 0 : bcPaths.downloadsXml) !== null && _b !== void 0 ? _b : React.createElement("span", { className: "text-amber-400" }, "\u672A\u627E\u5230")),
                                React.createElement("p", { className: "text-slate-500" }, "\u8FD9\u4E24\u9879\u662F\u81EA\u52A8\u63A2\u6D4B\u7684\uFF08\u7A0B\u5E8F\u8DEF\u5F84\u6765\u81EA\u78C1\u529B\u534F\u8BAE\u7684\u6CE8\u518C\u8868\u5173\u8054\uFF09\u3002\u88C5\u4E86\u591A\u4EFD BitComet \u65F6\u4F1A\u6311\u4EFB\u52A1\u8868\u6700\u65B0\u7684\u90A3\u4EFD\uFF0C\u4E0D\u5BF9\u7684\u8BDD\u53EF\u4EE5\u4E0B\u9762\u624B\u52A8\u6307\u5B9A\u3002")))),
                        draft.bc.mode !== 'off' && (React.createElement(Row, { label: "\u624B\u52A8\u6307\u5B9A" },
                            React.createElement("div", { className: "flex gap-2" },
                                React.createElement("input", { className: "field", value: draft.bc.exePath, placeholder: "BitComet.exe \u5B8C\u6574\u8DEF\u5F84\uFF08\u7559\u7A7A = \u81EA\u52A8\uFF09", onChange: (e) => patchBc({ exePath: e.target.value }), onBlur: async () => {
                                        await commit({ bc: draft.bc });
                                        setBcPaths(await call(window.api.downloads.detectBitComet()));
                                    } }),
                                React.createElement("input", { className: "field", value: draft.bc.dataDir, placeholder: "Downloads.xml \u6240\u5728\u76EE\u5F55\uFF08\u7559\u7A7A = \u81EA\u52A8\uFF09", onChange: (e) => patchBc({ dataDir: e.target.value }), onBlur: async () => {
                                        await commit({ bc: draft.bc });
                                        setBcPaths(await call(window.api.downloads.detectBitComet()));
                                    } })))),
                        React.createElement("p", { className: "rounded-lg bg-white/[.03] px-3 py-2 text-[11px] leading-relaxed text-slate-500" },
                            "\u5F00\u542F\u8FDC\u7A0B\u63A5\u53E3\uFF1ABitComet \u2192 \u9009\u9879 \u2192 \u8FDC\u7A0B\u4E0B\u8F7D \u2192 \u52FE\u9009\u542F\u7528\uFF0C\u8BBE\u597D\u7AEF\u53E3\u548C\u5BC6\u7801\uFF0C\u586B\u5230\u4E0A\u9762\u70B9\u300C\u6D4B\u8BD5\u8FDE\u63A5\u300D\u3002 \u9700\u8981 BitComet ",
                            React.createElement("span", { className: "text-slate-300" }, "2.18 \u53CA\u4EE5\u4E0A"),
                            "\u7248\u672C\u3002 \u6CA1\u5F00\u4E5F\u4E0D\u5F71\u54CD\u7528\u2014\u2014\u300C\u8FDC\u7A0B\u63A5\u53E3\u300D\u6A21\u5F0F\u8FDE\u4E0D\u4E0A\u65F6\u4F1A\u81EA\u52A8\u6539\u7528\u547D\u4EE4\u884C\u62C9\u8D77 BitComet\uFF0C\u53EA\u662F\u62FF\u4E0D\u5230\u5B9E\u65F6\u8FDB\u5EA6\u3002")),
                    React.createElement(Card, { title: "\u5F71\u7247\u5E93", desc: "\u626B\u63CF\u8FD9\u4E9B\u76EE\u5F55\u91CC\u7684\u89C6\u9891\u6587\u4EF6\uFF0C\u6309\u6587\u4EF6\u540D\u4E2D\u7684\u756A\u53F7\u5339\u914D\u5F71\u7247\uFF0C\u7528\u4E8E\u6807\u8BB0\u300C\u5DF2\u4E0B\u8F7D\u300D\u5E76\u652F\u6301\u4E00\u952E\u64AD\u653E\u3002" },
                        React.createElement(Row, { label: "\u76EE\u5F55" },
                            React.createElement("div", { className: "w-full space-y-1.5" },
                                draft.libraryDirs.map((dir) => (React.createElement("div", { key: dir, className: "flex items-center gap-2 rounded-lg border border-white/5 bg-white/[.02] px-3 py-1.5" },
                                    React.createElement("span", { className: "min-w-0 flex-1 truncate text-[12px] text-slate-300" }, dir),
                                    React.createElement("button", { className: "btn-ghost h-6 w-6 !px-0 hover:text-rose-400", onClick: () => void commit({ libraryDirs: draft.libraryDirs.filter((d) => d !== dir) }) },
                                        React.createElement(Icons_13.IconTrash, { width: 12, height: 12 }))))),
                                React.createElement("div", { className: "flex gap-2" },
                                    React.createElement("button", { className: "btn-outline", onClick: async () => {
                                            const dir = await call(window.api.settings.pickDir('选择影片目录'));
                                            if (dir && !draft.libraryDirs.includes(dir)) {
                                                await commit({ libraryDirs: [...draft.libraryDirs, dir] });
                                                toast('ok', '已添加目录，正在扫描…');
                                            }
                                        } },
                                        React.createElement(Icons_13.IconFolder, { width: 13, height: 13 }),
                                        " \u6DFB\u52A0\u76EE\u5F55"),
                                    React.createElement("button", { className: "btn-ghost", disabled: scanning, onClick: async () => {
                                            setScanning(true);
                                            await refreshLibrary();
                                            setScanning(false);
                                            toast('ok', '扫描完成');
                                        } },
                                        scanning ? React.createElement(Icons_13.IconSpinner, { width: 13, height: 13 }) : React.createElement(Icons_13.IconRefresh, { width: 13, height: 13 }),
                                        "\u91CD\u65B0\u626B\u63CF"),
                                    React.createElement("span", { className: "self-center text-[11px] text-slate-500" },
                                        "\u5DF2\u8BC6\u522B ",
                                        downloaded.size,
                                        " \u4E2A\u756A\u53F7")))),
                        React.createElement(Row, { label: "\u81EA\u52A8\u8865\u9F50\u8D44\u6599", hint: "\u300C\u5DF2\u4E0B\u8F7D\u5F71\u7247\u300D\u9875\u662F\u6309\u672C\u5730\u7F13\u5B58\u7B5B\u9009\u7684\uFF0C\u786C\u76D8\u4E0A\u6709\u6587\u4EF6\u4F46\u6CA1\u6293\u8FC7\u8D44\u6599\u7684\u5F71\u7247\u5728\u90A3\u91CC\u770B\u4E0D\u89C1\uFF1B\u5F00\u542F\u540E\u8FDB\u5165\u8BE5\u9875\u4F1A\u81EA\u52A8\u6309\u756A\u53F7\u641C\u7D22\u5E76\u5165\u5E93" },
                            React.createElement("button", { className: `chip ${draft.autoFillLibraryMeta ? 'chip-on' : ''}`, onClick: () => {
                                    const next = !draft.autoFillLibraryMeta;
                                    patch({ autoFillLibraryMeta: next });
                                    void commit({ autoFillLibraryMeta: next });
                                } },
                                draft.autoFillLibraryMeta && React.createElement(Icons_13.IconCheck, { width: 12, height: 12 }),
                                draft.autoFillLibraryMeta ? '已开启' : '已关闭'))),
                    React.createElement(Card, { title: "\u7F13\u5B58", desc: "\u5F71\u7247\u5143\u6570\u636E\u4E0E\u5C01\u9762\u56FE\u7684\u672C\u5730\u7F13\u5B58\uFF0C\u53EF\u4EE5\u653E\u5230\u4EFB\u610F\u78C1\u76D8\uFF08\u4F8B\u5982\u7A7A\u95F4\u66F4\u5927\u7684\u6570\u636E\u76D8\uFF09\u3002" },
                        React.createElement(Row, { label: "\u5B58\u653E\u4F4D\u7F6E", hint: "\u7559\u7A7A\u4F7F\u7528\u9ED8\u8BA4\u4F4D\u7F6E\uFF1B\u4FEE\u6539\u540E\u5DF2\u6709\u7684\u5143\u6570\u636E\u7F13\u5B58\u4F1A\u81EA\u52A8\u8FC1\u79FB" },
                            React.createElement("div", { className: "flex gap-2" },
                                React.createElement("input", { className: "field", value: draft.cacheDir, placeholder: (_c = cache === null || cache === void 0 ? void 0 : cache.dir) !== null && _c !== void 0 ? _c : '默认位置', onChange: (e) => patch({ cacheDir: e.target.value }), onBlur: () => void commit({ cacheDir: draft.cacheDir }) }),
                                React.createElement("button", { className: "btn-outline shrink-0", onClick: async () => {
                                        const dir = await call(window.api.settings.pickDir('选择缓存存放位置'));
                                        if (dir) {
                                            patch({ cacheDir: dir });
                                            await commit({ cacheDir: dir });
                                            toast('ok', '缓存位置已更新（封面图缓存在重启后生效）');
                                        }
                                    } },
                                    React.createElement(Icons_13.IconFolder, { width: 13, height: 13 }),
                                    " \u9009\u62E9"),
                                !!draft.cacheDir && (React.createElement("button", { className: "btn-ghost shrink-0", onClick: async () => {
                                        patch({ cacheDir: '' });
                                        await commit({ cacheDir: '' });
                                        toast('ok', '已恢复默认缓存位置');
                                    } }, "\u6062\u590D\u9ED8\u8BA4")))),
                        React.createElement(Row, { label: "\u5F53\u524D\u7F13\u5B58" },
                            React.createElement("div", { className: "flex w-full items-center gap-3" },
                                React.createElement("span", { className: "text-[12px] text-slate-400" }, cache ? `${cache.movies} 部影片 · ${(0, format_5.formatBytes)(cache.bytes)}` : '读取中…'),
                                React.createElement("span", { className: "min-w-0 flex-1 truncate text-[11px] text-slate-600", title: cache === null || cache === void 0 ? void 0 : cache.file }, cache === null || cache === void 0 ? void 0 : cache.file),
                                React.createElement("button", { className: "btn-ghost shrink-0 hover:text-rose-400", onClick: async () => {
                                        const info = await call(window.api.cache.clear());
                                        setCache(info);
                                        toast('ok', '元数据缓存已清空');
                                    } },
                                    React.createElement(Icons_13.IconTrash, { width: 13, height: 13 }),
                                    " \u6E05\u7A7A"))),
                        React.createElement(Row, { label: "\u7F13\u5B58\u6709\u6548\u671F", hint: "\u8D85\u8FC7\u8BE5\u65F6\u957F\u4F1A\u91CD\u65B0\u6293\u53D6\uFF1B\u79BB\u7EBF\u65F6\u4ECD\u4F1A\u56DE\u9000\u5230\u65E7\u7F13\u5B58" },
                            React.createElement("div", { className: "flex items-center gap-2" },
                                React.createElement("input", { className: "field w-24", value: String(draft.cacheTtlHours), onChange: (e) => patch({ cacheTtlHours: Number(e.target.value.replace(/\D/g, '')) || 0 }), onBlur: () => void commit({ cacheTtlHours: draft.cacheTtlHours }) }),
                                React.createElement("span", { className: "text-[12px] text-slate-500" }, "\u5C0F\u65F6\uFF080 \u8868\u793A\u6C38\u4E45\u6709\u6548\uFF09")))),
                    React.createElement("p", { className: "pb-4 text-center text-[11px] leading-relaxed text-slate-600" },
                        "\u672C\u7A0B\u5E8F\u53EA\u505A\u68C0\u7D22\u4E0E\u672C\u5730\u8C03\u5EA6\uFF0C\u78C1\u529B\u8D44\u6E90\u7531\u7AD9\u70B9\u7F51\u53CB\u5206\u4EAB\uFF0C\u8BF7\u81EA\u884C\u786E\u8BA4\u6240\u4E0B\u8F7D\u5185\u5BB9\u7684\u5408\u6CD5\u6027\u3002",
                        React.createElement("br", null),
                        "\u6293\u53D6\u5E26\u5E76\u53D1\u4E0E\u5EF6\u8FDF\u9650\u5236\uFF0C\u8BF7\u52FF\u8C03\u5F97\u8FC7\u9AD8\u3002")))));
    }
    function Card({ title, desc, children }) {
        return (React.createElement("section", { className: "panel p-5" },
            React.createElement("h3", { className: "text-[14px] font-semibold text-white" }, title),
            desc && React.createElement("p", { className: "mt-1 text-[12px] leading-relaxed text-slate-500" }, desc),
            React.createElement("div", { className: "mt-4 space-y-3" }, children)));
    }
    function Row({ label, hint, children }) {
        return (React.createElement("div", { className: "flex gap-4" },
            React.createElement("div", { className: "w-[104px] shrink-0 pt-2" },
                React.createElement("div", { className: "text-[12px] text-slate-300" }, label)),
            React.createElement("div", { className: "min-w-0 flex-1" },
                React.createElement("div", { className: "flex items-center" }, children),
                hint && React.createElement("p", { className: "mt-1 text-[11px] text-slate-600" }, hint))));
    }
    /** 与主进程 bitcomet.ts 里同一套比较规则：Windows 不分大小写，忽略分隔符方向与末尾分隔符 */
    function samePath(a, b) {
        const norm = (p) => p.replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase();
        return norm(a) === norm(b);
    }
});
define("renderer/src/App", ["require", "exports", "renderer/src/components/DetailDrawer", "renderer/src/components/Sidebar", "renderer/src/components/Toasts", "renderer/src/pages/BrowsePage", "renderer/src/pages/DownloadsPage", "renderer/src/pages/GenresPage", "renderer/src/pages/LocalPage", "renderer/src/pages/SettingsPage", "renderer/src/state"], function (require, exports, DetailDrawer_1, Sidebar_1, Toasts_1, BrowsePage_1, DownloadsPage_1, GenresPage_1, LocalPage_1, SettingsPage_1, state_12) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.App = App;
    function App() {
        const { view } = (0, state_12.useApp)();
        return (React.createElement("div", { className: "flex h-full w-full overflow-hidden bg-ink-900" },
            React.createElement(Sidebar_1.Sidebar, null),
            view.kind === 'browse' && React.createElement(BrowsePage_1.BrowsePage, { key: JSON.stringify(view.query), query: view.query }),
            view.kind === 'genres' && React.createElement(GenresPage_1.GenresPage, null),
            view.kind === 'local' && React.createElement(LocalPage_1.LocalPage, { preset: view.preset }),
            view.kind === 'downloads' && React.createElement(DownloadsPage_1.DownloadsPage, null),
            view.kind === 'settings' && React.createElement(SettingsPage_1.SettingsPage, null),
            React.createElement(DetailDrawer_1.DetailDrawer, null),
            React.createElement(Toasts_1.Toasts, null)));
    }
});
define("renderer/src/main", ["require", "exports", "react-dom/client", "renderer/src/App", "renderer/src/state"], function (require, exports, client_1, App_1, state_13) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    (0, client_1.createRoot)(document.getElementById('root')).render(React.createElement(state_13.AppProvider, null,
        React.createElement(App_1.App, null)));
});
