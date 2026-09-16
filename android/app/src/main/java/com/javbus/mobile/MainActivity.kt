package com.javbus.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.net.HttpURLConnection
import java.net.URL

/**
 * 主界面：加载 assets/www 里的 React 界面（与桌面版同一套代码），
 * 数据抓取走 NativeBridge，封面图走 shouldInterceptRequest 补 Referer（站点图片有防盗链）。
 */
class MainActivity : Activity() {

    private lateinit var web: WebView

    /** 需要补 Referer 的图片域（javbus 本站 + DMM 图床） */
    private val imageHosts = listOf("javbus.com", "dmm.co.jp", "javbus22.com")

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            // 桌面版界面按宽屏设计，手机上先按可读比例缩放
            useWideViewPort = true
            loadWithOverviewMode = true
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val url = request.url.toString()
                val host = request.url.host ?: return null
                if (imageHosts.any { host == it || host.endsWith(".$it") }) {
                    return fetchWithReferer(url, host)
                }
                return null
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                // 主界面只允许本地页面；点到外链交给系统浏览器
                if (url.startsWith("file:")) return false
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                return true
            }
        }

        web.addJavascriptInterface(NativeBridge(this, web), "AndroidNative")
        web.loadUrl("file:///android_asset/www/index.html")
    }

    /** 带 Referer / UA / Cookie 抓图片，绕过防盗链（此回调本身在后台线程，允许同步网络） */
    private fun fetchWithReferer(url: String, host: String): WebResourceResponse? {
        return try {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", NativeBridge.UA)
            conn.setRequestProperty("Referer", "https://www.javbus.com/")
            if (host.contains("javbus")) conn.setRequestProperty("Cookie", NativeBridge.COOKIE)
            val mime = conn.contentType?.substringBefore(';') ?: "image/jpeg"
            WebResourceResponse(mime, null, conn.inputStream)
        } catch (_: Exception) {
            null // 抓失败就交回 WebView 默认行为
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
