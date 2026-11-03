// Generate CSV from DataSnapshot — minimal non-redundant format.
// Core data: per-day, per-model, per-provider atomic rows.
// Everything in the UI (model view, provider view, daily stats, heatmap)
// can be reconstructed from this single table.
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

  // Header
  lines.push('date,model,provider,calls,input,output,cache_read,cache_write,reasoning,total')

  // Walk perDayModelProvider: date → model → provider → stats
  for (const date of Object.keys(snap.perDayModelProvider).sort()) {
    const byModel = snap.perDayModelProvider[date]
    for (const model of Object.keys(byModel).sort()) {
      const byProvider = byModel[model]
      for (const provider of Object.keys(byProvider).sort()) {
        const s = byProvider[provider]
        lines.push([
          date,
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

  return lines.join('\n')
}
