import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@kdtu/shared': fileURLToPath(new URL('../shared/index.js', import.meta.url)),
      '@kdtu/shared/ui-tokens': fileURLToPath(new URL('../shared/ui-tokens.js', import.meta.url)),
    },
  },
  server: {
    port: 5181,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5180',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})