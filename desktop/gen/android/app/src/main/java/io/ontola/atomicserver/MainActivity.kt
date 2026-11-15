package io.ontola.atomicserver

import android.content.Context
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class DreamPrefsBridge(private val context: Context) {
  @JavascriptInterface
  fun syncConfig(serverUrl: String, drive: String, configJson: String) {
    context.getSharedPreferences(AtomicDreamService.PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(AtomicDreamService.KEY_SERVER_URL, serverUrl)
      .putString(AtomicDreamService.KEY_DRIVE, drive)
      .putString(AtomicDreamService.KEY_CONFIG_JSON, configJson)
      .apply()
  }
}

class MainActivity : TauriActivity() {
  private var bridgeAttached = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, true)

    ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content)) { view, windowInsets ->
        val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
        view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
        windowInsets
    }

    attachDreamBridgeWhenReady()
  }

  private fun attachDreamBridgeWhenReady(attemptsRemaining: Int = 20) {
    if (bridgeAttached) return
    val root = window?.decorView ?: return
    root.post {
      val webView = findWebView(root)
      if (webView != null) {
        webView.addJavascriptInterface(DreamPrefsBridge(applicationContext), "AtomicDreamBridge")
        bridgeAttached = true
      } else if (attemptsRemaining > 0) {
        root.postDelayed({ attachDreamBridgeWhenReady(attemptsRemaining - 1) }, 250)
      }
    }
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        val found = findWebView(view.getChildAt(i))
        if (found != null) return found
      }
    }
    return null
  }
}
