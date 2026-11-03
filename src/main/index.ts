import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { loadPiMessages } from '../data/pi.js'
import { loadOpencodeMessages } from '../data/opencode.js'
import { loadCodexMessages } from '../data/codex.js'
import { aggregate, getDayDetail } from '../data/aggregate.js'
import { generateCSV } from '../data/exportCSV.js'
import { DataSnapshot, DayDetail } from '../shared/types.js'

let mainWindow: BrowserWindow | null = null
let cachedSnapshot: DataSnapshot | null = null

async function buildSnapshot(): Promise<DataSnapshot> {
  const [pi, oc, codex] = await Promise.all([
    Promise.resolve().then(() => loadPiMessages()),
    Promise.resolve().then(() => loadOpencodeMessages()),
    loadCodexMessages()
  ])
  return aggregate([...pi, ...oc, ...codex])
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f0f12',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // 移除原生菜单栏
  Menu.setApplicationMenu(null)
  
  // Pre-load data so the renderer doesn't show empty state on first paint
  try {
    cachedSnapshot = await buildSnapshot()
  } catch (e) {
    console.error('[data] load failed:', e)
  }

  ipcMain.handle('data:get', async (): Promise<DataSnapshot> => {
    if (!cachedSnapshot) cachedSnapshot = await buildSnapshot()
    return cachedSnapshot
  })

  ipcMain.handle('data:refresh', async (): Promise<DataSnapshot> => {
    cachedSnapshot = await buildSnapshot()
    return cachedSnapshot
  })

  ipcMain.handle('day:detail', async (_e, date: string): Promise<DayDetail | null> => {
    if (!cachedSnapshot) cachedSnapshot = await buildSnapshot()
    return getDayDetail(cachedSnapshot, date)
  })

  ipcMain.handle('data:export-csv', async (): Promise<string | null> => {
    if (!cachedSnapshot) return null
    const csv = generateCSV(cachedSnapshot)
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `token-consumption-${cachedSnapshot.todayDate}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, csv, 'utf-8')
    return filePath
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
