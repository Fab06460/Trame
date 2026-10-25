import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { basename, dirname } from 'path'
import { createCloseGuard } from './closeGuard'
import { addMeta, isValidId, parseTemplateIndex, removeMeta, sanitizeMeta, type TemplateMeta } from './userTemplates'
import { parseRecents, pushRecent, removeRecent, type RecentEntry } from './recents'

const recentsFile = (): string => join(app.getPath('userData'), 'recent-projects.json')

async function loadRecents(): Promise<RecentEntry[]> {
  try {
    return parseRecents(await readFile(recentsFile(), 'utf-8'))
  } catch {
    return [] // premier lancement ou fichier absent
  }
}

async function saveRecents(list: RecentEntry[]): Promise<void> {
  try {
    await writeFile(recentsFile(), JSON.stringify(list), 'utf-8')
  } catch {
    // la liste des récents est un confort : ne jamais faire échouer une ouverture ou un enregistrement pour elle
  }
}

async function noteRecent(path: string): Promise<void> {
  await saveRecents(pushRecent(await loadRecents(), path, Date.now()))
}

// ── Modèles de l'utilisateur ──────────────────────────────────────────────────────────────────────────────
// userData/templates/index.json : métadonnées légères (nom, miniature…), lues à chaque affichage de la liste ;
// userData/templates/<id>.json : le document complet, lu uniquement à l'application du modèle.
const MAX_TEMPLATE_BYTES = 64 * 1024 * 1024
const templatesDir = (): string => join(app.getPath('userData'), 'templates')
const templateIndexFile = (): string => join(templatesDir(), 'index.json')

async function loadTemplateIndex(): Promise<TemplateMeta[]> {
  try {
    return parseTemplateIndex(await readFile(templateIndexFile(), 'utf-8'))
  } catch {
    return [] // aucun modèle enregistré pour l'instant
  }
}

const saveTemplateIndex = (list: TemplateMeta[]): Promise<void> => writeFile(templateIndexFile(), JSON.stringify(list), 'utf-8')

const FILTER = { name: 'Projet Trame', extensions: ['trame'] }

let mainWindow: BrowserWindow | null = null
/** Intercepte la fermeture / la sortie tant que le renderer signale des modifications non enregistrées. */
const closeGuard = createCloseGuard()

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

  mainWindow = win
  // le zoom de la page est géré par l'éditeur (canvas) : on interdit le zoom visuel du navigateur (pincement)
  win.webContents.on('did-finish-load', () => win.webContents.setVisualZoomLevelLimits(1, 1))
  win.on('closed', () => {
    mainWindow = null
    closeGuard.onClosed()
  })
  // Fermeture avec des modifications : le renderer décide (enregistrer / ignorer / annuler) puis confirme.
  win.on('close', (e) => {
    if (closeGuard.onClose()) {
      e.preventDefault()
      win.webContents.send('app:before-close')
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('project:save', async (e, json: string, currentPath?: string, name?: string) => {
  try {
    let path = currentPath
    if (!path) {
      const win = BrowserWindow.fromWebContents(e.sender)!
      const res = await dialog.showSaveDialog(win, { defaultPath: `${name || 'Sans titre'}.trame`, filters: [FILTER] })
      if (res.canceled || !res.filePath) return null
      path = res.filePath
    }
    await writeFile(path, json, 'utf-8')
    await noteRecent(path)
    return path
  } catch (err) {
    dialog.showErrorBox('Enregistrement impossible', err instanceof Error ? err.message : String(err))
    return null
  }
})

ipcMain.handle('project:open', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [FILTER] })
  if (res.canceled || !res.filePaths[0]) return null
  const path = res.filePaths[0]
  try {
    const json = await readFile(path, 'utf-8')
    await noteRecent(path)
    return { path, json }
  } catch (err) {
    dialog.showErrorBox('Ouverture impossible', err instanceof Error ? err.message : String(err))
    return null
  }
})

ipcMain.handle('recent:list', async () => {
  const home = homedir()
  return Promise.all(
    (await loadRecents()).map(async ({ path }) => {
      const dir = dirname(path)
      return {
        path,
        name: basename(path, '.trame'),
        dir: dir.startsWith(home) ? '~' + dir.slice(home.length) : dir,
        modified: await stat(path).then((st) => st.mtimeMs, () => null) // null = fichier introuvable
      }
    })
  )
})

ipcMain.handle('recent:remove', async (_e, path: string) => saveRecents(removeRecent(await loadRecents(), path)))
ipcMain.handle('recent:clear', () => saveRecents([]))

// Ouverture directe d'un chemin : réservée aux projets de la liste (le renderer ne peut pas lire un fichier arbitraire)
ipcMain.handle('project:open-path', async (_e, path: string) => {
  if (!(await loadRecents()).some((r) => r.path === path)) return null
  try {
    const json = await readFile(path, 'utf-8')
    await noteRecent(path)
    return { path, json }
  } catch {
    return null
  }
})

ipcMain.handle('templates:list', () => loadTemplateIndex())

ipcMain.handle('templates:save', async (_e, meta: unknown, json: unknown) => {
  try {
    if (typeof json !== 'string' || json.length > MAX_TEMPLATE_BYTES) throw new Error('Le design est trop volumineux pour devenir un modèle.')
    const entry = sanitizeMeta(meta, randomUUID(), Date.now())
    if (!entry) throw new Error('Informations du modèle invalides.')
    await mkdir(templatesDir(), { recursive: true })
    await writeFile(join(templatesDir(), `${entry.id}.json`), json, 'utf-8')
    await saveTemplateIndex(addMeta(await loadTemplateIndex(), entry))
    return entry
  } catch (err) {
    dialog.showErrorBox('Enregistrement du modèle impossible', err instanceof Error ? err.message : String(err))
    return null
  }
})

ipcMain.handle('templates:load', async (_e, id: unknown) => {
  if (!isValidId(id)) return null
  try {
    return await readFile(join(templatesDir(), `${id}.json`), 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('templates:delete', async (_e, id: unknown) => {
  if (!isValidId(id)) return
  await rm(join(templatesDir(), `${id}.json`), { force: true })
  await saveTemplateIndex(removeMeta(await loadTemplateIndex(), id))
})

ipcMain.handle('dialog:confirm', async (e, message: string, detail: string, confirmLabel: string) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: [confirmLabel, 'Annuler'],
    defaultId: 1,
    cancelId: 1,
    message,
    detail
  })
  return response === 0
})

ipcMain.handle('dialog:unsaved', async (e, name: string, action: string) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'],
    defaultId: 0,
    cancelId: 2,
    message: `Enregistrer les modifications de « ${name} » ?`,
    detail: `Vos modifications seront perdues si vous ne les enregistrez pas avant de ${action}.`
  })
  return (['save', 'discard', 'cancel'] as const)[response]
})

ipcMain.handle('dialog:error', (_e, title: string, message: string) => {
  dialog.showErrorBox(title, message)
})

// Format personnalisé : le préfixe « web » est exigé par l'API presse-papiers pour les types non standard.
// Écrire remplace tout le contenu : la dernière copie (Trame ou autre application) l'emporte toujours.
const ELEMENTS_FORMAT = 'web application/x-trame-elements'
const IMAGE_FORMATS = ['image/png', 'image/jpeg']

ipcMain.handle('clipboard:write-elements', (_e, json: string) =>
  clipboard.write([new ClipboardItem({ [ELEMENTS_FORMAT]: json })])
)

ipcMain.handle('clipboard:read', async () => {
  const items = await clipboard.read()
  for (const item of items) {
    if (item.types.includes(ELEMENTS_FORMAT)) {
      return { kind: 'elements', json: await (await item.getType(ELEMENTS_FORMAT)).text() }
    }
  }
  for (const item of items) {
    const mime = IMAGE_FORMATS.find((m) => item.types.includes(m))
    if (mime) {
      const buf = Buffer.from(await ((await item.getType(mime)) as Blob).arrayBuffer())
      return { kind: 'image', dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
    }
  }
  const text = await clipboard.readText()
  return text.trim() ? { kind: 'text', text } : null
})

ipcMain.on('app:state', (_e, state: { dirty: boolean; path?: string }) => {
  closeGuard.setDirty(state.dirty)
  // macOS : point dans le bouton de fermeture et icône du document dans la barre de titre
  mainWindow?.setDocumentEdited(state.dirty)
  mainWindow?.setRepresentedFilename(state.path ?? '')
})

ipcMain.on('app:close-confirmed', () => {
  // si la fermeture bloquée venait d'une sortie (⌘Q), le blocage l'a annulée : on la relance
  if (closeGuard.onConfirmed() === 'quit') app.quit()
  else mainWindow?.close()
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

app.on('before-quit', () => closeGuard.onBeforeQuit())

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
