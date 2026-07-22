// ECharts 100% stacked bar by model
import { DataSnapshot } from '../../shared/types'
import { modelColor } from '../composables/modelColor'

export function buildPercentBarOption(snap: DataSnapshot) {
  const dates = snap.daily.map(d => d.date)
  const ranked = snap.rankedModels

  // For each (date, model), compute the percentage of that day's total
  const series = ranked.map(model => ({
    name: model,
    type: 'bar',
    stack: 'pct',
    emphasis: { focus: 'series' },
    data: snap.daily.map(d => {
      const dayTotal = d.total
      if (dayTotal === 0) return 0
      const m = snap.perDayModel[d.date]?.[model]
      return m ? (m.total / dayTotal) * 100 : 0
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
        const lines = rec.allModels.map((m: any) => {
          const v = m.value >= 1e6 ? (m.value / 1e6).toFixed(1) + 'M'
                  : m.value >= 1e3 ? (m.value / 1e3).toFixed(1) + 'K'
                  : String(m.value)
          return `<div>${m.name}: ${v}</div>`
        }).join('')
        return `
          <div style="padding:6px 10px;min-width:200px">
            <div style="font-weight:600;margin-bottom:6px">${rec.date}</div>
            ${lines}
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
      max: 100,
      axisLabel: { formatter: '{value}%' }
    },
    series,
    dataZoom: dates.length > 30 ? [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', height: 20, bottom: 10 }
    ] : undefined
  }
}
