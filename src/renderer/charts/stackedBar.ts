// ECharts stacked bar by model (real values)
import { DataSnapshot } from '../../shared/types'
import { modelColor } from '../composables/modelColor'

export function buildStackedBarOption(snap: DataSnapshot) {
  const dates = snap.daily.map(d => d.date)
  const ranked = snap.rankedModels

  const series = ranked.map(model => ({
    name: model,
    type: 'bar',
    stack: 'total',
    emphasis: { focus: 'series' },
    data: snap.daily.map(d => {
      const m = snap.perDayModel[d.date]?.[model]
      return m ? m.total : 0
    }),
    itemStyle: { color: modelColor(model, ranked) }
  }))

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const idx = params[0].dataIndex
        const rec = snap.daily[idx]
        const lines = rec.topModels.map((m: any) => {
          const v = m.value >= 1e6 ? (m.value / 1e6).toFixed(1) + 'M'
                  : m.value >= 1e3 ? (m.value / 1e3).toFixed(1) + 'K'
                  : String(m.value)
          return `<div>${m.name}: ${v}</div>`
        }).join('')
        return `
          <div style="padding:6px 10px;min-width:180px">
            <div style="font-weight:600;margin-bottom:6px">${rec.date}</div>
            <div>总量: <b>${rec.total.toLocaleString()}</b></div>
            <div>缓存命中率: <b>${rec.cacheHitRate.toFixed(2)}%</b></div>
            <div style="margin-top:6px;border-top:1px solid #555;padding-top:4px">${lines}</div>
          </div>
        `
      }
    },
    legend: {
      type: 'scroll',
      top: 0,
      data: ranked
    },
    grid: { left: 60, right: 20, top: 40, bottom: 60 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { rotate: dates.length > 30 ? 45 : 0 }
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(v) }
    },
    series,
    dataZoom: dates.length > 30 ? [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', height: 20, bottom: 10 }
    ] : undefined
  }
}
