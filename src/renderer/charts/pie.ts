// ECharts pie chart options
import { ModelSlice } from '../../shared/types'
import { modelColor } from '../composables/modelColor'

export function buildTokenClassPie(detail: {
  input: number; output: number; cacheRead: number;
  cacheWrite: number; reasoning: number
}) {
  const data = [
    { name: '输入',         value: detail.input },
    { name: '输出',         value: detail.output },
    { name: '输入命中缓存', value: detail.cacheRead },
    { name: '缓存写入',     value: detail.cacheWrite },
    { name: '推理',         value: detail.reasoning }
  ].filter(d => d.value > 0)

  return {
    backgroundColor: 'transparent',
    title: { text: 'Token 分类', left: 'center', top: 0, textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item', appendToBody: true, formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      center: ['50%', '55%'],
      data,
      label: { formatter: '{b}\n{d}%' }
    }]
  }
}

export function buildModelPie(slices: ModelSlice[], ranked: string[]) {
  const data = slices
    .filter(s => s.value > 0)
    .map(s => ({
      name: s.name,
      value: s.value,
      itemStyle: { color: modelColor(s.name, ranked) }
    }))

  return {
    backgroundColor: 'transparent',
    title: { text: '模型分类', left: 'center', top: 0, textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item', appendToBody: true, formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      center: ['50%', '55%'],
      data,
      label: { formatter: '{b}\n{d}%' }
    }]
  }
}
