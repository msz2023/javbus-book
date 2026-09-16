package com.javbus.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import java.io.ByteArrayInputStream

/**
 * 在线观看播放窗口：按番号打开 MissAV / Jable / SupJav / Netflav 页面。
 * 与桌面版播放窗口同样的三层防广告：
 *   1) 禁 window.open 弹窗
 *   2) 顶层导航限制在站内（跳出白名单域一律拦截）
 *   3) 常见广告联盟域名的请求直接掐掉
 */
class PlayerActivity : Activity() {

    private lateinit var web: WebView
    private var allowedHosts: List<String> = emptyList()

    private val adHosts = listOf(
        "exoclick.com", "exosrv.com", "exdynsrv.com", "juicyads.com", "popads.net",
        "popcash.net", "propellerads.com", "trafficjunky.com", "trafficjunky.net",
        "adtng.com", "tsyndicate.com", "realsrv.com", "magsrv.com",
        "ero-advertising.com", "adsco.re", "a-ads.com", "mopvip.icu", "histats.com"
    )

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra("url") ?: run { finish(); return }
        title = intent.getStringExtra("title") ?: "在线观看"
        allowedHosts = parseHosts(intent.getStringExtra("hosts"))

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            // 播放站按 Chrome UA 服务，WebView 默认 UA 可能被识别为不支持
            userAgentString = NativeBridge.UA
            // 禁 JS 自动开新窗口（弹窗广告的主要途径）
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
        }

        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val host = request.url.host ?: return true
                // 顶层导航只允许站内（站内换片可以，跳广告页不行）
                return !allowedHosts.any { host == it || host.endsWith(".$it") }
            }

            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val host = request.url.host ?: return null
                if (adHosts.any { host == it || host.endsWith(".$it") }) {
                    // 返回空响应，广告请求直接失败
                    return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
                }
                return null
            }
        }

        web.loadUrl(url)
    }

    private fun parseHosts(json: String?): List<String> {
        if (json.isNullOrEmpty()) return emptyList()
        return try {
            val arr = JSONArray(json)
            List(arr.length()) { arr.getString(it) }
        } catch (_: Exception) {
            emptyList()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}
