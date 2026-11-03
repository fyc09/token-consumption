<template>
  <el-dialog
    v-model="visible"
    title="详情"
    width="80%"
    top="5vh"
    @close="onClose"
  >
    <div v-if="detail">
      <!-- 顶部：日期 + 前一天/后一天 按钮 + 模型/Provider 切换 -->
      <div style="display:flex;align-items:center;margin-bottom:12px;gap:8px">
        <el-button :disabled="!prevDate" @click="navigate(prevDate!)">
          <el-icon><ArrowLeft /></el-icon>前一天
        </el-button>
        <el-segmented v-model="viewMode" :options="['模型', 'Provider']" style="margin:0 auto" />
        <el-button :disabled="!nextDate" @click="navigate(nextDate!)">
          后一天<el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>

      <!-- 4 张统计卡 -->
      <el-row :gutter="12">
        <el-col :span="6">
          <el-card>
            <el-statistic title="当日 Token" :value="detail.total" />
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card>
            <el-statistic title="缓存命中率" :value="detail.cacheHitRate" :precision="2" suffix="%" />
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card>
            <el-statistic title="调用次数" :value="detail.calls" />
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card>
            <el-statistic title="模型数" :value="modelCount" />
          </el-card>
        </el-col>
      </el-row>

      <!-- 双饼图 -->
      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="12">
          <v-chart class="pie" theme="dark" :option="tokenClassOption" autoresize />
        </el-col>
        <el-col :span="12">
          <v-chart class="pie" theme="dark" :option="distPieOption" autoresize :key="viewMode + detail.date" />
        </el-col>
      </el-row>

      <el-divider />

      <!-- 分钟/小时 Segmented + 堆叠柱 -->
      <el-segmented
        v-model="granularity"
        :options="['分钟', '小时']"
        style="margin-bottom: 12px"
      />
      <v-chart
        class="detail-bar"
        theme="dark"
        :option="barOption"
        :key="granularity + viewMode + detail.date"
        autoresize
      />
    </div>
    <div v-else-if="loading">加载中...</div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import VChart from 'vue-echarts'
import { DayDetail, DataSnapshot, ModelSlice } from '../../shared/types'
import { buildTokenClassPie, buildModelPie } from '../charts/pie'
import { buildMinuteBar, buildHourlyBar } from '../charts/detailBar'

const props = defineProps<{
  modelValue: boolean
  detail: DayDetail | null
  loading: boolean
  snapshot: DataSnapshot | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'close'): void
  (e: 'navigate', date: string): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const viewMode = ref<'模型' | 'Provider'>('模型')
const granularity = ref<'分钟' | '小时'>('分钟')

const isProvider = computed(() => viewMode.value === 'Provider')

const modelCount = computed(() => {
  if (!props.detail) return 0
  return isProvider.value
    ? Object.keys(props.detail.perProvider).length
    : Object.keys(props.detail.perModel).length
})

// 找前一天 / 后一天
const allDates = computed(() => props.snapshot?.daily.map(d => d.date) || [])

const prevDate = computed(() => {
  if (!props.detail) return null
  const idx = allDates.value.indexOf(props.detail.date)
  return idx > 0 ? allDates.value[idx - 1] : null
})

const nextDate = computed(() => {
  if (!props.detail) return null
  const idx = allDates.value.indexOf(props.detail.date)
  return idx >= 0 && idx < allDates.value.length - 1 ? allDates.value[idx + 1] : null
})

function navigate(date: string) {
  emit('navigate', date)
}

const tokenClassOption = computed(() => props.detail
  ? buildTokenClassPie(props.detail) : { series: [] })

const modeKey = computed(() => isProvider.value ? 'provider' as const : 'model' as const)

const distPieOption = computed(() => {
  if (!props.detail || !props.snapshot) return { series: [] }
  const data = isProvider.value ? props.detail.perProvider : props.detail.perModel
  const ranked = isProvider.value ? props.snapshot.rankedProviders : props.snapshot.rankedModels
  const slices: ModelSlice[] = Object.keys(data)
    .map(name => ({ name, value: data[name].total, pct: 0 }))
    .sort((a, b) => b.value - a.value)
  const total = slices.reduce((s, x) => s + x.value, 0)
  slices.forEach(s => { s.pct = total > 0 ? s.value / total * 100 : 0 })
  return buildModelPie(slices, ranked, modeKey.value)
})

const barOption = computed(() => {
  if (!props.detail || !props.snapshot) return { series: [] }
  const ranked = isProvider.value ? props.snapshot.rankedProviders : props.snapshot.rankedModels
  return granularity.value === '分钟'
    ? buildMinuteBar(props.detail, ranked, modeKey.value)
    : buildHourlyBar(props.detail, ranked, modeKey.value)
})

watch(() => props.modelValue, (v) => {
  if (v) {
    granularity.value = '分钟'
    viewMode.value = '模型'
  }
})

function onClose() { emit('close') }
</script>

<style scoped>
.pie { width: 100%; height: 280px; }
.detail-bar { width: 100%; height: 320px; }
</style>
