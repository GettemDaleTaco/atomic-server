package io.ontola.atomicserver

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.service.dreams.DreamService
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Fire OS / Android TV DreamService (system screensaver) that renders the
 * Atomic Server idle analytics dashboard (`/app/screensaver?dream=1`) in a
 * fullscreen WebView using the server URL & drive synced from the main app.
 */
class AtomicDreamService : DreamService() {
    companion object {
        const val PREFS_NAME = "atomic_dream_prefs"
        const val KEY_SERVER_URL = "server_url"
        const val KEY_DRIVE = "drive"
        const val KEY_CONFIG_JSON = "config_json"
        private const val DEFAULT_SERVER_URL = "http://localhost:9883"
    }

    private var webView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()

        isInteractive = false
        isFullscreen = true
        isScreenBright = true

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val serverUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL)
            ?.takeIf { it.startsWith("http://") || it.startsWith("https://") }
            ?: DEFAULT_SERVER_URL
        val drive = prefs.getString(KEY_DRIVE, "").orEmpty()

        val targetUri = Uri.parse(serverUrl.trimEnd('/'))
            .buildUpon()
            .path("/app/screensaver")
            .appendQueryParameter("dream", "1")
            .apply {
                if (drive.isNotBlank()) {
                    appendQueryParameter("drive", drive)
                }
            }
            .build()
            .toString()

        val view = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0E14"))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                useWideViewPort = true
                loadWithOverviewMode = true
            }
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    if (request?.isForMainFrame == true) {
                        view?.loadDataWithBaseURL(
                            null,
                            buildFallbackHtml(serverUrl),
                            "text/html",
                            "utf-8",
                            null
                        )
                    }
                }
            }
        }

        webView = view
        setContentView(view)
        view.loadUrl(targetUri)
    }

    override fun onDetachedFromWindow() {
        webView?.let { view ->
            view.stopLoading()
            view.destroy()
        }
        webView = null
        super.onDetachedFromWindow()
    }

    private fun buildFallbackHtml(serverUrl: String): String {
        val safeUrl = serverUrl
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8" />
              <style>
                body {
                  margin: 0;
                  height: 100vh;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  background: #0b0e14;
                  color: #e6edf3;
                  font-family: system-ui, -apple-system, sans-serif;
                }
                .clock { font-size: 5rem; font-weight: 600; letter-spacing: 0.04em; }
                .sub { margin-top: 1rem; color: #8b949e; font-size: 1.25rem; }
              </style>
            </head>
            <body>
              <div class="clock" id="clock">--:--</div>
              <div class="sub">Atomic Server DreamService · Waiting for $safeUrl</div>
              <script>
                function tick() {
                  var d = new Date();
                  document.getElementById('clock').textContent =
                    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
                tick();
                setInterval(tick, 1000);
              </script>
            </body>
            </html>
        """.trimIndent()
    }
}
