// ECharts stacked bar for detail dialog — by model/provider, minute / hour modes
import { DayDetail } from '../../shared/types'
import { seriesColor } from '../composables/modelColor'

type ViewMode = 'model' | 'provider'

function rankedList(detail: DayDetail, mode: ViewMode, snapRanked: string[]): string[] {
  const data = mode === 'provider' ? detail.perProvider : detail.perModel
  const hourly = mode === 'provider' ? detail.perProviderHourly : detail.perModelHourly
  // Use global ranking order if applicable, otherwise local order
  const keys = Object.keys(data)
  const localRanked = keys.slice().sort((a, b) => data[b].total - data[a].total)
  // Prefer global ranked order but filter to local keys
  const global = snapRanked.filter(k => keys.includes(k))
  if (global.length > 0) return global.concat(localRanked.filter(k => !global.includes(k)))
  return localRanked
}

export function buildMinuteBar(detail: DayDetail, snapRanked: string[], mode: ViewMode = 'model') {
  const labels: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 5) {
      labels.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }

  const minutelyMap = mode === 'provider' ? detail.perProviderMinutely : detail.perModelMinutely
  const ranked = rankedList(detail, mode, snapRanked)

  const series = ranked
    .filter(key => minutelyMap[key]?.some(v => v > 0))
    .map(key => {
      const minutely = minutelyMap[key] || []
      const buckets: number[] = []
      for (let i = 0; i < 288; i++) {
        let sum = 0
        for (let j = 0; j < 5; j++) {
          sum += minutely[i * 5 + j] || 0
        }
        buckets.push(sum)
      }
      return {
        name: key,
        type: 'bar' as const,
        stack: 'total',
        emphasis: { focus: 'series' as const },
        data: buckets,
        itemStyle: { color: seriesColor(key, ranked) }
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

export function buildHourlyBar(detail: DayDetail, snapRanked: string[], mode: ViewMode = 'model') {
  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

  const hourlyMap = mode === 'provider' ? detail.perProviderHourly : detail.perModelHourly
  const ranked = rankedList(detail, mode, snapRanked)

  const series = ranked
    .filter(key => hourlyMap[key]?.some(v => v > 0))
    .map(key => ({
      name: key,
      type: 'bar' as const,
      stack: 'total',
      emphasis: { focus: 'series' as const },
      data: hourlyMap[key] || [],
      itemStyle: { color: seriesColor(key, ranked) }
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
