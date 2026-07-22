import { ref, onMounted, onUnmounted } from 'vue'
import { DataSnapshot } from '../../shared/types'

const snapshot = ref<DataSnapshot | null>(null)
const loading = ref(false)
let timer: number | null = null

async function loadData() {
  if (typeof window === 'undefined' || !window.api) return
  loading.value = true
  try {
    snapshot.value = await window.api.getData()
  } finally {
    loading.value = false
  }
}

async function refresh() {
  if (typeof window === 'undefined' || !window.api) return
  loading.value = true
  try {
    snapshot.value = await window.api.refresh()
  } finally {
    loading.value = false
  }
}

export function useData() {
  onMounted(() => {
    loadData()
    timer = window.setInterval(refresh, 60_000)
  })
  onUnmounted(() => {
    if (timer) { clearInterval(timer); timer = null }
  })
  return { snapshot, loading, refresh }
}
