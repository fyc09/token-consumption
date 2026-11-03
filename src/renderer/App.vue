<template>
  <el-container class="layout">
    <el-header class="header">
      <span class="title">Token 消耗统计</span>
      <el-button text @click="refresh" :loading="loading">
        <el-icon><Refresh /></el-icon>
        <span style="margin-left: 4px">刷新</span>
      </el-button>
      <el-button text @click="doExport">
        <span style="margin-left: 4px">导出 CSV</span>
      </el-button>
      <span class="date">{{ snapshot?.todayDate || '' }}</span>
    </el-header>

    <el-main v-if="snapshot" class="main">
      <TopStats
        :grand-total="snapshot.grandTotal"
        :total-calls="totalCalls"
        :today-total="snapshot.todayTotal"
        :today-hit-rate="todayHitRate"
        :today-calls="todayCalls"
      />

      <el-card class="section">
        <template #header>热力图</template>
        <Heatmap :snapshot="snapshot" @select="openDay" />
      </el-card>

      <el-card class="section">
        <template #header>
          <div style="display:flex;align-items:center;gap:12px">
            <span>每日 Token 总消耗</span>
            <el-segmented v-model="viewDim" :options="DIM_OPTIONS" style="flex-shrink:0" />
          </div>
        </template>
        <DailyTokens :snapshot="snapshot" :mode="viewDim" @select="openDay" />
      </el-card>

      <el-card class="section">
        <template #header>
          <div style="display:flex;align-items:center;gap:12px">
            <span>分布视图</span>
            <el-segmented v-model="viewDim" :options="DIM_OPTIONS" style="flex-shrink:0" />
          </div>
        </template>
        <DailyModels :snapshot="snapshot" :mode="viewDim" @select="openDay" />
      </el-card>
    </el-main>

    <el-main v-else-if="loading">
      <el-skeleton :rows="10" animated />
    </el-main>

    <el-main v-else>
      <el-empty description="无数据" />
    </el-main>

    <DetailDialog
      v-model="dialogVisible"
      :detail="dayDetail"
      :loading="detailLoading"
      :snapshot="snapshot"
      @close="closeDay"
      @navigate="openDay"
    />
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import * as echarts from 'echarts'
import { Refresh } from '@element-plus/icons-vue'
import { ElNotification } from 'element-plus'
import TopStats from './components/TopStats.vue'
import Heatmap from './components/Heatmap.vue'
import DailyTokens from './components/DailyTokens.vue'
import DailyModels from './components/DailyModels.vue'
import DetailDialog from './components/DetailDialog.vue'
import { useData } from './composables/useData'
import { useSelection } from './composables/useSelection'
import type { DimKey } from '../shared/types'

const { snapshot, loading, refresh } = useData()
const { selectedDay, dayDetail, detailLoading, openDay, closeDay } = useSelection()

const totalCalls = computed(() => snapshot.value?.daily.reduce((s, d) => s + d.calls, 0) ?? 0)
const todayCalls = computed(() => snapshot.value?.daily.find(d => d.date === snapshot.value?.todayDate)?.calls ?? 0)
const todayHitRate = computed(() => snapshot.value?.daily.find(d => d.date === snapshot.value?.todayDate)?.cacheHitRate ?? 0)

const viewDim = ref<DimKey>('model')
const DIM_OPTIONS: { label: string; value: DimKey }[] = [
  { label: '模型', value: 'model' },
  { label: '供应商', value: 'provider' },
  { label: 'Harness', value: 'harness' }
]

async function doExport() {
  if (!window.api) return
  const path = await window.api.exportCSV()
  if (path) {
    ElNotification({ title: '导出成功', message: path, type: 'success', duration: 4000 })
  }
}

const dialogVisible = computed({
  get: () => selectedDay.value !== null,
  set: (v) => { if (!v) closeDay() }
})

watch(snapshot, () => {
  if (selectedDay.value && window.api) {
    window.api.getDayDetail(selectedDay.value).then(d => { dayDetail.value = d })
  }
})

// 联动两个柱状图的缩放
echarts.connect('main-charts')
</script>

<style scoped>
.layout { min-height: 100vh; }
.header {
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid var(--el-border-color);
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px;
  box-sizing: border-box;
}
.title { font-size: 18px; font-weight: 600; }
.date { margin-left: auto; color: var(--el-text-color-secondary); font-size: 13px; }
.main { display: flex; flex-direction: column; gap: 16px; padding: 16px; overflow-y: auto; overflow-x: hidden; width: 100%; max-width: 1200px; margin: 0 auto; box-sizing: border-box; }
.section { width: 100%; }
</style>

<style>
/* 全局隐藏滚动条 */
::-webkit-scrollbar { display: none; }
html, body { overflow-x: hidden; overflow-y: auto; }
/* 弹窗最大宽度 */
.el-dialog { max-width: 1200px !important; }
</style>
