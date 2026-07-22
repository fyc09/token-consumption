// Read opencode SQLite database at ~/.local/share/opencode/opencode.db
import { join } from 'path'
import { homedir } from 'os'
import Database from 'better-sqlite3'
import { RawMessage } from './pi.js'

export function loadOpencodeMessages(): RawMessage[] {
  const dbPath = join(homedir(), '.local', 'share', 'opencode', 'opencode.db')
  const msgs: RawMessage[] = []
  let db: Database.Database
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: false })
  } catch {
    return msgs
  }
  try {
    const stmt = db.prepare(`
      SELECT data, time_created FROM message
      WHERE json_extract(data, '$.role') = 'assistant'
        AND json_extract(data, '$.tokens') IS NOT NULL
    `)
    for (const row of stmt.all() as any[]) {
      let d: any
      try { d = JSON.parse(row.data) } catch { continue }
      const tk = d.tokens
      if (!tk) continue
      const ts = +row.time_created
      if (!ts) continue
      const inp = +tk.input || 0
      const outp = +tk.output || 0
      const rea = +tk.reasoning || 0
      const cache = tk.cache || {}
      const cr = +cache.read || 0
      const cw = +cache.write || 0
      msgs.push({
        ts,
        model: d.modelID || 'unknown',
        provider: d.providerID || 'unknown',
        input: inp, output: outp, cacheRead: cr, cacheWrite: cw, reasoning: rea,
        total: inp + outp + cr + cw + rea,
        calls: 1
      })
    }
  } finally {
    db.close()
  }
  return msgs
}
