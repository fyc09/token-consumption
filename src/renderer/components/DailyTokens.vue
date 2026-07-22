<template>
  <v-chart
    class="chart"
    theme="dark"
    group="main-charts"
    :option="option"
    :init-options="{ renderer: 'canvas' }"
    @click="onClick"
    autoresize
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { buildStackedBarOption } from '../charts/stackedBar'
import { DataSnapshot } from '../../shared/types'

const props = defineProps<{ snapshot: DataSnapshot | null }>()
const emit = defineEmits<{ (e: 'select', date: string): void }>()

const option = computed(() => props.snapshot ? buildStackedBarOption(props.snapshot) : { series: [] })

function onClick(params: any) {
  const idx = params.dataIndex
  if (idx != null && props.snapshot?.daily[idx]) {
    emit('select', props.snapshot.daily[idx].date)
  }
}
</script>

<style scoped>
.chart { width: 100%; height: 360px; }
</style>
