// Read Codex CLI token usage from ~/.codex
//
// 数据源：rollout 文件
//   ~/.codex/sessions/**/rollout-*.jsonl[.zst]
//   ~/.codex/archived_sessions/rollout-*.jsonl[.zst]
//
// Codex 口径（实测 11,251 条 token_usage_record 全部满足）：
//   total_tokens = input_tokens + output_tokens
//   cached_input_tokens     ⊆ input_tokens      （缓存命中，不额外累加）
//   reasoning_output_tokens ⊆ output_tokens     （推理已含在 output，不额外累加）
//   cache_write_input_tokens 恒为 0
//
// 取数方法：cumulative-diff
//   `token_count.info.total_token_usage.total_tokens` 是"该线程"的累计值，
//   会跨同一线程的多个 rollout 文件持续增长；而 `last_token_usage` 在文件边界会漏增量。
//   因此按线程收集全部 (timestamp, cumulative)，按累计值去重排序后做相邻差值，
//   差值即为该时刻的真实增量。实测 155/155 线程总和与 ~/.codex/state_*.sqlite 的
//   threads.tokens_used 完全相等（3,228,827,756），逐日可还原。
//
// 模型归属：token_count 事件本身不带模型，用同线程 `turn_context` 事件构建
//   (timestamp → model) 时间线，取该增量时刻之前最近的模型。
import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { decompress } from 'fzstd'
import { RawMessage } from './pi.js'

const CODEX_DIR = join(homedir(), '.codex')
const ROLLOUT_DIRS = [join(CODEX_DIR, 'sessions'), join(CODEX_DIR, 'archived_sessions')]

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/

function isRollout(name: string): boolean {
  return name.startsWith('rollout-') && (name.endsWith('.jsonl') || name.endsWith('.jsonl.zst'))
}

async function walkRollouts(dir: string, out: string[]): Promise<string[]> {
  let entries: any[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walkRollouts(p, out)
    else if (e.isFile() && isRollout(e.name)) out.push(p)
  }
  return out
}

// 文件名形如 rollout-<ts>-<threadId>[_<continuation>].jsonl[.zst]
function threadIdOf(file: string): string {
  const base = file.split(/[\\/]/).pop() || ''
  const m = base.match(UUID_RE)
  return m ? m[1] : 'unknown'
}

async function readRolloutFile(path: string): Promise<string | null> {
  let buf: Buffer
  try {
    buf = await fs.readFile(path)
  } catch {
    return null
  }
  if (!path.endsWith('.zst')) return buf.toString('utf8')
  try {
    return Buffer.from(decompress(new Uint8Array(buf))).toString('utf8')
  } catch {
    return null
  }
}

interface CumPoint {
  ts: number
  cum: number
  inp: number
  cached: number
  cacheWrite: number
  out: number
  reasoning: number
  lastTotal: number
}
interface ModelPoint { ts: number; model: string }

interface ThreadData {
  provider: string
  cums: CumPoint[]
  models: ModelPoint[]
}

export async function loadCodexMessages(): Promise<RawMessage[]> {
  const files: string[] = []
  for (const d of ROLLOUT_DIRS) await walkRollouts(d, files)
  if (files.length === 0) return []

  const threads = new Map<string, ThreadData>()

  for (const f of files) {
    const content = await readRolloutFile(f)
    if (!content) continue

    const tid = threadIdOf(f)
    let t = threads.get(tid)
    if (!t) {
      t = { provider: '', cums: [], models: [] }
      threads.set(tid, t)
    }

    for (const line of content.split('\n')) {
      if (!line) continue
      if (
        !line.includes('token_count') &&
        !line.includes('turn_context') &&
        !line.includes('session_meta') &&
        !line.includes('thread_settings_applied')
      ) continue

      let o: any
      try {
        o = JSON.parse(line)
      } catch {
        continue
      }

      if (o.type === 'session_meta') {
        const p = o.payload || {}
        if (!t.provider && p.model_provider) t.provider = p.model_provider
        continue
      }

      if (o.type === 'event_msg' && o.payload?.type === 'thread_settings_applied') {
        const s = o.payload.thread_settings || {}
        if (!t.provider && s.model_provider_id) t.provider = s.model_provider_id
        continue
      }

      if (o.type === 'turn_context') {
        const p = o.payload || {}
        const ts = Date.parse(o.timestamp)
        if (p.model && Number.isFinite(ts)) t.models.push({ ts, model: p.model })
        continue
      }

      if (o.type === 'event_msg' && o.payload?.type === 'token_count') {
        const ts = Date.parse(o.timestamp)
        const info = o.payload.info
        const cum = info?.total_token_usage?.total_tokens
        const last = info?.last_token_usage
        if (!Number.isFinite(ts) || typeof cum !== 'number' || cum <= 0) continue
        t.cums.push({
          ts,
          cum,
          inp: Number(last?.input_tokens) || 0,
          cached: Number(last?.cached_input_tokens) || 0,
          cacheWrite: Number(last?.cache_write_input_tokens) || 0,
          out: Number(last?.output_tokens) || 0,
          reasoning: Number(last?.reasoning_output_tokens) || 0,
          lastTotal: Number(last?.total_tokens) || 0
        })
        continue
      }
    }
  }

  const msgs: RawMessage[] = []

  for (const [, t] of threads) {
    if (t.cums.length === 0) continue
    t.models.sort((a, b) => a.ts - b.ts)
    const provider = t.provider || 'openai'

    // 按累计值去重 + 升序，做相邻差值
    const seen = new Set<number>()
    const uniq: CumPoint[] = []
    for (const c of t.cums) {
      if (seen.has(c.cum)) continue
      seen.add(c.cum)
      uniq.push(c)
    }
    uniq.sort((a, b) => a.cum - b.cum)

    let prev = 0
    let isFirst = true

    // 注意：增量必须按【累计值】顺序计算。
    // 但有一个重要例外：新建线程的首条 token_count 事件，其
    // total_token_usage 可能被【预置/继承】了很大的初值
    // （实测 5/155 线程如此，最大一例 cum=179,845,436 而 last=280,362）。
    // 若直接把 cum 当作增量，会把继承值误归到当前时刻（导致某天爆高）。
    // 因此首条事件只计入它真实的 last_token_usage。
    for (const point of uniq) {
      let inc = point.cum - prev
      prev = point.cum
      if (isFirst) {
        isFirst = false
        if (point.lastTotal > 0 && point.cum > point.lastTotal * 10) {
          inc = point.lastTotal
        }
      }
      if (inc <= 0) continue

      // 模型归属：取该时刻之前最近的 turn_context
      const model = modelAt(t.models, point.ts)

      msgs.push({
        ts: point.ts,
        model,
        provider,
        harness: 'codex',
        ...splitIncrement(inc, point)
      })
    }
  }

  return msgs
}

// 二分查找 ts <= target 的最后一个模型
function modelAt(models: ModelPoint[], target: number): string {
  if (models.length === 0) return 'unknown'
  let lo = 0
  let hi = models.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (models[mid].ts <= target) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (ans < 0) return models[0].model
  return models[ans].model
}

// 把累计差值 inc 按该点的 last_token_usage 拆分到各分项，
// 保证 input+output+reasoning+cacheRead+cacheWrite 精确等于 inc。
function splitIncrement(inc: number, p: CumPoint): Omit<RawMessage, 'ts' | 'model' | 'provider' | 'calls'> {
  // 正常情况下 lastTotal == inc（增量），比例为 1
  const f = p.lastTotal > 0 ? inc / p.lastTotal : 0

  let cached = Math.round(p.cached * f)
  let cacheWrite = Math.round(p.cacheWrite * f)
  let reasoning = Math.round(p.reasoning * f)
  const inpRaw = Math.round(p.inp * f)
  const outRaw = Math.round(p.out * f)

  // cached ⊆ input，reasoning ⊆ output
  let input = Math.max(0, inpRaw - cached)
  let output = Math.max(0, outRaw - reasoning)

  // 修正舍入误差，优先挂到较大的分项上
  const sum = input + output + reasoning + cached + cacheWrite
  const diff = inc - sum
  if (diff !== 0) {
    if (output >= input) {
      output += diff
      if (output < 0) { input += output; output = 0 }
    } else {
      input += diff
      if (input < 0) { output += input; input = 0 }
    }
    if (input < 0) input = 0
    if (output < 0) output = 0
    if (cached < 0) cached = 0
    if (reasoning < 0) reasoning = 0
    if (cacheWrite < 0) cacheWrite = 0
  }

  const total = input + output + reasoning + cached + cacheWrite
  return { input, output, cacheRead: cached, cacheWrite, reasoning, total }
}
