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
  perDayModel: Record<string, Record<string, ModelStats>>
  rankedModels: string[]             // desc by total usage
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
  perModel: Record<string, ModelStats>
  minutes: MinuteRecord[]              // 24 entries (hourly)
  perDayContext: DailyRecord[]         // ±3 days, asc
  perModelHourly: Record<string, number[]>  // model → [24 hours of total tokens]
  perModelMinutely: Record<string, number[]> // model → [1440 minutes of total tokens]
}
