import { defineConfig } from 'vite'

export default defineConfig({
  // Capacitor はビルド成果物を webDir から取り込む。
  build: { outDir: 'dist', target: 'es2022' },
  // 開発中に iPhone の Safari から同じ LAN 経由で開けるようにする。
  server: { host: true },
})
