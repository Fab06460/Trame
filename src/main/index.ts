import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'

const FILTER = { name: 'Projet Trame', extensions: ['trame'] }

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Trame',
    backgroundColor: '#1e1f24',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('project:save', async (_e, json: string, currentPath?: string) => {
  let path = currentPath
  if (!path) {
    const res = await dialog.showSaveDialog({ defaultPath: 'Sans titre.trame', filters: [FILTER] })
    if (res.canceled || !res.filePath) return null
    path = res.filePath
  }
  await writeFile(path, json, 'utf-8')
  return path
})

ipcMain.handle('project:open', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: [FILTER] })
  if (res.canceled || !res.filePaths[0]) return null
  const path = res.filePaths[0]
  return { path, json: await readFile(path, 'utf-8') }
})

ipcMain.handle('image:pick', async () => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
  })
  if (res.canceled || !res.filePaths[0]) return null
  const path = res.filePaths[0]
  const ext = path.split('.').pop()!.toLowerCase()
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
  const buf = await readFile(path)
  return `data:${mime};base64,${buf.toString('base64')}`
})

ipcMain.handle('export:save', async (_e, dataUrl: string, name: string) => {
  const ext = name.split('.').pop()!
  const res = await dialog.showSaveDialog({
    defaultPath: name,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  })
  if (res.canceled || !res.filePath) return null
  await writeFile(res.filePath, Buffer.from(dataUrl.split(',')[1], 'base64'))
  return res.filePath
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
