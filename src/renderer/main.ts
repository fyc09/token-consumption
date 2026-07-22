import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'

import 'echarts/theme/dark'  // 导入 ECharts 默认深色主题

import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart, LineChart, HeatmapChart } from 'echarts/charts'
import {
  TooltipComponent, GridComponent, LegendComponent,
  DataZoomComponent, VisualMapComponent, TitleComponent, GraphicComponent
} from 'echarts/components'

use([
  CanvasRenderer,
  BarChart, PieChart, LineChart, HeatmapChart,
  TooltipComponent, GridComponent, LegendComponent,
  DataZoomComponent, VisualMapComponent, TitleComponent, GraphicComponent
])

import App from './App.vue'

const app = createApp(App)
app.use(ElementPlus)
app.mount('#app')
