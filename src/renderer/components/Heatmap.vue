<template>
  <v-chart
    ref="chartInstance"
    class="chart"
    theme="dark"
    :option="option"
    :init-options="{ renderer: 'canvas' }"
    :style="{ height: heightPx + 'px' }"
    @click="onClick"
    autoresize
  />
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import VChart from 'vue-echarts'
import { buildHeatmapOption } from '../charts/heatmap'
import { DataSnapshot } from '../../shared/types'

const props = defineProps<{ snapshot: DataSnapshot | null }>()
const emit = defineEmits<{ (e: 'select', date: string): void }>()

const chartInstance = ref()
const heightPx = ref(140)

function updateHeight() {
  if (!chartInstance.value?.root) return
  const w = chartInstance.value.root.clientWidth || 900
  // 使 grid 区域严格 52:7：grid_w = w - L - R，grid_h = w_grid * 7 / 52
  // 图表高度 = grid_h + T + B
  const gridW = w - 40 - 10  // left=40, right=10
  heightPx.value = Math.max(gridW * 7 / 52 + 30 + 20, 120)
}

onMounted(() => {
  updateHeight()
  window.addEventListener('resize', updateHeight)
})
onUnmounted(() => window.removeEventListener('resize', updateHeight))

const option = computed(() => props.snapshot ? buildHeatmapOption(props.snapshot) : { series: [] })

function onClick(params: any) {
  const cd = params.data?.customdata
  if (cd?.date && cd.total > 0) emit('select', cd.date)
}
</script>

<style scoped>
.chart {
  width: 100%;
}
</style>
