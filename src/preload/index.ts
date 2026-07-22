import { contextBridge, ipcRenderer } from 'electron'
import { DataSnapshot, DayDetail } from '../shared/types.js'

const api = {
  getData: (): Promise<DataSnapshot> => ipcRenderer.invoke('data:get'),
  refresh: (): Promise<DataSnapshot> => ipcRenderer.invoke('data:refresh'),
  getDayDetail: (date: string): Promise<DayDetail | null> =>
    ipcRenderer.invoke('day:detail', date)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
