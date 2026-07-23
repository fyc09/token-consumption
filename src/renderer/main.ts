import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'

import * as echarts from 'echarts'  // alias → dist/echarts.esm.js (含完整 dark 主题)
// 不再需要 import 'echarts/theme/dark' — 全量构建已内置

import App from './App.vue'

const app = createApp(App)
app.use(ElementPlus)
app.mount('#app')
