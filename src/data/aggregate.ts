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

  // Group by (date, model) and (date, provider)
  const perDayModel: Record<string, Record<string, ModelStats>> = {}
  const perDayProvider: Record<string, Record<string, ModelStats>> = {}
  const modelTotals: Record<string, number> = {}
  const providerTotals: Record<string, number> = {}
  // Per-day per-hour raw data (for detail dialog minute mode)
  const perDayHour: Record<string, Record<number, { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number; reasoning: number; total: number }>> = {}
  // Per-day per-hour per-model, per-day per-minute per-model
  // And per-day per-model+provider for export
  const perDayModelProvider: Record<string, Record<string, Record<string, ModelStats>>> = {}
  // And per-provider variants
  const perDayHourModel: Record<string, Record<number, Record<string, number>>> = {}
  const perDayMinuteModel: Record<string, Record<number, Record<string, number>>> = {}
  const perDayHourProvider: Record<string, Record<number, Record<string, number>>> = {}
  const perDayMinuteProvider: Record<string, Record<number, Record<string, number>>> = {}
  for (const m of normed) {
    const date = toLocalDateStr(m.ts)
    // Per-day per-model stats
    if (!perDayModel[date]) perDayModel[date] = {}
    if (!perDayModel[date][m.model]) {
      perDayModel[date][m.model] = {
        calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
        reasoning: 0, total: 0
      }
    }
    appendStats(perDayModel[date][m.model], m)
    modelTotals[m.model] = (modelTotals[m.model] || 0) + m.total

    // Per-day per-provider stats
    const provider = m.provider || 'unknown'
    if (!perDayProvider[date]) perDayProvider[date] = {}
    if (!perDayProvider[date][provider]) {
      perDayProvider[date][provider] = {
        calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
        reasoning: 0, total: 0
      }
    }
    appendStats(perDayProvider[date][provider], m)
    providerTotals[provider] = (providerTotals[provider] || 0) + m.total

    // Per-day per-model+provider (atomic export unit)
    if (!perDayModelProvider[date]) perDayModelProvider[date] = {}
    if (!perDayModelProvider[date][m.model]) perDayModelProvider[date][m.model] = {}
    if (!perDayModelProvider[date][m.model][provider]) {
      perDayModelProvider[date][m.model][provider] = {
        calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
        reasoning: 0, total: 0
      }
    }
    appendStats(perDayModelProvider[date][m.model][provider], m)

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

    // Per-hour per-provider
    if (!perDayHourProvider[date]) perDayHourProvider[date] = {}
    if (!perDayHourProvider[date][hour]) perDayHourProvider[date][hour] = {}
    perDayHourProvider[date][hour][provider] = (perDayHourProvider[date][hour][provider] || 0) + m.total

    // Per-minute per-model
    const minute = getMinuteLocal(m.ts)
    if (!perDayMinuteModel[date]) perDayMinuteModel[date] = {}
    if (!perDayMinuteModel[date][minute]) perDayMinuteModel[date][minute] = {}
    perDayMinuteModel[date][minute][m.model] = (perDayMinuteModel[date][minute][m.model] || 0) + m.total

    // Per-minute per-provider
    if (!perDayMinuteProvider[date]) perDayMinuteProvider[date] = {}
    if (!perDayMinuteProvider[date][minute]) perDayMinuteProvider[date][minute] = {}
    perDayMinuteProvider[date][minute][provider] = (perDayMinuteProvider[date][minute][provider] || 0) + m.total
  }

  // Rank models / providers by total
  const rankedModels = Object.keys(modelTotals).sort(
    (a, b) => modelTotals[b] - modelTotals[a]
  )
  const rankedProviders = Object.keys(providerTotals).sort(
    (a, b) => providerTotals[b] - providerTotals[a]
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
    perDayProvider, rankedProviders,
    perDayModelProvider,
    perDayHour, perDayHourModel, perDayMinuteModel,
    perDayHourProvider, perDayMinuteProvider
  } as any
}

function appendStats(s: ModelStats, m: RawMessage) {
  s.calls += 1
  s.input += m.input
  s.output += m.output
  s.cacheRead += m.cacheRead
  s.cacheWrite += m.cacheWrite
  s.reasoning += m.reasoning
  s.total += m.total
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
  const providers = snap.perDayProvider[date]
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

  // Per-model hourly+minutely
  const perModelHourly = buildHourlyLookup(models, (snap as any).perDayHourModel?.[date])
  const perModelMinutely = buildMinutelyLookup(models, (snap as any).perDayMinuteModel?.[date])

  // Per-provider hourly+minutely
  const perProviderHourly = buildHourlyLookup(providers, (snap as any).perDayHourProvider?.[date])
  const perProviderMinutely = buildMinutelyLookup(providers, (snap as any).perDayMinuteProvider?.[date])

  // perDayContext: ±3 days
  const dateIdx = snap.daily.findIndex(d => d.date === date)
  const ctxStart = Math.max(0, dateIdx - 3)
  const ctxEnd = Math.min(snap.daily.length, dateIdx + 4)
  const perDayContext = snap.daily.slice(ctxStart, ctxEnd)

  return {
    date, total, input, output, cacheRead, cacheWrite, reasoning,
    cacheHitRate, calls,
    perModel: models, perProvider: providers || {},
    minutes, perDayContext,
    perModelHourly, perModelMinutely,
    perProviderHourly, perProviderMinutely
  }
}

function buildHourlyLookup(
  stats: Record<string, ModelStats> | undefined,
  raw: Record<number, Record<string, number>> | undefined
): Record<string, number[]> {
  const result: Record<string, number[]> = {}
  if (!stats || !raw) return result
  for (const key of Object.keys(stats)) {
    result[key] = Array.from({ length: 24 }, (_, h) => raw[h]?.[key] || 0)
  }
  return result
}

function buildMinutelyLookup(
  stats: Record<string, ModelStats> | undefined,
  raw: Record<number, Record<string, number>> | undefined
): Record<string, number[]> {
  const result: Record<string, number[]> = {}
  if (!stats || !raw) return result
  for (const key of Object.keys(stats)) {
    result[key] = Array.from({ length: 1440 }, (_, m) => raw[m]?.[key] || 0)
  }
  return result
}
