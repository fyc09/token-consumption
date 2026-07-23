import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: [
        { find: /^echarts\/core$/, replacement: resolve(__dirname, 'node_modules/echarts/dist/echarts.esm.js') },
        { find: /^echarts$/, replacement: resolve(__dirname, 'node_modules/echarts/dist/echarts.esm.js') },
        { find: /^@shared$/, replacement: resolve(__dirname, 'src/shared') },
        { find: /^@renderer$/, replacement: resolve(__dirname, 'src/renderer') }
      ]
    },
    plugins: [vue()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  }
})
