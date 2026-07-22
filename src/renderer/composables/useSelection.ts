import { ref } from 'vue'
import { DayDetail } from '../../shared/types'

const selectedDay = ref<string | null>(null)
const dayDetail = ref<DayDetail | null>(null)
const detailLoading = ref(false)

async function openDay(date: string) {
  selectedDay.value = date
  detailLoading.value = true
  try {
    if (window.api) {
      dayDetail.value = await window.api.getDayDetail(date)
    }
  } finally {
    detailLoading.value = false
  }
}

function closeDay() {
  selectedDay.value = null
  dayDetail.value = null
}

export function useSelection() {
  return { selectedDay, dayDetail, detailLoading, openDay, closeDay }
}
