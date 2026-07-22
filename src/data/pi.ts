// Read pi session jsonl files from ~/.pi/agent/sessions/**/*.jsonl
import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface RawMessage {
  ts: number          // ms epoch
  model: string
  provider: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  total: number
  calls: number
}

async function walkJsonl(dir: string, out: string[]): Promise<string[]> {
  let entries: any[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      await walkJsonl(p, out)
    } else if (e.isFile() && e.name.endsWith('.jsonl')) {
      out.push(p)
    }
  }
  return out
}

export async function loadPiMessages(): Promise<RawMessage[]> {
  const base = join(homedir(), '.pi', 'agent', 'sessions')
  const msgs: RawMessage[] = []
  const files = await walkJsonl(base, [])

  for (const f of files) {
    let content: string
    try {
      content = await fs.readFile(f, 'utf-8')
    } catch {
      continue
    }
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      let rec: any
      try { rec = JSON.parse(line) } catch { continue }
      if (rec.type !== 'message') continue
      const msg = rec.message
      if (!msg?.usage) continue
      const ts = rec.timestamp || msg.timestamp
      if (!ts) continue
      const dt = new Date(ts)
      if (isNaN(dt.getTime())) continue
      const u = msg.usage
      const inp = +u.input || 0
      const outp = +u.output || 0
      const cr = +u.cacheRead || 0
      const cw = +u.cacheWrite || 0
      const rea = +u.reasoning || 0
      msgs.push({
        ts: dt.getTime(),
        model: msg.model || 'unknown',
        provider: msg.provider || 'unknown',
        input: inp, output: outp, cacheRead: cr, cacheWrite: cw, reasoning: rea,
        total: inp + outp + cr + cw + rea,
        calls: 1
      })
    }
  }
  return msgs
}
