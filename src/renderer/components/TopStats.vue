<template>
  <div style="display: flex; gap: 12px; width: 100%;">
    <el-card v-for="s in stats" :key="s.title" style="flex: 1; min-width: 0;">
      <el-statistic :title="s.title" :value="s.value" :precision="s.precision ?? 0" :suffix="s.suffix ?? ''" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  grandTotal: number
  totalCalls: number
  todayTotal: number
  todayHitRate: number
  todayCalls: number
}>()

const stats = computed(() => [
  { title: '累计 Token',    value: props.grandTotal },
  { title: '累计调用次数',  value: props.totalCalls },
  { title: '今日 Token',    value: props.todayTotal },
  { title: '今日缓存命中率', value: props.todayHitRate, precision: 2, suffix: '%' },
  { title: '今日调用次数',  value: props.todayCalls },
])
</script>
