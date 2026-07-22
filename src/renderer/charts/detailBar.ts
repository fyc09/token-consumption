// ECharts stacked bar for detail dialog — by model, minute / hour modes
import { DayDetail } from '../../shared/types'
import { modelColor } from '../composables/modelColor'

export function buildMinuteBar(detail: DayDetail, ranked: string[]) {
  // 分钟模式: 288 个 5 分钟间隔 (00:00, 00:05, ..., 23:55)，按模型堆叠
  const labels: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 5) {
      labels.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }

  // 将每分钟数据汇总为 5 分钟间隔
  const series = ranked
    .filter(model => detail.perModelMinutely[model]?.some(v => v > 0))
    .map(model => {
      const minutely = detail.perModelMinutely[model] || []
      // 288 buckets
      const buckets: number[] = []
      for (let i = 0; i < 288; i++) {
        let sum = 0
        for (let j = 0; j < 5; j++) {
          sum += minutely[i * 5 + j] || 0
        }
        buckets.push(sum)
      }
      return {
        name: model,
        type: 'bar' as const,
        stack: 'total',
        emphasis: { focus: 'series' as const },
        data: buckets,
        itemStyle: { color: modelColor(model, ranked) }
      }
    })

  return {
    backgroundColor: 'transparent',
    title: { text: '按 5 分钟分布', left: 'center', top: 0, textStyle: { fontSize: 14 } },
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const idx = params[0].dataIndex
        const total = params.reduce((s, p) => s + (p.value || 0), 0)
        const lines = params
          .filter((p: any) => p.value > 0)
          .map((p: any) => {
            const v = p.value >= 1e6 ? (p.value / 1e6).toFixed(1) + 'M' : p.value >= 1e3 ? (p.value / 1e3).toFixed(1) + 'K' : String(p.value)
            return `<div>${p.marker}${p.seriesName}: ${v}</div>`
          }).join('')
        return `<div style="padding:6px 10px">
          <div style="font-weight:600">${labels[idx]}</div>
          <div>合计: <b>${total.toLocaleString()}</b></div>
          ${lines}
        </div>`
      }
    },
    legend: { type: 'scroll', top: 20 },
    grid: { left: 60, right: 20, top: 60, bottom: 60 },
    xAxis: { type: 'category', data: labels, axisLabel: { interval: 11 } },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(v) }
    },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 10 }],
    series
  }
}

export function buildHourlyBar(detail: DayDetail, ranked: string[]) {
  // 小时模式: 24 小时 (00:00 - 23:00)，按模型堆叠
  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

  const series = ranked
    .filter(model => detail.perModelHourly[model]?.some(v => v > 0))
    .map(model => ({
      name: model,
      type: 'bar' as const,
      stack: 'total',
      emphasis: { focus: 'series' as const },
      data: detail.perModelHourly[model] || [],
      itemStyle: { color: modelColor(model, ranked) }
    }))

  return {
    backgroundColor: 'transparent',
    title: { text: '按小时分布', left: 'center', top: 0, textStyle: { fontSize: 14 } },
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const idx = params[0].dataIndex
        const total = params.reduce((s, p) => s + (p.value || 0), 0)
        const lines = params
          .filter((p: any) => p.value > 0)
          .map((p: any) => {
            const v = p.value >= 1e6 ? (p.value / 1e6).toFixed(1) + 'M' : p.value >= 1e3 ? (p.value / 1e3).toFixed(1) + 'K' : String(p.value)
            return `<div>${p.marker}${p.seriesName}: ${v}</div>`
          }).join('')
        return `<div style="padding:6px 10px">
          <div style="font-weight:600">${labels[idx]}</div>
          <div>合计: <b>${total.toLocaleString()}</b></div>
          ${lines}
        </div>`
      }
    },
    legend: { type: 'scroll', top: 20 },
    grid: { left: 60, right: 20, top: 60, bottom: 40 },
    xAxis: { type: 'category', data: labels, axisLabel: { interval: 0 } },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(v) }
    },
    series
  }
}