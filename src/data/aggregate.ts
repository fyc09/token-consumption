// Aggregate pi + opencode messages into DataSnapshot
import { RawMessage } from './pi.js'
import {
  DataSnapshot, DailyRecord, ModelStats, ModelSlice,
  MinuteRecord, DayDetail
} from '../shared/types.js'

const ALIASES: Record<string, string> = {
  'deepseek-v4-pro-260425': 'deepseek-v4-pro',
  'glm-5-2-260617':         'glm-5.2',
  'deepseek-v4-flash-beta': 'deepseek-v4-flash',
  'deepseek-v4-flash-free': 'deepseek-v4-flash',
  'minimax-m3':             'minimax-m3',
  'minimax-m2.7':           'minimax-m2.7'
}

export function normModel(raw: string): string {
  if (!raw) return 'unknown'
  const lo = raw.toLowerCase()
  return ALIASES[lo] ?? lo
}

function toLocalDateStr(ts: number): string {
  const d = new Date(ts)
  // UTC+8 to match user's earlier data
  const t = d.getTime() + 8 * 3600 * 1000
  const ld = new Date(t)
  return ld.toISOString().slice(0, 10)
}

function getWeekday(ts: number): number {
  const d = new Date(ts)
  // Convert to UTC+8 first
  const t = d.getTime() + 8 * 3600 * 1000
  const ld = new Date(t)
  // ISO weekday: 1=Mon, 7=Sun -> map to 0=Mon, 6=Sun
  const wd = ld.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  return wd === 0 ? 6 : wd - 1
}

function getHourLocal(ts: number): number {
  const t = ts + 8 * 3600 * 1000
  return new Date(t).getUTCHours()
}

function getMinuteLocal(ts: number): number {
  const t = ts + 8 * 3600 * 1000
  return new Date(t).getUTCHours() * 60 + new Date(t).getUTCMinutes()
}

export function aggregate(msgs: RawMessage[]): DataSnapshot {
  // Normalize models first
  const normed = msgs.map(m => ({ ...m, model: normModel(m.model) }))

  // Group by (date, model)
  const perDayModel: Record<string, Record<string, ModelStats>> = {}
  const modelTotals: Record<string, number> = {}
  // Per-day per-hour raw data (for detail dialog minute mode)
  const perDayHour: Record<string, Record<number, { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number; reasoning: number; total: number }>> = {}
  // Per-day per-hour per-model, per-day per-minute per-model
  const perDayHourModel: Record<string, Record<number, Record<string, number>>> = {}
  const perDayMinuteModel: Record<string, Record<number, Record<string, number>>> = {}
  for (const m of normed) {
    const date = toLocalDateStr(m.ts)
    if (!perDayModel[date]) perDayModel[date] = {}
    if (!perDayModel[date][m.model]) {
      perDayModel[date][m.model] = {
        calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
        reasoning: 0, total: 0
      }
    }
    const c = perDayModel[date][m.model]
    c.calls += 1
    c.input += m.input
    c.output += m.output
    c.cacheRead += m.cacheRead
    c.cacheWrite += m.cacheWrite
    c.reasoning += m.reasoning
    c.total += m.total
    modelTotals[m.model] = (modelTotals[m.model] || 0) + m.total

    // Per-hour
    const hour = getHourLocal(m.ts)
    if (!perDayHour[date]) perDayHour[date] = {}
    if (!perDayHour[date][hour]) perDayHour[date][hour] = {
      calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0
    }
    const h = perDayHour[date][hour]
    h.calls += 1
    h.input += m.input
    h.output += m.output
    h.cacheRead += m.cacheRead
    h.cacheWrite += m.cacheWrite
    h.reasoning += m.reasoning
    h.total += m.total

    // Per-hour per-model
    if (!perDayHourModel[date]) perDayHourModel[date] = {}
    if (!perDayHourModel[date][hour]) perDayHourModel[date][hour] = {}
    perDayHourModel[date][hour][m.model] = (perDayHourModel[date][hour][m.model] || 0) + m.total

    // Per-minute per-model
    const minute = getMinuteLocal(m.ts)
    if (!perDayMinuteModel[date]) perDayMinuteModel[date] = {}
    if (!perDayMinuteModel[date][minute]) perDayMinuteModel[date][minute] = {}
    perDayMinuteModel[date][minute][m.model] = (perDayMinuteModel[date][minute][m.model] || 0) + m.total
  }

  // Rank models by total
  const rankedModels = Object.keys(modelTotals).sort(
    (a, b) => modelTotals[b] - modelTotals[a]
  )

  // Build daily[]
  const dates = Object.keys(perDayModel).sort()
  const daily: DailyRecord[] = dates.map(date => {
    const models = perDayModel[date]
    let total = 0, input = 0, output = 0, cacheRead = 0, cacheWrite = 0, reasoning = 0, calls = 0
    for (const k of Object.keys(models)) {
      const c = models[k]
      total += c.total; input += c.input; output += c.output
      cacheRead += c.cacheRead; cacheWrite += c.cacheWrite
      reasoning += c.reasoning; calls += c.calls
    }
    const cacheHitRate = (input + cacheRead) > 0
      ? cacheRead / (input + cacheRead) * 100 : 0
    const allModels: ModelSlice[] = Object.keys(models)
      .map(name => ({ name, value: models[name].total, pct: 0 }))
      .sort((a, b) => b.value - a.value)
      .map(s => ({ ...s, pct: total > 0 ? s.value / total * 100 : 0 }))
    const topModels = allModels.slice(0, 3)
    return {
      date, weekday: dateToWeekday(date),
      total, input, output, cacheRead, cacheWrite, reasoning,
      cacheHitRate, calls, topModels, allModels
    }
  })

  const grandTotal = daily.reduce((s, d) => s + d.total, 0)
  const today = toLocalDateStr(Date.now())
  const todayTotal = perDayModel[today]
    ? Object.values(perDayModel[today]).reduce((s, c) => s + c.total, 0)
    : 0

  return {
    generatedAt: new Date().toISOString(),
    range: { from: dates[0] || '', to: dates[dates.length - 1] || '' },
    grandTotal, todayTotal, todayDate: today,
    daily, perDayModel, rankedModels,
    perDayHour, perDayHourModel, perDayMinuteModel
  } as any
}

function dateToWeekday(dateStr: string): number {
  // Parse YYYY-MM-DD as UTC+8 date
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const wd = dt.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  return wd === 0 ? 6 : wd - 1
}

export function getDayDetail(snap: DataSnapshot, date: string): DayDetail | null {
  const models = snap.perDayModel[date]
  if (!models) return null
  let total = 0, input = 0, output = 0, cacheRead = 0, cacheWrite = 0, reasoning = 0, calls = 0
  for (const k of Object.keys(models)) {
    const c = models[k]
    total += c.total; input += c.input; output += c.output
    cacheRead += c.cacheRead; cacheWrite += c.cacheWrite
    reasoning += c.reasoning; calls += c.calls
  }
  const cacheHitRate = (input + cacheRead) > 0
    ? cacheRead / (input + cacheRead) * 100 : 0

  // Build minutes: 24 entries
  const hourMap = (snap as any).perDayHour?.[date] || {}
  const minutes: MinuteRecord[] = Array.from({ length: 24 }, (_, h) => {
    const hd = hourMap[h]
    if (hd) {
      return {
        hour: h,
        input: hd.input, output: hd.output, cacheRead: hd.cacheRead,
        cacheWrite: hd.cacheWrite, reasoning: hd.reasoning,
        total: hd.total, calls: hd.calls
      }
    }
    return { hour: h, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0, calls: 0 }
  })

  // Per-model hourly: model -> [24 hours of total]
  const perModelHourly: Record<string, number[]> = {}
  const hourModelMap = (snap as any).perDayHourModel?.[date] || {}
  for (const model of Object.keys(models)) {
    perModelHourly[model] = Array.from({ length: 24 }, (_, h) => hourModelMap[h]?.[model] || 0)
  }

  // Per-model minutely: model -> [1440 minutes of total]
  const perModelMinutely: Record<string, number[]> = {}
  const minuteModelMap = (snap as any).perDayMinuteModel?.[date] || {}
  for (const model of Object.keys(models)) {
    perModelMinutely[model] = Array.from({ length: 1440 }, (_, m) => minuteModelMap[m]?.[model] || 0)
  }

  // perDayContext: ±3 days
  const dateIdx = snap.daily.findIndex(d => d.date === date)
  const ctxStart = Math.max(0, dateIdx - 3)
  const ctxEnd = Math.min(snap.daily.length, dateIdx + 4)
  const perDayContext = snap.daily.slice(ctxStart, ctxEnd)

  return {
    date, total, input, output, cacheRead, cacheWrite, reasoning,
    cacheHitRate, calls, perModel: models, minutes, perDayContext,
    perModelHourly, perModelMinutely
  }
}
