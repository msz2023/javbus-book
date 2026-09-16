/**
 * Android 适配层：替代 Electron 的 preload + 主进程。
 *
 * 桌面版渲染层只依赖 window.api（IPC 封装），这里用同样的接口签名重新实现：
 *  - 抓取走 AndroidNative.fetch 原生桥（绕过 WebView 跨域限制）
 *  - HTML 解析用浏览器自带 DOMParser（替代主进程里的 cheerio）
 *  - 收藏 / 设置 / 影片缓存落在 localStorage
 *  - 在线观看打开原生 PlayerActivity（带广告拦截）
 *  - 下载 / 本地影片库等桌面能力在安卓上不适用，一律优雅降级为可读的错误提示
 *
 * 必须在 bundle.js 之前加载。
 */
;(function () {
  'use strict'

  // ---------------- 原生桥：Promise 化 ----------------
  var pending = {}
  var seq = 1

  window.__nativeResolve = function (id, ok, payloadJson) {
    var p = pending[id]
    if (!p) return
    delete pending[id]
    var data
    try {
      data = JSON.parse(payloadJson)
    } catch (e) {
      p.reject(new Error('原生桥返回数据损坏'))
      return
    }
    if (ok) p.resolve(data)
    else p.reject(new Error((data && data.error) || '网络请求失败'))
  }

  function nativeFetch(url, opts) {
    return new Promise(function (resolve, reject) {
      var id = String(seq++)
      pending[id] = { resolve: resolve, reject: reject }
      try {
        AndroidNative.fetch(id, url, JSON.stringify(opts || {}))
      } catch (e) {
        delete pending[id]
        reject(new Error('原生桥不可用：' + e.message))
      }
    })
  }

  // ---------------- 本地存储 ----------------
  function loadJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw)
    } catch (e) {
      /* 损坏时回退默认值 */
    }
    return fallback
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (e) {
      return false
    }
  }

  var DEFAULT_SETTINGS = {
    proxyMode: 'off',
    proxyUrl: '',
    mirrors: ['https://www.javbus.com', 'https://javbus.com'],
    activeMirror: 'https://www.javbus.com',
    bc: {
      mode: 'off',
      url: '',
      username: '',
      password: '',
      clientId: 'android',
      savePath: '',
      exePath: '',
      dataDir: '',
      adoptRemote: false
    },
    libraryDirs: [],
    concurrency: 3,
    requestGapMs: 420,
    cacheTtlHours: 24 * 14,
    cacheDir: '',
    viewMode: 'thumb', // 手机屏幕窄，默认小图密排
    cardWidth: 300,
    uiScale: 1,
    autoFetchDetailOnHover: false,
    autoFillLibraryMeta: false
  }

  function getSettings() {
    var s = loadJson('jbSettings', {})
    var merged = Object.assign({}, DEFAULT_SETTINGS, s)
    merged.bc = Object.assign({}, DEFAULT_SETTINGS.bc, s.bc || {})
    return merged
  }

  function getFavorites() {
    return loadJson('jbFavs', [])
  }

  // 影片资料缓存（详情页数据），上限 200 条按抓取时间淘汰，防止撑爆 localStorage
  var CACHE_LIMIT = 200

  function getCache() {
    return loadJson('jbCache', {})
  }

  function putCachedMovie(movie) {
    var cache = getCache()
    cache[normCode(movie.code)] = movie
    var keys = Object.keys(cache)
    if (keys.length > CACHE_LIMIT) {
      keys
        .sort(function (a, b) {
          return (cache[a].fetchedAt || 0) - (cache[b].fetchedAt || 0)
        })
        .slice(0, keys.length - CACHE_LIMIT)
        .forEach(function (k) {
          delete cache[k]
        })
    }
    if (!saveJson('jbCache', cache)) {
      // 空间不足：删掉一半最老的再试一次
      var ks = Object.keys(cache).sort(function (a, b) {
        return (cache[a].fetchedAt || 0) - (cache[b].fetchedAt || 0)
      })
      ks.slice(0, Math.ceil(ks.length / 2)).forEach(function (k) {
        delete cache[k]
      })
      saveJson('jbCache', cache)
    }
  }

  function normCode(code) {
    return String(code || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
  }

  // ---------------- 事件 ----------------
  var listeners = { downloads: [], library: [], crawl: [], favHydrated: [] }

  function on(name, cb) {
    listeners[name].push(cb)
    return function () {
      var i = listeners[name].indexOf(cb)
      if (i >= 0) listeners[name].splice(i, 1)
    }
  }

  function emit(name, payload) {
    listeners[name].slice().forEach(function (cb) {
      try {
        cb(payload)
      } catch (e) {
        /* 监听器异常不影响其它 */
      }
    })
  }

  // ---------------- 站点抓取 ----------------
  function fetchSite(path, opts) {
    var base = getSettings().activeMirror.replace(/\/+$/, '')
    var url = /^https?:/i.test(path) ? path : base + path
    return nativeFetch(url, opts).then(function (res) {
      if (res.status >= 400) {
        var err = new Error('站点返回 ' + res.status + '（' + url + '）')
        err.status = res.status
        throw err
      }
      return { html: res.body, url: res.url || url }
    })
  }

  function parseDoc(html) {
    return new DOMParser().parseFromString(html, 'text/html')
  }

  function absolute(url, base) {
    if (!url) return ''
    try {
      return new URL(url, base).toString()
    } catch (e) {
      return url
    }
  }

  function text(el) {
    return el ? (el.textContent || '').trim() : ''
  }

  function refKind(href) {
    if (/\/genre\//.test(href)) return 'genre'
    if (/\/star\//.test(href)) return 'star'
    if (/\/director\//.test(href)) return 'director'
    if (/\/studio\//.test(href)) return 'studio'
    if (/\/label\//.test(href)) return 'label'
    if (/\/series\//.test(href)) return 'series'
    return null
  }

  function refFromHref(href, name, avatar) {
    var kind = refKind(href)
    if (!kind) return null
    var id = href.replace(/\/+$/, '').split('/').pop() || ''
    if (!id) return null
    var ref = { kind: kind, id: id, name: (name || '').trim() }
    if (avatar) ref.avatar = avatar
    return ref
  }

  /** 与桌面版 buildListPath 完全一致：页码 1:1 对应站点 */
  function buildListPath(q) {
    var page = Math.max(1, q.page || 1)
    var v = q.value || ''
    switch (q.kind) {
      case 'home':
        return '/page/' + page
      case 'uncensored':
        return '/uncensored/page/' + page
      case 'genre':
        return '/genre/' + v + '/' + page
      case 'uncensored-genre':
        return '/uncensored/genre/' + v + '/' + page
      case 'star':
        return '/star/' + v + '/' + page
      case 'uncensored-star':
        return '/uncensored/star/' + v + '/' + page
      case 'director':
        return '/director/' + v + '/' + page
      case 'studio':
        return '/studio/' + v + '/' + page
      case 'label':
        return '/label/' + v + '/' + page
      case 'series':
        return '/series/' + v + '/' + page
      case 'search':
        return '/search/' + encodeURIComponent(v) + '/' + page
      case 'uncensored-search':
        return '/uncensored/search/' + encodeURIComponent(v) + '/' + page
      default:
        return '/page/' + page
    }
  }

  function parseList(html, baseUrl, query) {
    var doc = parseDoc(html)
    var items = []
    doc.querySelectorAll('a.movie-box').forEach(function (el) {
      var href = el.getAttribute('href') || ''
      var img = el.querySelector('.photo-frame img')
      var dates = el.querySelectorAll('.photo-info date')
      var code = (text(dates[0]) || (href.split('/').pop() || '')).trim()
      if (!code) return
      var tags = []
      var tagWrap = el.querySelector('.item-tag')
      if (tagWrap) {
        Array.prototype.forEach.call(tagWrap.children, function (t) {
          var s = text(t)
          if (s) tags.push(s)
        })
      }
      items.push({
        code: code,
        title: (img && img.getAttribute('title')) || '',
        cover: absolute(img && img.getAttribute('src'), baseUrl),
        date: text(dates[1]),
        tags: tags,
        detailUrl: absolute(href, baseUrl)
      })
    })

    var nums = {}
    doc.querySelectorAll('ul.pagination li a').forEach(function (a) {
      var t = text(a)
      if (/^\d+$/.test(t)) nums[t] = true
    })
    var pages = Object.keys(nums)
      .map(Number)
      .sort(function (a, b) {
        return a - b
      })

    var heading =
      text(doc.querySelector('.container h3')) ||
      (doc.title || '').replace(/\s*-\s*JavBus.*$/, '').trim() ||
      'JavBus'

    return {
      query: query,
      items: items,
      pagination: {
        current: query.page,
        pages: pages,
        hasPrev: query.page > 1,
        hasNext: !!doc.querySelector('ul.pagination a#next'),
        maxKnown: pages.length ? Math.max(Math.max.apply(null, pages), query.page) : query.page
      },
      heading: heading
    }
  }

  function parseDetail(html, baseUrl) {
    var doc = parseDoc(html)
    var info = doc.querySelector('div.info')

    function rowValue(label) {
      var value = ''
      if (!info) return value
      info.querySelectorAll('p').forEach(function (p) {
        if (value) return
        var header = p.querySelector('span.header')
        if (header && text(header).replace(/:$/, '') === label) {
          value = (p.textContent || '').replace(header.textContent || '', '').trim()
        }
      })
      return value
    }

    function rowRef(label) {
      var ref = null
      if (!info) return undefined
      info.querySelectorAll('p').forEach(function (p) {
        if (ref) return
        var header = p.querySelector('span.header')
        if (header && text(header).replace(/:$/, '') === label) {
          var a = p.querySelector('a')
          if (a) ref = refFromHref(a.getAttribute('href') || '', text(a))
        }
      })
      return ref || undefined
    }

    var genres = []
    if (info) {
      info.querySelectorAll('span.genre a[href*="/genre/"]').forEach(function (a) {
        var ref = refFromHref(a.getAttribute('href') || '', text(a))
        if (
          ref &&
          !genres.some(function (g) {
            return g.id === ref.id
          })
        )
          genres.push(ref)
      })
    }

    var avatarByHref = {}
    doc.querySelectorAll('a.avatar-box').forEach(function (a) {
      var href = (a.getAttribute('href') || '').replace(/\/+$/, '')
      var img = a.querySelector('img')
      if (href && img && img.getAttribute('src'))
        avatarByHref[href] = absolute(img.getAttribute('src'), baseUrl)
    })
    var stars = []
    doc
      .querySelectorAll('div.star-name a, span.genre a[href*="/star/"]')
      .forEach(function (a) {
        var href = (a.getAttribute('href') || '').replace(/\/+$/, '')
        var ref = refFromHref(href, a.getAttribute('title') || text(a), avatarByHref[href])
        if (
          ref &&
          !stars.some(function (s) {
            return s.id === ref.id
          })
        )
          stars.push(ref)
      })

    var samples = []
    doc.querySelectorAll('#sample-waterfall a.sample-box').forEach(function (a) {
      var full = absolute(a.getAttribute('href'), baseUrl)
      var img = a.querySelector('img')
      var thumb = absolute(img && img.getAttribute('src'), baseUrl) || full
      if (full) samples.push({ thumb: thumb, full: full })
    })

    var codeEl = info && info.querySelector('p span[style*="CC0000"]')
    var code = text(codeEl) || rowValue('識別碼') || (baseUrl.split('/').pop() || '')

    var rawTitle = text(doc.querySelector('.container h3')) || text(doc.querySelector('h3'))
    var title = rawTitle.replace(new RegExp('^' + code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '').trim() || rawTitle

    var bigImage = doc.querySelector('a.bigImage')
    var bigImg = bigImage && bigImage.querySelector('img')

    return {
      code: code.toUpperCase(),
      title: title,
      cover: absolute(
        (bigImage && bigImage.getAttribute('href')) || (bigImg && bigImg.getAttribute('src')),
        baseUrl
      ),
      date: rowValue('發行日期'),
      length: rowValue('長度'),
      director: rowRef('導演'),
      studio: rowRef('製作商'),
      label: rowRef('發行商'),
      series: rowRef('系列'),
      genres: genres,
      stars: stars,
      samples: samples,
      magnets: [],
      detailUrl: baseUrl,
      uncensored: /\/uncensored\//.test(baseUrl),
      fetchedAt: Date.now()
    }
  }

  // ---------------- 磁力（仅展示用，安卓不下载） ----------------
  var BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

  function magnetHash(link) {
    var m = link.match(/btih:([a-z2-7]{32}|[a-f0-9]{40})/i)
    if (!m) return ''
    var raw = m[1]
    if (raw.length === 40) return raw.toLowerCase()
    var bits = 0
    var value = 0
    var hex = ''
    var up = raw.toUpperCase()
    for (var i = 0; i < up.length; i++) {
      var idx = BASE32.indexOf(up.charAt(i))
      if (idx < 0) return ''
      value = (value << 5) | idx
      bits += 5
      if (bits >= 8) {
        bits -= 8
        hex += ((value >> bits) & 0xff).toString(16).padStart(2, '0')
      }
    }
    return hex
  }

  function parseSize(t) {
    var m = (t || '').trim().match(/([\d.]+)\s*(TB|GB|MB|KB|B)/i)
    if (!m) return 0
    var units = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 }
    return Math.round(parseFloat(m[1]) * (units[m[2].toUpperCase()] || 1))
  }

  function parseMagnets(fragment) {
    var doc = parseDoc('<table>' + fragment + '</table>')
    var out = []
    var seen = {}
    doc.querySelectorAll('tr').forEach(function (tr) {
      var link = tr.querySelector('a[href^="magnet:"]')
      if (!link) return
      var href = link.getAttribute('href') || ''
      var hash = magnetHash(href)
      if (!hash || seen[hash]) return
      seen[hash] = true
      var tds = tr.querySelectorAll('td')
      var first = tds[0]
      var tagTexts = []
      if (first) {
        first.querySelectorAll('a.btn, .btn').forEach(function (b) {
          var t = text(b)
          if (t) tagTexts.push(t)
        })
      }
      var name = text(first)
      tagTexts.forEach(function (t) {
        name = name.replace(t, '')
      })
      name = name.replace(/\s+/g, ' ').trim()
      var sizeText = text(tds[1])
      out.push({
        name: name || 'magnet:' + hash.slice(0, 8),
        link: href,
        infoHash: hash,
        size: sizeText,
        sizeBytes: parseSize(sizeText),
        shareDate: text(tds[2]),
        hd: tagTexts.some(function (t) {
          return /高清|HD/i.test(t)
        }),
        subtitle: tagTexts.some(function (t) {
          return /字幕|subtitle/i.test(t)
        })
      })
    })
    return out.sort(function (a, b) {
      return b.sizeBytes - a.sizeBytes
    })
  }

  var floor = 100

  function fetchMagnets(html, detailUrl) {
    var gid = html.match(/var\s+gid\s*=\s*(\d+)/)
    if (!gid) return Promise.resolve([])
    var uc = html.match(/var\s+uc\s*=\s*(\d+)/)
    var img = html.match(/var\s+img\s*=\s*'([^']*)'/)
    floor = (floor % 900) + 100
    var qs =
      'gid=' +
      gid[1] +
      '&lang=zh&img=' +
      encodeURIComponent(img ? img[1] : '') +
      '&uc=' +
      (uc ? uc[1] : '0') +
      '&floor=' +
      floor
    return fetchSite('/ajax/uncledatoolsbyajax.php?' + qs, { referer: detailUrl })
      .then(function (res) {
        return parseMagnets(res.html)
      })
      .catch(function () {
        return []
      })
  }

  function fetchMovie(codeOrUrl, force) {
    var isUrl = /^https?:\/\//i.test(codeOrUrl)
    var code = (isUrl ? codeOrUrl.split('/').pop() || '' : codeOrUrl).toUpperCase()

    if (!force) {
      var cached = getCache()[normCode(code)]
      if (cached) return Promise.resolve(cached)
    }

    var target = isUrl ? codeOrUrl : '/' + code
    return fetchSite(target).then(function (res) {
      var detail = parseDetail(res.html, res.url)
      if (!detail.code) detail.code = code
      return fetchMagnets(res.html, res.url).then(function (magnets) {
        detail.magnets = magnets
        putCachedMovie(detail)
        return detail
      })
    })
  }

  /** 按番号找详情：直怼详情页，404 再走搜索（与桌面版 resolveByCode 同逻辑） */
  function resolveByCode(code) {
    return fetchMovie(code, false).catch(function (e) {
      if (!/404/.test(e.message || '')) throw e
      var kinds = ['search', 'uncensored-search']
      var chain = Promise.resolve(null)
      kinds.forEach(function (kind) {
        chain = chain.then(function (found) {
          if (found) return found
          return fetchSite(buildListPath({ kind: kind, value: code, page: 1 }))
            .then(function (res) {
              var list = parseList(res.html, res.url, { kind: kind, value: code, page: 1 })
              var want = normCode(code)
              var hit = null
              list.items.forEach(function (it) {
                if (!hit && normCode(it.code) === want) hit = it
              })
              if (!hit) {
                list.items.forEach(function (it) {
                  if (!hit && normCode(it.code).indexOf(want) === 0) hit = it
                })
              }
              return hit ? fetchMovie(hit.detailUrl || hit.code, false) : null
            })
            .catch(function (e2) {
              if (/404/.test(e2.message || '')) return null
              throw e2
            })
        })
      })
      return chain
    })
  }

  // ---------------- 类别总览 ----------------
  var genreMem = {}

  function fetchGenres(uncensored) {
    var key = uncensored ? 'u' : 'c'
    var hit = genreMem[key]
    if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return Promise.resolve(hit.groups)
    return fetchSite(uncensored ? '/uncensored/genre' : '/genre').then(function (res) {
      var doc = parseDoc(res.html)
      var groups = []
      doc.querySelectorAll('h4').forEach(function (h4) {
        var name = text(h4)
        if (!name) return
        var items = []
        var node = h4.nextElementSibling
        while (node && node.tagName !== 'H4') {
          node.querySelectorAll('a[href*="/genre/"]').forEach(function (a) {
            var href = (a.getAttribute('href') || '').replace(/\/+$/, '')
            var id = href.split('/').pop() || ''
            var label = (a.getAttribute('title') || text(a)).trim()
            if (
              id &&
              label &&
              !items.some(function (it) {
                return it.id === id
              })
            )
              items.push({ id: id, name: label })
          })
          node = node.nextElementSibling
        }
        if (items.length) groups.push({ name: name, items: items })
      })
      if (!groups.length) {
        var all = []
        doc.querySelectorAll('a[href*="/genre/"]').forEach(function (a) {
          var href = (a.getAttribute('href') || '').replace(/\/+$/, '')
          var id = href.split('/').pop() || ''
          var label = (a.getAttribute('title') || text(a)).trim()
          if (
            id &&
            label &&
            !all.some(function (it) {
              return it.id === id
            })
          )
            all.push({ id: id, name: label })
        })
        if (all.length) groups.push({ name: '全部類別', items: all })
      }
      if (!groups.length) throw new Error('类别页解析失败，站点结构可能有变化')
      genreMem[key] = { at: Date.now(), groups: groups }
      return groups
    })
  }

  // ---------------- 本地组合筛选（与桌面版 applyLocalFilter 同逻辑，无「已下载」概念） ----------------
  function applyLocalFilter(f) {
    f = f || {}
    var favs = {}
    getFavorites().forEach(function (c) {
      favs[c] = true
    })
    var cache = getCache()
    var items = Object.keys(cache).map(function (k) {
      return cache[k]
    })

    if (f.favOnly)
      items = items.filter(function (m) {
        return favs[m.code.toUpperCase()]
      })
    if (f.keyword) {
      var kw = f.keyword.toLowerCase()
      items = items.filter(function (m) {
        return (
          m.code.toLowerCase().indexOf(kw) >= 0 ||
          m.title.toLowerCase().indexOf(kw) >= 0 ||
          m.stars.some(function (s) {
            return s.name.toLowerCase().indexOf(kw) >= 0
          })
        )
      })
    }
    function has(list, names) {
      if (!list || !list.length) return true
      return list.every(function (want) {
        return names.indexOf(want) >= 0
      })
    }
    items = items.filter(function (m) {
      return (
        has(
          f.genres,
          m.genres.map(function (g) {
            return g.name
          })
        ) &&
        has(
          f.stars,
          m.stars.map(function (s) {
            return s.name
          })
        ) &&
        has(f.directors, m.director ? [m.director.name] : []) &&
        has(f.studios, m.studio ? [m.studio.name] : [])
      )
    })
    // 安卓没有本地影片库：「已下载」筛选恒为空，「未下载」等于全部
    if (f.onlyDownloaded) items = []

    function count(pick) {
      var map = {}
      items.forEach(function (m) {
        pick(m).forEach(function (ref) {
          if (map[ref.name]) map[ref.name].count++
          else map[ref.name] = { name: ref.name, id: ref.id, count: 1 }
        })
      })
      return Object.keys(map)
        .map(function (k) {
          return map[k]
        })
        .sort(function (a, b) {
          return b.count - a.count || a.name.localeCompare(b.name)
        })
    }

    var facets = {
      genres: count(function (m) {
        return m.genres
      }),
      stars: count(function (m) {
        return m.stars
      }),
      directors: count(function (m) {
        return m.director ? [m.director] : []
      }),
      studios: count(function (m) {
        return m.studio ? [m.studio] : []
      })
    }

    var sorted = items.slice().sort(function (a, b) {
      switch (f.sort) {
        case 'date-asc':
          return a.date.localeCompare(b.date)
        case 'code':
          return a.code.localeCompare(b.code)
        case 'added-desc':
          return b.fetchedAt - a.fetchedAt
        default:
          return b.date.localeCompare(a.date)
      }
    })

    return { items: sorted.slice(0, 600), total: sorted.length, facets: facets }
  }

  // ---------------- 在线观看 ----------------
  var SITES = [
    {
      id: 'missav',
      name: 'MissAV',
      kind: 'direct',
      build: function (code) {
        return 'https://missav.live/cn/' + code.toLowerCase()
      },
      hosts: ['missav.live', 'missav.ws', 'missav.ai', 'missav.com']
    },
    {
      id: 'jable',
      name: 'Jable',
      kind: 'direct',
      build: function (code) {
        return 'https://jable.tv/videos/' + code.toLowerCase() + '/'
      },
      hosts: ['jable.tv']
    },
    {
      id: 'supjav',
      name: 'SupJav',
      kind: 'search',
      build: function (code) {
        return 'https://supjav.com/zh/?s=' + encodeURIComponent(code)
      },
      hosts: ['supjav.com']
    },
    {
      id: 'netflav',
      name: 'Netflav',
      kind: 'search',
      build: function (code) {
        return 'https://netflav.com/search?type=title&keyword=' + encodeURIComponent(code)
      },
      hosts: ['netflav.com', 'netflav5.com']
    }
  ]

  // ---------------- 统一返回包装（与桌面版 IPC 的 {ok,data|error} 一致） ----------------
  function ok(data) {
    return Promise.resolve({ ok: true, data: data })
  }

  function err(message) {
    return Promise.resolve({ ok: false, error: message })
  }

  function wrap(promise) {
    return promise
      .then(function (data) {
        return { ok: true, data: data }
      })
      .catch(function (e) {
        return { ok: false, error: (e && e.message) || '未知错误' }
      })
  }

  var idleCrawl = {
    running: false,
    kind: 'pages',
    fromPage: 0,
    toPage: 0,
    currentPage: 0,
    totalItems: 0,
    doneItems: 0,
    failedItems: 0,
    unmatched: [],
    message: ''
  }

  var NO_DL = '安卓版不支持下载，请使用「在線觀看」'

  // ---------------- window.api ----------------
  window.api = {
    settings: {
      get: function () {
        return ok(getSettings())
      },
      save: function (patch) {
        var cur = loadJson('jbSettings', {})
        var next = Object.assign({}, cur, patch)
        if (patch && patch.bc) next.bc = Object.assign({}, cur.bc || {}, patch.bc)
        saveJson('jbSettings', next)
        return ok(getSettings())
      },
      probeProxy: function () {
        return ok(null) // 安卓走系统 VPN，无需应用内代理
      },
      autoProxy: function () {
        return ok(getSettings())
      },
      pickDir: function () {
        return err('安卓版没有本地影片目录')
      }
    },
    cache: {
      info: function () {
        var raw = localStorage.getItem('jbCache') || '{}'
        return ok({
          dir: 'localStorage',
          file: 'jbCache',
          bytes: raw.length,
          movies: Object.keys(getCache()).length
        })
      },
      clear: function () {
        localStorage.removeItem('jbCache')
        return ok({ dir: 'localStorage', file: 'jbCache', bytes: 2, movies: 0 })
      }
    },
    movies: {
      list: function (query) {
        return wrap(
          fetchSite(buildListPath(query)).then(function (res) {
            return parseList(res.html, res.url, query)
          })
        )
      },
      detail: function (code, force) {
        return wrap(fetchMovie(code, !!force))
      },
      cached: function (code) {
        return ok(getCache()[normCode(code)] || null)
      },
      localFilter: function (filter) {
        return ok(applyLocalFilter(filter))
      },
      genres: function (uncensored) {
        return wrap(fetchGenres(!!uncensored))
      }
    },
    favorites: {
      list: function () {
        return ok(getFavorites())
      },
      toggle: function (code) {
        var up = String(code).toUpperCase()
        var codes = getFavorites()
        var next
        if (codes.indexOf(up) >= 0) {
          next = codes.filter(function (c) {
            return c !== up
          })
        } else {
          next = [up].concat(codes)
          // 收藏页拿缓存过滤：没资料的先后台抓，抓完广播刷新（与桌面版同逻辑）
          if (!getCache()[normCode(up)]) {
            resolveByCode(up)
              .then(function (detail) {
                if (detail) emit('favHydrated', detail.code)
              })
              .catch(function () {
                /* 网络失败忽略，下次打开详情自然补上 */
              })
          }
        }
        saveJson('jbFavs', next)
        return ok(next)
      }
    },
    library: {
      scan: function () {
        return ok({ codes: [], entries: [] })
      },
      list: function () {
        return ok({ codes: [], entries: [] })
      },
      files: function () {
        return ok([])
      },
      play: function () {
        return err('安卓版没有本地影片，请使用「在線觀看」')
      },
      reveal: function () {
        return ok(true)
      },
      missing: function () {
        return ok({ pending: [], skipped: [] })
      },
      fill: function () {
        return ok(idleCrawl)
      }
    },
    downloads: {
      add: function () {
        return err(NO_DL)
      },
      list: function () {
        return ok([])
      },
      pause: function () {
        return err(NO_DL)
      },
      resume: function () {
        return err(NO_DL)
      },
      remove: function () {
        return err(NO_DL)
      },
      clearFinished: function () {
        return ok([])
      },
      play: function () {
        return err(NO_DL)
      },
      openExternal: function (magnet) {
        // 手机上装了 BT 客户端的话可以接走磁力
        try {
          AndroidNative.openUrl(magnet)
          return ok(true)
        } catch (e) {
          return err('没有可处理磁力链接的应用')
        }
      },
      openBitComet: function () {
        return err('安卓版不支持 BitComet')
      },
      testBitComet: function () {
        return err('安卓版不支持 BitComet')
      },
      probeBitComet: function () {
        return ok(null)
      },
      detectBitComet: function () {
        return ok({ exePath: null, downloadsXml: null })
      },
      bcFolders: function () {
        return ok({ folders: [], defaultDir: '' })
      },
      bcAddFolder: function () {
        return ok([])
      }
    },
    online: {
      sites: function () {
        return ok(
          SITES.map(function (s) {
            return { id: s.id, name: s.name, kind: s.kind }
          })
        )
      },
      open: function (code, siteId) {
        var site = null
        SITES.forEach(function (s) {
          if (s.id === siteId) site = s
        })
        if (!site) return err('未知的在线站点：' + siteId)
        var trimmed = String(code || '').trim()
        if (!trimmed) return err('番号为空')
        var url = site.build(trimmed)
        try {
          AndroidNative.openPlayer(url, JSON.stringify(site.hosts), trimmed + ' - ' + site.name)
          return ok(url)
        } catch (e) {
          return err('打开播放窗口失败：' + e.message)
        }
      }
    },
    crawl: {
      start: function () {
        return err('安卓版不支持批量抓取（数据缓存在手机上意义不大）')
      },
      cancel: function () {
        return ok(idleCrawl)
      },
      progress: function () {
        return ok(idleCrawl)
      }
    },
    util: {
      copy: function (text) {
        try {
          AndroidNative.copy(text)
          return ok(true)
        } catch (e) {
          return err('复制失败')
        }
      },
      openUrl: function (url) {
        try {
          AndroidNative.openUrl(url)
          return ok(true)
        } catch (e) {
          return err('打开失败')
        }
      },
      zoom: function (scale) {
        return ok(scale) // 手机上用系统手势缩放
      }
    },
    events: {
      onDownloads: function (cb) {
        return on('downloads', cb)
      },
      onLibrary: function (cb) {
        return on('library', cb)
      },
      onCrawl: function (cb) {
        return on('crawl', cb)
      },
      onFavHydrated: function (cb) {
        return on('favHydrated', cb)
      }
    }
  }
})()
