// Generate CSV from DataSnapshot — minimal non-redundant format.
// 原子行：(date, harness, model, provider) → 统计。
// 从这张表可完整重建所有 UI 视图（模型/供应商/Harness 三个维度、每日汇总、热力图、详情）。
import { DataSnapshot } from '../shared/types.js'

function escape(v: string): string {
  return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
}

export function generateCSV(snap: DataSnapshot): string {
  const lines: string[] = []

  // Summary
  lines.push('# Summary')
  lines.push(`# generatedAt,${snap.generatedAt}`)
  lines.push(`# rangeFrom,${snap.range.from}`)
  lines.push(`# rangeTo,${snap.range.to}`)
  lines.push(`# grandTotal,${snap.grandTotal}`)
  lines.push(`# todayDate,${snap.todayDate}`)
  lines.push(`# todayTotal,${snap.todayTotal}`)
  lines.push('')

  lines.push('date,harness,model,provider,calls,input,output,cache_read,cache_write,reasoning,total')

  for (const date of Object.keys(snap.perDayCombo).sort()) {
    const byHarness = snap.perDayCombo[date]
    for (const harness of Object.keys(byHarness).sort()) {
      const byModel = byHarness[harness]
      for (const model of Object.keys(byModel).sort()) {
        const byProvider = byModel[model]
        for (const provider of Object.keys(byProvider).sort()) {
          const s = byProvider[provider]
          lines.push([
            date,
            escape(harness),
            escape(model),
            escape(provider),
            s.calls,
            s.input,
            s.output,
            s.cacheRead,
            s.cacheWrite,
            s.reasoning,
            s.total
          ].join(','))
        }
      }
    }
  }

  return lines.join('\n')
}
