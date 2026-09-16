package com.javbus.mobile

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * JS ↔ 原生桥。页面用 AndroidNative.fetch(id, url, opts) 发请求，
 * 原生抓完后 evaluateJavascript 回调 window.__nativeResolve(id, ok, payload) 兑现 Promise。
 * 这样绕开 WebView 里 file:// 页面对 https 站点的跨域限制。
 */
class NativeBridge(private val activity: Activity, private val webView: WebView) {

    private val pool = Executors.newFixedThreadPool(4)

    companion object {
        const val UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

        /** existmag=all 让磁力区块完整输出；age=verified 跳过年龄墙（与桌面版一致） */
        const val COOKIE = "existmag=all; age=verified; dv=1"
    }

    @JavascriptInterface
    fun fetch(id: String, url: String, optsJson: String) {
        pool.execute {
            val result = JSONObject()
            var ok = true
            try {
                val opts = try { JSONObject(optsJson) } catch (_: Exception) { JSONObject() }
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.instanceFollowRedirects = true
                conn.connectTimeout = 20_000
                conn.readTimeout = 30_000
                conn.setRequestProperty("User-Agent", UA)
                conn.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9,ja;q=0.6")
                if (url.contains("javbus")) conn.setRequestProperty("Cookie", COOKIE)
                val referer = opts.optString("referer")
                if (referer.isNotEmpty()) conn.setRequestProperty("Referer", referer)

                val status = conn.responseCode
                val stream = if (status >= 400) conn.errorStream else conn.inputStream
                val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
                result.put("status", status)
                result.put("url", conn.url.toString())
                result.put("body", body)
            } catch (e: Exception) {
                ok = false
                result.put("error", e.message ?: "网络请求失败")
            }
            resolve(id, ok, result.toString())
        }
    }

    private fun resolve(id: String, ok: Boolean, payload: String) {
        val js = "window.__nativeResolve(${JSONObject.quote(id)}, $ok, ${JSONObject.quote(payload)})"
        activity.runOnUiThread { webView.evaluateJavascript(js, null) }
    }

    /** 打开在线观看播放窗口（独立 Activity，带广告拦截与站内导航限制） */
    @JavascriptInterface
    fun openPlayer(url: String, hostsJson: String, title: String) {
        val intent = Intent(activity, PlayerActivity::class.java).apply {
            putExtra("url", url)
            putExtra("hosts", hostsJson)
            putExtra("title", title)
        }
        activity.runOnUiThread { activity.startActivity(intent) }
    }

    @JavascriptInterface
    fun copy(text: String) {
        activity.runOnUiThread {
            val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("javbus", text))
        }
    }

    @JavascriptInterface
    fun openUrl(url: String) {
        try {
            activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) {
            /* 没有可处理的应用时忽略 */
        }
    }
}
