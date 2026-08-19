import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tokinets.gimmick',
  appName: 'Smartphone Gimmick',
  webDir: 'dist',
  ios: {
    // セーフエリアは CSS の env(safe-area-inset-*) で自前処理しているため、
    // WKWebView のネイティブ自動インセットは無効化する。
    contentInset: 'never',
    // 端末を回す操作が WebView のスクロール/バウンドに化けるのを防ぐ。
    scrollEnabled: false,
  },
}

export default config
