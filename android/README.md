# JavBus Mobile（安卓版）

桌面版的安卓移植：**只保留浏览 + 在线观看**，不含下载与本地影片库。
界面与桌面版是同一套 React 代码（`assets/www/` 里的 bundle 直接复用桌面版编译产物），
底层把 Electron 的主进程逻辑换成了安卓原生实现：

| 桌面版 | 安卓版 |
|---|---|
| Electron 主进程 + undici 抓取 | `NativeBridge.kt` 原生 HTTP（绕过 WebView 跨域限制） |
| cheerio 解析 HTML | `android-adapter.js` 里的 DOMParser（同逻辑移植） |
| 收藏 / 设置 / 影片缓存（JSON 文件） | localStorage |
| 在线观看 BrowserWindow | `PlayerActivity`（同样三层防广告：禁弹窗 / 锁站内导航 / 掐广告域名） |
| 封面防盗链（webRequest 注入 Referer） | `MainActivity.shouldInterceptRequest` 原生代抓图片 |
| BitComet 下载 | 不支持（点磁力会提示；「用系统程序打开」可交给手机上的 BT 客户端） |

## 怎么打 APK

前提：装好 [Android Studio](https://developer.android.com/studio)（自带 JDK 17 与 Android SDK）。

1. Android Studio → **Open** → 选择这个 `android/` 目录
2. 首次打开会自动下载 Gradle 与依赖（本项目零第三方依赖，很快）
3. 菜单 **Build → Build App Bundle(s) / APK(s) → Build APK(s)**
4. 产物在 `android/app/build/outputs/apk/release/app-release.apk`
   （release 也用 debug 签名，装上即用；要上架才需要配正式签名）

命令行方式（装了 SDK 与 gradle 的话）：

```bash
cd android
gradle assembleRelease
```

## 使用须知

- **手机必须开启代理/VPN**（如 Clash for Android 全局或分应用模式），
  JavBus 与各在线站点国内均无法直连。App 自动走系统 VPN，无需在应用内配置。
- 首页/搜索/类别标签/收藏与桌面版一致；影片详情页点 **「在線觀看」** 任一源即可播放。
- 收藏数据存在手机本地（localStorage），卸载 App 会清空。
- 界面按桌面宽屏设计，手机上建议横屏使用，或双指缩放调整。

## 升级界面

桌面版界面代码更新后，重新生成 bundle 并覆盖 `app/src/main/assets/www/assets/` 下的
`bundle.js` / `styles.css` 即可（其余文件不用动），再重新打 APK。
