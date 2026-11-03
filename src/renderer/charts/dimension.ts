// 图表层共用的维度定义
import { DataSnapshot, DimKey } from '../../shared/types'

/** 维度 → UI 显示名 */
export const DIM_LABEL: Record<DimKey, string> = {
  model: '模型',
  provider: '供应商',
  harness: 'Harness'
}

/** 维度 → 该维度的排名列表 */
export function rankedOf(snap: DataSnapshot, dim: DimKey): string[] {
  if (dim === 'provider') return snap.rankedProviders
  if (dim === 'harness') return snap.rankedHarnesses
  return snap.rankedModels
}

/** 维度 → 「日期 → 名称 → 统计」索引 */
export function perDayOf(
  snap: DataSnapshot,
  dim: DimKey
): Record<string, Record<string, import('../../shared/types').ModelStats>> {
  if (dim === 'provider') return snap.perDayProvider
  if (dim === 'harness') return snap.perDayHarness
  return snap.perDayModel
}
