<template>
  <el-dialog
    v-model="visible"
    title="详情"
    width="80%"
    top="5vh"
    @close="onClose"
  >
    <div v-if="detail">
      <!-- 顶部：日期 + 前一天/后一天 按钮 -->
      <el-row :gutter="8" align="middle" style="margin-bottom: 12px">
        <el-col :span="4">
          <el-button :disabled="!prevDate" @click="navigate(prevDate!)">
            <el-icon><ArrowLeft /></el-icon>前一天
          </el-button>
        </el-col>
        <el-col :span="16" style="text-align: center">
          <h3 style="margin: 0">{{ detail.date }}</h3>
        </el-col>
        <el-col :span="4" style="text-align: right">
          <el-button :disabled="!nextDate" @click="navigate(nextDate!)">
            后一天<el-icon><ArrowRight /></el-icon>
          </el-button>
        </el-col>
      </el-row>

      <!-- 4 张统计卡（与主页 TopStats 同款 el-statistic） -->
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
          <v-chart class="pie" theme="dark" :option="modelPieOption" autoresize />
        </el-col>
      </el-row>

      <el-divider />

      <!-- 分钟(5min)/小时 Segmented + 堆叠柱（按模型） -->
      <el-segmented
        v-model="granularity"
        :options="['分钟', '小时']"
        style="margin-bottom: 12px"
      />
      <v-chart
        class="detail-bar"
        theme="dark"
        :option="barOption"
        :key="granularity + detail.date"
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

// 粒度切换：'分钟' (x轴=288 个 5min 间隔) | '小时' (x轴=24 小时)
const granularity = ref<'分钟' | '小时'>('分钟')

const modelCount = computed(() => props.detail
  ? Object.keys(props.detail.perModel).length : 0)

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

const modelPieOption = computed(() => {
  if (!props.detail || !props.snapshot) return { series: [] }
  const slices: ModelSlice[] = Object.keys(props.detail.perModel)
    .map(name => ({ name, value: props.detail!.perModel[name].total, pct: 0 }))
    .sort((a, b) => b.value - a.value)
  const total = slices.reduce((s, x) => s + x.value, 0)
  slices.forEach(s => { s.pct = total > 0 ? s.value / total * 100 : 0 })
  return buildModelPie(slices, props.snapshot.rankedModels)
})

const barOption = computed(() => {
  if (!props.detail || !props.snapshot) return { series: [] }
  return granularity.value === '分钟'
    ? buildMinuteBar(props.detail, props.snapshot.rankedModels)
    : buildHourlyBar(props.detail, props.snapshot.rankedModels)
})

watch(() => props.modelValue, (v) => {
  if (v) granularity.value = '分钟'
})

function onClose() { emit('close') }
</script>

<style scoped>
.pie { width: 100%; height: 280px; }
.detail-bar { width: 100%; height: 320px; }
</style>