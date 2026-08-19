import { defineConfig } from 'vite'

export default defineConfig({
  // 相対パスで出力する。GitHub Pages のサブパス配信でも、
  // Capacitor の capacitor:// スキームでも、同じ成果物がそのまま動く。
  base: './',
  build: { outDir: 'dist', target: 'es2022' },
  // 開発中に iPhone の Safari から同じ LAN 経由で開けるようにする。
  server: { host: true },
})
