import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { basename, dirname } from 'path'
import { createCloseGuard } from './closeGuard'
import { createFileInbox } from './fileInbox'
import {
  addHidden, addMeta, isBuiltinId, isValidId, parseHidden, parseTemplateIndex, removeMeta, renameMeta, replaceMeta, sanitizeMeta,
  type TemplateMeta
} from './userTemplates'
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
  app.addRecentDocument(path) // menu « Ouvrir récent » du Dock et du menu Pomme (macOS ; sans effet ailleurs)
}

// ── Modèles de l'utilisateur ──────────────────────────────────────────────────────────────────────────────
// userData/templates/index.json : métadonnées légères (nom, miniature…), lues à chaque affichage de la liste ;
// userData/templates/<id>.json : le document complet, lu uniquement à l'application du modèle.
const MAX_TEMPLATE_BYTES = 64 * 1024 * 1024
const templatesDir = (): string => join(app.getPath('userData'), 'templates')
const templateIndexFile = (): string => join(templatesDir(), 'index.json')
const hiddenFile = (): string => join(templatesDir(), 'hidden.json')

async function loadTemplateIndex(): Promise<TemplateMeta[]> {
  try {
    return parseTemplateIndex(await readFile(templateIndexFile(), 'utf-8'))
  } catch {
    return [] // aucun modèle enregistré pour l'instant
  }
}

async function loadHidden(): Promise<string[]> {
  try {
    return parseHidden(await readFile(hiddenFile(), 'utf-8'))
  } catch {
    return [] // aucun modèle intégré masqué
  }
}

const saveTemplateIndex = (list: TemplateMeta[]): Promise<void> => writeFile(templateIndexFile(), JSON.stringify(list), 'utf-8')

// Réservé aux tests de bout en bout (scripts/smoke-test.mjs) : si cette variable d'environnement est définie, les exports
// sont écrits directement dans ce dossier, sans boîte de dialogue (impossible à piloter depuis un test).
const TEST_EXPORT_DIR = process.env.TRAME_TEST_EXPORT_DIR

const FILTER = { name: 'Projet Trame', extensions: ['trame'] }

let mainWindow: BrowserWindow | null = null
/** Fichiers ouverts par le système, en attente d'un renderer prêt à les recevoir. */
const fileInbox = createFileInbox<{ path: string; json: string }>()
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
  win.webContents.on('did-start-loading', () => fileInbox.onRendererGone())
  // le zoom de la page est géré par l'éditeur (canvas) : on interdit le zoom visuel du navigateur (pincement)
  win.webContents.on('did-finish-load', () => win.webContents.setVisualZoomLevelLimits(1, 1))
  win.on('closed', () => {
    mainWindow = null
    fileInbox.onRendererGone()
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

// kit de marque : un fichier JSON dans le dossier de données ; la validation du contenu est faite par l'interface (brandKit.ts)
const brandFile = (): string => join(app.getPath('userData'), 'brand-kit.json')
const MAX_BRAND_BYTES = 40_000_000

ipcMain.handle('brand:load', async () => readFile(brandFile(), 'utf-8').catch(() => null))
ipcMain.handle('brand:save', async (_e, json: unknown) => {
  if (typeof json !== 'string' || json.length > MAX_BRAND_BYTES) return false
  try {
    await writeFile(brandFile(), json, 'utf-8')
    return true
  } catch {
    return false
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
ipcMain.handle('recent:clear', () => {
  app.clearRecentDocuments()
  return saveRecents([])
})

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

// `replaceId` : remplace le contenu d'un modèle existant (même identifiant) au lieu d'en créer un nouveau
ipcMain.handle('templates:save', async (_e, meta: unknown, json: unknown, replaceId?: unknown) => {
  try {
    if (typeof json !== 'string' || json.length > MAX_TEMPLATE_BYTES) throw new Error('Le design est trop volumineux pour devenir un modèle.')
    await mkdir(templatesDir(), { recursive: true })
    const index = await loadTemplateIndex()
    let entry: TemplateMeta | undefined
    let next: TemplateMeta[] | null
    if (replaceId !== undefined && replaceId !== null) {
      if (!isValidId(replaceId) || !index.some((m) => m.id === replaceId)) throw new Error('Le modèle à remplacer est introuvable.')
      next = replaceMeta(index, replaceId, meta)
      entry = next?.[0]
    } else {
      entry = sanitizeMeta(meta, randomUUID(), Date.now()) ?? undefined
      next = entry ? addMeta(index, entry) : null
    }
    if (!entry || !next) throw new Error('Informations du modèle invalides.')
    await writeFile(join(templatesDir(), `${entry.id}.json`), json, 'utf-8')
    await saveTemplateIndex(next)
    return entry
  } catch (err) {
    dialog.showErrorBox('Enregistrement du modèle impossible', err instanceof Error ? err.message : String(err))
    return null
  }
})

ipcMain.handle('templates:rename', async (_e, id: unknown, name: unknown) => {
  if (!isValidId(id)) return null
  const index = await loadTemplateIndex()
  if (!index.some((m) => m.id === id)) return null
  const next = renameMeta(index, id, name)
  await saveTemplateIndex(next)
  return next.find((m) => m.id === id) ?? null
})

// Modèles intégrés masqués par l'utilisateur (ils sont dans le code : on les cache, on ne les supprime pas)
ipcMain.handle('templates:hidden', () => loadHidden())

ipcMain.handle('templates:hide', async (_e, id: unknown) => {
  if (!isBuiltinId(id)) return
  await mkdir(templatesDir(), { recursive: true })
  await writeFile(hiddenFile(), JSON.stringify(addHidden(await loadHidden(), id)), 'utf-8')
})

ipcMain.handle('templates:unhide-all', async () => {
  await rm(hiddenFile(), { force: true })
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
  if (TEST_EXPORT_DIR) {
    // mode test (voir export:save) : on garde la question et on répond « oui », sans boîte que le test ne pourrait pas fermer
    await writeFile(join(TEST_EXPORT_DIR, 'dialog-confirm.txt'), `${message}\n${detail}\n[${confirmLabel}]`, 'utf-8')
    return true
  }
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

ipcMain.handle('dialog:info', async (e, message: string, detail: string) => {
  if (TEST_EXPORT_DIR) {
    // mode test (voir export:save) : on garde le message dans un fichier au lieu d'ouvrir une boîte que le test ne peut pas fermer
    await writeFile(join(TEST_EXPORT_DIR, 'dialog-info.txt'), `${message}\n${detail}`, 'utf-8')
    return
  }
  const win = BrowserWindow.fromWebContents(e.sender)!
  await dialog.showMessageBox(win, { type: 'info', buttons: ['OK'], defaultId: 0, message, detail })
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

const MAX_PDF_BYTES = 150_000_000

/** Choix d'un PDF à importer : retourne son nom (sans extension) et son contenu. */
ipcMain.handle('pdf:pick', async (): Promise<{ name: string; bytes: Uint8Array } | null> => {
  let path: string
  if (TEST_EXPORT_DIR) {
    // tests de bout en bout : le fichier pick-import.pdf du dossier de test tient lieu de choix (aucun dialogue natif)
    path = join(TEST_EXPORT_DIR, 'pick-import.pdf')
    if (!(await stat(path).catch(() => null))) return null
  } else {
    const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (res.canceled || !res.filePaths[0]) return null
    path = res.filePaths[0]
  }
  if ((await stat(path)).size > MAX_PDF_BYTES) {
    dialog.showErrorBox('PDF trop volumineux', 'Ce PDF dépasse 150 Mo : il ne peut pas être importé.')
    return null
  }
  return { name: basename(path).replace(/\.pdf$/i, ''), bytes: new Uint8Array(await readFile(path)) }
})

ipcMain.handle('image:pick', async () => {
  // tests de bout en bout : l'image « choisie » est le fichier pick-image.png du dossier de test (aucun dialogue natif)
  if (TEST_EXPORT_DIR) {
    const buf = await readFile(join(TEST_EXPORT_DIR, 'pick-image.png')).catch(() => null)
    return buf ? `data:image/png;base64,${buf.toString('base64')}` : null
  }
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
  if (TEST_EXPORT_DIR) {
    const path = join(TEST_EXPORT_DIR, basename(name)) // basename : aucun chemin fourni par le renderer n'est suivi
    await writeFile(path, Buffer.from(dataUrl.split(',')[1], 'base64'))
    return path
  }
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

// Double-clic sur un .trame, glisser sur l'icône, Dock « Ouvrir récent » (macOS). L'événement peut arriver
// avant que l'application soit prête : le listener est donc enregistré dès le chargement du module.
app.on('open-file', (event, path) => {
  event.preventDefault()
  void openFromSystem(path)
})

async function openFromSystem(path: string): Promise<void> {
  await app.whenReady()
  if (!path.endsWith('.trame')) return
  let json: string
  try {
    json = await readFile(path, 'utf-8')
  } catch (err) {
    dialog.showErrorBox('Ouverture impossible', err instanceof Error ? err.message : String(err))
    return
  }
  await noteRecent(path)
  if (!mainWindow) createWindow() // application ouverte sans fenêtre (macOS) : on en crée une, le fichier attend le renderer
  const now = fileInbox.push({ path, json })
  if (now) mainWindow?.webContents.send('app:open-file', now)
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.focus()
}

// Le renderer écoute désormais : on lui remet le fichier reçu pendant le démarrage, s'il y en a un
ipcMain.handle('app:renderer-ready', () => fileInbox.onRendererReady())

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
