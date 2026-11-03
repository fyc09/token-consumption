// Shared types between main and renderer processes

export interface ModelStats {
  calls: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  total: number
}

export interface ModelSlice {
  name: string
  value: number
  pct: number
}

/** 聚合维度：模型 / 供应商(provider) / Harness(来源 CLI) */
export type DimKey = 'model' | 'provider' | 'harness'

/** 某维度下：名称 → 统计 */
export type DimStats = Record<string, ModelStats>

/** 时间片下某维度：hour/minute → 名称 → total */
export type DimTimeSeries = Record<number, Record<string, number>>

export interface DailyRecord {
  date: string                       // 'YYYY-MM-DD'
  weekday: number                    // 0 = Mon, 6 = Sun
  total: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  cacheHitRate: number               // cacheRead / (input + cacheRead) * 100
  calls: number
  topModels: ModelSlice[]            // top 3
  allModels: ModelSlice[]            // all, desc
}

export interface DataSnapshot {
  generatedAt: string
  range: { from: string; to: string }
  grandTotal: number
  todayTotal: number
  todayDate: string
  daily: DailyRecord[]               // asc by date

  // 三个维度各自的「日期 → 名称 → 统计」索引（供图表直接查）
  perDayModel: Record<string, DimStats>
  perDayProvider: Record<string, DimStats>
  perDayHarness: Record<string, DimStats>
  rankedModels: string[]             // desc by total usage
  rankedProviders: string[]
  rankedHarnesses: string[]

  // CSV 原子行：date → harness → model → provider → stats（无损、无冗余）
  perDayCombo: Record<string, Record<string, Record<string, Record<string, ModelStats>>>>

  // 时间片（小时 / 分钟）索引
  perDayHour: Record<string, Record<number, ModelStats>>
  perDayHourModel: Record<string, DimTimeSeries>
  perDayMinuteModel: Record<string, DimTimeSeries>
  perDayHourProvider: Record<string, DimTimeSeries>
  perDayMinuteProvider: Record<string, DimTimeSeries>
  perDayHourHarness: Record<string, DimTimeSeries>
  perDayMinuteHarness: Record<string, DimTimeSeries>
}

export interface MinuteRecord {
  hour: number                       // 0-23
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  total: number
  calls: number
}

export interface DayDetail {
  date: string
  total: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  cacheHitRate: number
  calls: number

  perModel: DimStats
  perProvider: DimStats
  perHarness: DimStats

  minutes: MinuteRecord[]              // 24 entries (hourly)
  perDayContext: DailyRecord[]         // ±3 days, asc

  perModelHourly: Record<string, number[]>     // model → [24 hours of total tokens]
  perModelMinutely: Record<string, number[]>   // model → [1440 minutes of total tokens]
  perProviderHourly: Record<string, number[]>
  perProviderMinutely: Record<string, number[]>
  perHarnessHourly: Record<string, number[]>
  perHarnessMinutely: Record<string, number[]>
}
