// Aggregate pi + opencode + codex messages into DataSnapshot
//
// ⚠️ 口径约定（重要）：
//   total 一律按「五项之和」重算，禁止直接使用数据源自带的 total 字段。
//   - pi        : reasoning ⊆ output（需从 output 拆出）
//   - codex     : cached ⊆ input、reasoning ⊆ output（需拆出）
//   - opencode  : reasoning / cache 均为独立项
//   各数据源读取时已统一归一化，使 input+output+reasoning+cacheRead+cacheWrite == total。
import { RawMessage } from './pi.js'
import {
  DataSnapshot, DailyRecord, ModelStats, ModelSlice,
  MinuteRecord, DayDetail, DimStats, DimTimeSeries
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

function getHourLocal(ts: number): number {
  const t = ts + 8 * 3600 * 1000
  return new Date(t).getUTCHours()
}

function getMinuteLocal(ts: number): number {
  const t = ts + 8 * 3600 * 1000
  const d = new Date(t)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

function blank(): ModelStats {
  return { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 }
}

function appendStats(s: ModelStats, m: RawMessage): void {
  s.calls += 1
  s.input += m.input
  s.output += m.output
  s.cacheRead += m.cacheRead
  s.cacheWrite += m.cacheWrite
  s.reasoning += m.reasoning
  s.total += m.total
}

function bumpDay(store: Record<string, DimStats>, date: string, key: string, m: RawMessage): void {
  if (!store[date]) store[date] = {}
  if (!store[date][key]) store[date][key] = blank()
  appendStats(store[date][key], m)
}

function bumpSeries(store: Record<string, DimTimeSeries>, date: string, bucket: number, key: string, total: number): void {
  if (!store[date]) store[date] = {}
  if (!store[date][bucket]) store[date][bucket] = {}
  store[date][bucket][key] = (store[date][bucket][key] || 0) + total
}

function rankBy(totals: Record<string, number>): string[] {
  return Object.keys(totals).sort((a, b) => totals[b] - totals[a])
}

export function aggregate(msgs: RawMessage[]): DataSnapshot {
  const normed = msgs.map(m => ({ ...m, model: normModel(m.model) }))

  const perDayModel: Record<string, DimStats> = {}
  const perDayProvider: Record<string, DimStats> = {}
  const perDayHarness: Record<string, DimStats> = {}
  const modelTotals: Record<string, number> = {}
  const providerTotals: Record<string, number> = {}
  const harnessTotals: Record<string, number> = {}

  const perDayHour: Record<string, Record<number, ModelStats>> = {}
  const perDayHourModel: Record<string, DimTimeSeries> = {}
  const perDayMinuteModel: Record<string, DimTimeSeries> = {}
  const perDayHourProvider: Record<string, DimTimeSeries> = {}
  const perDayMinuteProvider: Record<string, DimTimeSeries> = {}
  const perDayHourHarness: Record<string, DimTimeSeries> = {}
  const perDayMinuteHarness: Record<string, DimTimeSeries> = {}

  // CSV 原子行：date → harness → model → provider → stats
  const perDayCombo: Record<string, Record<string, Record<string, Record<string, ModelStats>>>> = {}

  for (const m of normed) {
    const date = toLocalDateStr(m.ts)
    const provider = m.provider || 'unknown'
    const harness = m.harness || 'unknown'

    bumpDay(perDayModel, date, m.model, m)
    bumpDay(perDayProvider, date, provider, m)
    bumpDay(perDayHarness, date, harness, m)

    modelTotals[m.model] = (modelTotals[m.model] || 0) + m.total
    providerTotals[provider] = (providerTotals[provider] || 0) + m.total
    harnessTotals[harness] = (harnessTotals[harness] || 0) + m.total

    if (!perDayCombo[date]) perDayCombo[date] = {}
    if (!perDayCombo[date][harness]) perDayCombo[date][harness] = {}
    if (!perDayCombo[date][harness][m.model]) perDayCombo[date][harness][m.model] = {}
    if (!perDayCombo[date][harness][m.model][provider]) perDayCombo[date][harness][m.model][provider] = blank()
    appendStats(perDayCombo[date][harness][m.model][provider], m)

    const hour = getHourLocal(m.ts)
    if (!perDayHour[date]) perDayHour[date] = {}
    if (!perDayHour[date][hour]) perDayHour[date][hour] = blank()
    appendStats(perDayHour[date][hour], m)

    bumpSeries(perDayHourModel, date, hour, m.model, m.total)
    bumpSeries(perDayHourProvider, date, hour, provider, m.total)
    bumpSeries(perDayHourHarness, date, hour, harness, m.total)

    const minute = getMinuteLocal(m.ts)
    bumpSeries(perDayMinuteModel, date, minute, m.model, m.total)
    bumpSeries(perDayMinuteProvider, date, minute, provider, m.total)
    bumpSeries(perDayMinuteHarness, date, minute, harness, m.total)
  }

  const rankedModels = rankBy(modelTotals)
  const rankedProviders = rankBy(providerTotals)
  const rankedHarnesses = rankBy(harnessTotals)

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
    daily,
    perDayModel, perDayProvider, perDayHarness,
    rankedModels, rankedProviders, rankedHarnesses,
    perDayCombo,
    perDayHour,
    perDayHourModel, perDayMinuteModel,
    perDayHourProvider, perDayMinuteProvider,
    perDayHourHarness, perDayMinuteHarness
  }
}

function dateToWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const wd = dt.getUTCDay()
  return wd === 0 ? 6 : wd - 1
}

function buildSeriesLookup(
  stats: DimStats | undefined,
  raw: DimTimeSeries | undefined,
  buckets: number
): Record<string, number[]> {
  const result: Record<string, number[]> = {}
  if (!stats) return result
  for (const key of Object.keys(stats)) {
    result[key] = Array.from({ length: buckets }, (_, i) => raw?.[i]?.[key] || 0)
  }
  return result
}

export function getDayDetail(snap: DataSnapshot, date: string): DayDetail | null {
  const models = snap.perDayModel[date]
  if (!models) return null
  const providers = snap.perDayProvider[date] || {}
  const harnesses = snap.perDayHarness[date] || {}

  let total = 0, input = 0, output = 0, cacheRead = 0, cacheWrite = 0, reasoning = 0, calls = 0
  for (const k of Object.keys(models)) {
    const c = models[k]
    total += c.total; input += c.input; output += c.output
    cacheRead += c.cacheRead; cacheWrite += c.cacheWrite
    reasoning += c.reasoning; calls += c.calls
  }
  const cacheHitRate = (input + cacheRead) > 0
    ? cacheRead / (input + cacheRead) * 100 : 0

  const hourMap = snap.perDayHour[date] || {}
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

  const dateIdx = snap.daily.findIndex(d => d.date === date)
  const ctxStart = Math.max(0, dateIdx - 3)
  const ctxEnd = Math.min(snap.daily.length, dateIdx + 4)
  const perDayContext = snap.daily.slice(ctxStart, ctxEnd)

  return {
    date, total, input, output, cacheRead, cacheWrite, reasoning,
    cacheHitRate, calls,
    perModel: models,
    perProvider: providers,
    perHarness: harnesses,
    minutes, perDayContext,
    perModelHourly: buildSeriesLookup(models, snap.perDayHourModel[date], 24),
    perModelMinutely: buildSeriesLookup(models, snap.perDayMinuteModel[date], 1440),
    perProviderHourly: buildSeriesLookup(providers, snap.perDayHourProvider[date], 24),
    perProviderMinutely: buildSeriesLookup(providers, snap.perDayMinuteProvider[date], 1440),
    perHarnessHourly: buildSeriesLookup(harnesses, snap.perDayHourHarness[date], 24),
    perHarnessMinutely: buildSeriesLookup(harnesses, snap.perDayMinuteHarness[date], 1440)
  }
}
