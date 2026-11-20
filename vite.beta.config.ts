import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve('src/beta'),
  base: '/beta/',
  build: { outDir: resolve('worker/beta-dist'), emptyOutDir: true },
  server: {
    host: '127.0.0.1', port: 5174,
    proxy: {
      '/v1': { target: 'http://127.0.0.1:8787' },
      '/health': { target: 'http://127.0.0.1:8787' },
    },
  },
})
