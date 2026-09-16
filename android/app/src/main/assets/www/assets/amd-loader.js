/**
 * 极简 AMD 加载器：配合 tsc --module amd --outFile 产出的单文件 bundle 使用。
 * 外部依赖 react / react-dom 映射到 UMD 全局（window.React / window.ReactDOM）。
 */
;(function () {
  var registry = {}
  var instances = {}
  var externals = {
    react: function () {
      return window.React
    },
    'react-dom': function () {
      return window.ReactDOM
    },
    'react-dom/client': function () {
      return window.ReactDOM
    }
  }

  function normalize(id, parent) {
    if (id.charAt(0) !== '.') return id
    var base = parent ? parent.split('/').slice(0, -1) : []
    var parts = base.concat(id.split('/'))
    var out = []
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]
      if (p === '.' || p === '') continue
      if (p === '..') out.pop()
      else out.push(p)
    }
    return out.join('/')
  }

  function req(id, parent) {
    var nid = normalize(id, parent)
    if (externals[nid]) return externals[nid]()
    if (instances[nid]) return instances[nid].exports
    var mod = registry[nid]
    if (!mod) throw new Error('AMD module not found: ' + nid + ' (from ' + parent + ')')
    var module = { exports: {} }
    instances[nid] = module
    var args = []
    for (var i = 0; i < mod.deps.length; i++) {
      var d = mod.deps[i]
      if (d === 'require')
        args.push(
          (function (pid) {
            return function (x) {
              return req(x, pid)
            }
          })(nid)
        )
      else if (d === 'exports') args.push(module.exports)
      else if (d === 'module') args.push(module)
      else args.push(req(d, nid))
    }
    var ret = mod.factory.apply(null, args)
    if (ret !== undefined) module.exports = ret
    return module.exports
  }

  window.define = function (name, deps, factory) {
    if (typeof name !== 'string') throw new Error('anonymous AMD module not supported')
    registry[name] = { deps: deps, factory: factory }
  }
  window.define.amd = {}
  window.__amdRequire = function (id) {
    return req(id, '')
  }
})()
