// ECharts heatmap option (GitHub-style 7×52 grid, full year)
import { DataSnapshot, DailyRecord } from '../../shared/types'
import { HEATMAP_COLORS } from '../composables/modelColor'

const N_WEEKS = 52
const N_DAYS = 7

function toUTC8Date(ts: number): Date {
  return new Date(ts + 8 * 3600 * 1000)
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function mondayOfThisWeekUTC8(): Date {
  const now = Date.now()
  const utc8 = toUTC8Date(now)
  const wd = utc8.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = wd === 0 ? 6 : wd - 1
  return new Date(utc8.getTime() - daysFromMonday * 86400 * 1000)
}

export function buildHeatmapOption(snap: DataSnapshot) {
  const dayMap: Record<string, DailyRecord> = {}
  for (const d of snap.daily) dayMap[d.date] = d

  // Compute 5-level quantile thresholds
  const vals = snap.daily.map(d => d.total).filter(v => v > 0).sort((a, b) => a - b)
  const n = vals.length
  const q = (p: number) => n > 0 ? vals[Math.min(n - 1, Math.floor(p * n))] : 0
  const thresholds = [0, q(0.25), q(0.5), q(0.75), q(1.0)]

  function quantize(v: number): number {
    if (v <= 0) return 0
    for (let i = 0; i < 4; i++) {
      if (v <= thresholds[i + 1]) return i + 1
    }
    return 4
  }

  // 52 weeks ending this week
  const currentMonday = mondayOfThisWeekUTC8()
  const firstMonday = new Date(currentMonday.getTime() - (N_WEEKS - 1) * 7 * 86400 * 1000)

  // Build 2D data: 7 rows × 52 cols
  const data: any[] = []
  for (let w = 0; w < N_WEEKS; w++) {
    for (let dow = 0; dow < N_DAYS; dow++) {
      const day = new Date(firstMonday.getTime() + (w * 7 + dow) * 86400 * 1000)
      const ds = toDateStr(day)
      const rec = dayMap[ds]
      const level = rec ? quantize(rec.total) : 0
      // Skip future days (after today)
      const now = Date.now()
      const isFuture = day.getTime() + 8 * 3600 * 1000 > now + 86400 * 1000
      data.push({
        value: [w, dow, isFuture ? -1 : level],
        customdata: rec ? {
          date: ds,
          weekday: dow,
          total: rec.total,
          cacheHitRate: rec.cacheHitRate,
          topModels: rec.topModels
        } : { date: ds, weekday: dow, total: 0, cacheHitRate: 0, topModels: [] }
      })
    }
  }

  // Month labels: only when month changes
  const monthLabels: string[] = []
  let prevMonth = -1
  for (let w = 0; w < N_WEEKS; w++) {
    const day = new Date(firstMonday.getTime() + w * 7 * 86400 * 1000)
    if (day.getUTCMonth() !== prevMonth) {
      monthLabels.push(day.toLocaleString('en-US', { month: 'short' }))
      prevMonth = day.getUTCMonth()
    } else {
      monthLabels.push('')
    }
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      appendToBody: true,
      formatter: (params: any) => {
        const cd = params.data.customdata
        if (cd.total === 0) {
          return `<div style="padding:4px 8px"><b>${cd.date}</b><br/>无数据</div>`
        }
        const lines = cd.topModels.slice(0, 3).map((m: any) => {
          const v = m.value >= 1e6 ? (m.value / 1e6).toFixed(1) + 'M'
                  : m.value >= 1e3 ? (m.value / 1e3).toFixed(1) + 'K'
                  : String(m.value)
          return `${m.name}: ${v}`
        })
        return `
          <div style="padding:6px 10px;min-width:180px">
            <div style="font-weight:600;margin-bottom:6px">${cd.date}</div>
            <div>总量: <b>${cd.total.toLocaleString()}</b></div>
            <div>缓存命中率: <b>${cd.cacheHitRate.toFixed(2)}%</b></div>
            <div style="margin-top:6px;border-top:1px solid #555;padding-top:4px">${lines.join('<br/>')}</div>
          </div>
        `
      }
    },
    grid: { left: 40, right: 10, top: 30, bottom: 20, containLabel: false },
    xAxis: {
      type: 'category',
      data: monthLabels,
      position: 'top',
      axisLine: { show: false },
      axisTick: { show: false },
      splitArea: { show: false },
      axisLabel: { fontSize: 10, color: '#999' }
    },
    yAxis: {
      type: 'category',
      data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitArea: { show: false },
      axisLabel: {
        fontSize: 10, color: '#999',
        formatter: (val: string) => ['Mon','Wed','Fri'].includes(val) ? val : ''
      }
    },
    visualMap: {
      show: false,
      min: -1, max: 4,
      inRange: { color: ['#0f0f12', ...HEATMAP_COLORS] }
    },
    series: [{
      type: 'heatmap',
      data,
      itemStyle: { borderColor: '#0f0f12', borderWidth: 3, borderRadius: 7 },
      emphasis: { itemStyle: { borderColor: '#409eff', borderWidth: 3, borderRadius: 7 } }
    }]
  }
}
