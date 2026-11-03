// Read pi session jsonl files from ~/.pi/agent/sessions/**/*.jsonl
import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface RawMessage {
  ts: number          // ms epoch
  model: string
  provider: string
  harness: string     // 来源 CLI：pi / opencode / codex
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

  // pi 在续接 / 分叉会话时，会把历史消息连同当时的 usage 整份重写进新的
  // session 文件（同一 rec.id 会出现在多个 .jsonl 里，最多 5 次）。
  // 若按文件全量累加，会把同一笔消耗重复计算 2～5 倍。
  // 实测：52,724 条 record 只有 45,016 个唯一 id；同一 id 的 timestamp 与
  // usage 跨文件完全一致（0 例不一致），因此按 rec.id 全局去重是安全的。
  const seen = new Set<string>()

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

      // 按消息 id 去重（id 在记录的顶层，不在 message 内）
      const id: string | undefined = rec.id
      if (id) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      const u = msg.usage
      const inp = +u.input || 0
      const rawOut = +u.output || 0
      const cr = +u.cacheRead || 0
      const cw = +u.cacheWrite || 0
      // pi 的 reasoning 是 output 的子集（已验证 22979 条全部 reasoning <= output）。
      // 为了让 pi 与 opencode 语义一致（两者的 output 与 reasoning 不相交），
      // 这里将 output 拆成「非推理输出 + 推理」，避免重复计数。
      const rea = Math.min(+u.reasoning || 0, rawOut)
      const outp = rawOut - rea
      msgs.push({
        ts: dt.getTime(),
        model: msg.model || 'unknown',
        provider: msg.provider || 'unknown',
        harness: 'pi',
        input: inp, output: outp, cacheRead: cr, cacheWrite: cw, reasoning: rea,
        total: inp + outp + rea + cr + cw,  // = inp + rawOut + cr + cw，与 pi 的 totalTokens 一致
        calls: 1
      })
    }
  }
  return msgs
}
