import { session } from 'electron'
import { siteHeaders } from './net'
import { getSettings } from './store'

/** 站点域名（含镜像），用于注入 Referer / Cookie */
function siteHosts(): string[] {
  const s = getSettings()
  const hosts = new Set<string>(['www.javbus.com', 'javbus.com'])
  for (const m of [s.activeMirror, ...s.mirrors]) {
    try {
      hosts.add(new URL(m).hostname)
    } catch {
      /* 忽略非法配置 */
    }
  }
  return [...hosts]
}

let headerHookInstalled = false

/**
 * 封面图直接用 <img> 加载，因此需要让 Chromium：
 *  1) 走同一个代理（否则图片请求直连被重置）
 *  2) 带上 Referer / Cookie / UA（站点图片有防盗链，缺 Referer 直接 403）
 */
export async function configureSession(): Promise<void> {
  const s = getSettings()
  const sess = session.defaultSession

  if (s.proxyMode !== 'off' && s.proxyUrl.trim()) {
    try {
      const url = new URL(s.proxyUrl.trim())
      const scheme = url.protocol.replace(':', '')
      await sess.setProxy({
        proxyRules: `${scheme}://${url.host}`,
        proxyBypassRules: '<local>;127.0.0.1;localhost'
      })
    } catch {
      await sess.setProxy({ proxyRules: 'direct://' })
    }
  } else {
    await sess.setProxy({ proxyRules: 'direct://' })
  }

  if (headerHookInstalled) return
  headerHookInstalled = true
  sess.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
    try {
      const host = new URL(details.url).hostname
      if (siteHosts().some((h) => host === h || host.endsWith(`.${h}`))) {
        details.requestHeaders['Referer'] = `https://${host}/`
        details.requestHeaders['User-Agent'] = siteHeaders.UA
        details.requestHeaders['Cookie'] = siteHeaders.COOKIE
      }
    } catch {
      /* 非法 URL 直接放行 */
    }
    cb({ requestHeaders: details.requestHeaders })
  })
}
