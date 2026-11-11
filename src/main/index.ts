import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, nativeTheme, net, screen, session, shell, systemPreferences, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { homedir, tmpdir } from 'os'
import { basename, dirname, sep } from 'path'
import { DOCUMENT_IMAGE_MIME, MAX_DOCUMENT_IMAGE_BYTES, resolveDocumentImage } from './outlineImage'
import type { InstalledFont, PhotoSearchResult } from '../preload'
import { ALL_VARIANTS, CATEGORY_LIST, CUSTOM_PREFIX, FONTS_API, FONTS_CDN, MAX_FONT_BYTES, cssFamily, fontFileUrl, isFontFile, isSafeFamilyName, isSafeId, isWoff2, parseCatalog, type CatalogFont, type FontVariant } from './fontCatalog'
import { CLEVELAND_BASE, COMMONS_BASE, MAX_IMAGE_BYTES, MAX_THUMB_BYTES, NASA_BASE, OPENVERSE_BASE, clevelandUrl, commonsUrl, imageMime, isAllowedUrl, nasaUrl, parseCleveland, parseCommons, parseNasa, parseSearch, searchUrl, type Photo } from './photos'
import { PHOTO_SOURCE_NAMES, sourcesFor, type PhotoSource } from '../shared/photoSources'
import { createCloseGuard } from './closeGuard'
import { autoUpdater } from 'electron-updater'
import { createUpdater, testUpdateEngine, type UpdateEngine } from './updater'
import { parseRepository, parseUpdateSettings, releasesUrl } from '../shared/update'
import { clearRecovery, listRecoverable, readRecovery, writeRecovery } from './recoveryStore'
import { addIfNew, addVersion, deleteVersion, labelVersion, listVersions, readVersion } from './versionStore'
import { safeExportName } from './exportFolder'
import { isDuplex, sheetGeometry } from '../shared/printSheet'
import { MAX_MERGE_IMAGE_BYTES, MAX_MERGE_IMAGE_FILES, isMergeImageFile, mergeImageMime } from '../shared/mergeImages'
import { createFullscreenGuard, leaveFullscreenQuietly } from './fullscreenGuard'
import { mergeSpeakerState, parseSpeakerCommand, parseSpeakerState, type SpeakerState } from './speakerProtocol'
import { createFileInbox } from './fileInbox'
import { MAX_MEDIA_BYTES, MAX_MEDIA_DEPTH, MAX_MEDIA_FILES, isMediaFile, isSafeRelative, mediaMime, parseMediaState, withTags, type MediaItem, type MediaState } from '../shared/mediaLibrary'
import { projectFilesFromArgv } from './launchArgs'
import { isOpenableLink } from '../shared/links'
import { AUDIO_EXTENSIONS, MAX_AUDIO_BYTES, isAudioFile, type AudioPick } from '../shared/audioFiles'
import { registerCapture } from './capture'
import { MAX_CLIP_BYTES, VIDEO_TYPES, isVideoFile, videoMime, type VideoPick } from '../shared/videoFiles'
import { initMainLocale, mainLocale, setMainLocale, tm } from './i18n'
import { contextPlan, dictionariesFor, isDictionaryWord, parseSpellSettings, SPELL_LANGUAGES, type ContextItem, type SpellSettings } from './spellSettings'
import {
  PACK_EXTENSION, addHidden, addMeta, buildPack, isBuiltinId, isValidId, parseHidden, parsePack, parseTemplateIndex, removeMeta, renameMeta, replaceMeta,
  sanitizeMeta, type PackEntry, type TemplateMeta
} from './userTemplates'
import { parseRecents, pushRecent, removeRecent, type RecentEntry } from './recents'
import { DEFAULT_APP_SETTINGS, lastDocumentToReopen, parseAppSettings, parseLastDocument, type AppSettings } from './appSettings'
import { registerAiHandlers } from './aiIpc'

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

const FORCED_LANG = process.env.TRAME_LANG

const projectFilter = (): { name: string; extensions: string[] } => ({ name: tm('main.filter.project'), extensions: ['trame'] })

let mainWindow: BrowserWindow | null = null
/** Fichiers ouverts par le système, en attente d'un renderer prêt à les recevoir. */
const fileInbox = createFileInbox<{ path: string; json: string }>()
/** Intercepte la fermeture / la sortie tant que le renderer signale des modifications non enregistrées. */
const closeGuard = createCloseGuard()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 760,
    minHeight: 420,
    title: 'Trame',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1f24' : '#eef0f5',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Windows et Linux : pas de barre de menus Electron en permanence (Alt la montre) ; l'application a sa propre barre d'outils
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      additionalArguments: FORCED_LANG ? [`--trame-lang=${FORCED_LANG}`] : [],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // les clips vidéo d'une présentation démarrent seuls, avec leur son (la présentation est lancée par la personne elle-même)
      autoplayPolicy: 'no-user-gesture-required',
      // en test, la fenêtre peut être recouverte ou passée à l'arrière-plan : Chromium suspendrait alors rendu et minuteurs
      backgroundThrottling: !TEST_EXPORT_DIR || Boolean(process.env.SMOKE_THROTTLE)
    }
  })

  mainWindow = win
  // le mode présentation passe en plein écran ; si l'utilisateur en sort autrement (bouton système), l'interface le sait
  win.on('leave-full-screen', () => {
    if (fullscreenGuard.onLeave()) win.webContents.send('window:left-fullscreen')
  })
  win.on('enter-full-screen', () => fullscreenGuard.onEnter())
  win.webContents.on('did-start-loading', () => {
    fileInbox.onRendererGone()
    startupDone = false
    // rechargement voulu de la page : le travail non enregistré est perdu comme avant, sa copie n'a plus d'objet. Après un plantage de la page, on la garde pour la proposer.
    if (!rendererCrashed) void clearRecovery(app.getPath('userData'), SESSION_ID).catch(() => {})
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') rendererCrashed = true
  })
  // le zoom de la page est géré par l'éditeur (canvas) : on interdit le zoom visuel du navigateur (pincement)
  win.webContents.on('did-finish-load', () => win.webContents.setVisualZoomLevelLimits(1, 1))
  win.webContents.on('context-menu', (_e, params) => showContextMenu(win, params))
  win.on('closed', () => {
    mainWindow = null
    fileInbox.onRendererGone()
    startupDone = false
    closeGuard.onClosed()
    // fermeture normale (enregistré, ignoré ou rien à enregistrer) : la copie de secours n'a plus d'objet
    void clearRecovery(app.getPath('userData'), SESSION_ID).catch(() => {})
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
    if (!path && TEST_EXPORT_DIR) {
      // tests de bout en bout : « Enregistrer » écrit dans le dossier de test (aucun dialogue natif)
      path = join(TEST_EXPORT_DIR, `${basename(name || tm('doc.untitled'))}.trame`)
    }
    if (!path) {
      const win = BrowserWindow.fromWebContents(e.sender)!
      const res = await dialog.showSaveDialog(win, { defaultPath: `${name || tm('doc.untitled')}.trame`, filters: [projectFilter()] })
      if (res.canceled || !res.filePath) return null
      path = res.filePath
    }
    // l'historique ne doit jamais empêcher d'enregistrer : état d'avant l'écrasement, puis nouvelle version
    await readFile(path, 'utf-8').then((before) => addIfNew(app.getPath('userData'), path!, before), () => null).catch(() => null)
    await writeFile(path, json, 'utf-8')
    await addVersion(app.getPath('userData'), path, json).catch(() => null)
    await noteRecent(path)
    return path
  } catch (err) {
    dialog.showErrorBox(tm('main.saveFailed'), err instanceof Error ? err.message : String(err))
    return null
  }
})

// Historique des versions d'un fichier (voir versionStore.ts) ; le chemin ne sert qu'à retrouver le dossier d'historique.
const asPath = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length < 4096 ? v : null)
ipcMain.handle('versions:list', async (_e, path: unknown) => {
  const p = asPath(path)
  return p ? listVersions(app.getPath('userData'), p) : []
})
ipcMain.handle('versions:read', async (_e, path: unknown, id: unknown) => {
  const p = asPath(path)
  return p && typeof id === 'string' ? readVersion(app.getPath('userData'), p, id) : null
})
ipcMain.handle('versions:snapshot', async (_e, path: unknown, json: unknown, label: unknown) => {
  const p = asPath(path)
  if (!p || typeof json !== 'string') return null
  return addVersion(app.getPath('userData'), p, json, { manual: true, label: typeof label === 'string' ? label : undefined }).catch(() => null)
})
ipcMain.handle('versions:label', async (_e, path: unknown, id: unknown, label: unknown) => {
  const p = asPath(path)
  return p && typeof id === 'string' && typeof label === 'string' ? labelVersion(app.getPath('userData'), p, id, label) : false
})
ipcMain.handle('versions:delete', async (_e, path: unknown, id: unknown) => {
  const p = asPath(path)
  return p && typeof id === 'string' ? deleteVersion(app.getPath('userData'), p, id) : false
})

// Copie de secours (voir recoveryStore.ts) : une par lancement de l'application, effacée à toute fermeture normale.
const SESSION_ID = randomUUID()
let rendererCrashed = false
ipcMain.handle('recovery:write', async (_e, json: unknown, path: unknown, name: unknown) => {
  if (typeof json !== 'string') return false
  return writeRecovery(app.getPath('userData'), SESSION_ID, json, { path: asPath(path) ?? undefined, name: typeof name === 'string' ? name : '' }).catch(() => false)
})
ipcMain.handle('recovery:clear', () => clearRecovery(app.getPath('userData'), SESSION_ID).catch(() => {}))
ipcMain.handle('recovery:list', () => {
  // après un plantage de la page, la copie de cette session est elle aussi proposée (la page rechargée n'a plus rien en mémoire)
  const own = rendererCrashed ? '' : SESSION_ID
  rendererCrashed = false
  return listRecoverable(app.getPath('userData'), own).catch(() => [])
})
ipcMain.handle('recovery:read', (_e, id: unknown) => (typeof id === 'string' ? readRecovery(app.getPath('userData'), id) : null))
ipcMain.handle('recovery:discard', (_e, id: unknown) => (typeof id === 'string' ? clearRecovery(app.getPath('userData'), id).catch(() => {}) : undefined))

// Choix d'un autre fichier .trame à comparer : lu sans être ajouté aux projets récents ni devenir le document courant.
ipcMain.handle('project:pick-other', async (e) => {
  let path: string
  if (TEST_EXPORT_DIR) {
    // tests de bout en bout : le fichier pick-other.trame du dossier de test tient lieu de choix (aucun dialogue natif)
    path = join(TEST_EXPORT_DIR, 'pick-other.trame')
  } else {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [projectFilter()] })
    if (res.canceled || !res.filePaths[0]) return null
    path = res.filePaths[0]
  }
  try {
    return { path, json: await readFile(path, 'utf-8') }
  } catch (err) {
    dialog.showErrorBox(tm('file.openFailed'), err instanceof Error ? err.message : String(err))
    return null
  }
})

ipcMain.handle('project:open', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [projectFilter()] })
  if (res.canceled || !res.filePaths[0]) return null
  const path = res.filePaths[0]
  try {
    const json = await readFile(path, 'utf-8')
    await noteRecent(path)
    return { path, json }
  } catch (err) {
    dialog.showErrorBox(tm('file.openFailed'), err instanceof Error ? err.message : String(err))
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

// signatures enregistrées : un fichier JSON dans le dossier de données ; la validation du contenu est faite par l'interface (signature.ts)
const signaturesFile = (): string => join(app.getPath('userData'), 'signatures.json')
const MAX_SIGNATURES_BYTES = 12_000_000

ipcMain.handle('signatures:load', async () => readFile(signaturesFile(), 'utf-8').catch(() => null))
ipcMain.handle('signatures:save', async (_e, json: unknown) => {
  if (typeof json !== 'string' || json.length > MAX_SIGNATURES_BYTES) return false
  try {
    await writeFile(signaturesFile(), json, 'utf-8')
    return true
  } catch {
    return false
  }
})

// correcteur orthographique : réglages enregistrés (activé, langue) ; le dictionnaire personnel est celui de Chromium (session)
const spellFile = (): string => join(app.getPath('userData'), 'spell-settings.json')
let spellSettings: SpellSettings = parseSpellSettings(null)

/** Applique les réglages à la session. Sur macOS le système choisit seul la langue (l'appel serait sans effet). */
function applySpellSettings(): void {
  const ses = session.defaultSession
  ses.setSpellCheckerEnabled(spellSettings.enabled)
  if (process.platform === 'darwin') return
  const dictionaries = dictionariesFor(spellSettings, mainLocale(), ses.availableSpellCheckerLanguages)
  if (dictionaries.length) ses.setSpellCheckerLanguages(dictionaries)
}

async function initSpellcheck(): Promise<void> {
  spellSettings = TEST_EXPORT_DIR ? parseSpellSettings(null) : parseSpellSettings(await readFile(spellFile(), 'utf-8').catch(() => null))
  applySpellSettings()
}

const spellState = (): { enabled: boolean; language: SpellSettings['language']; languages: readonly string[]; systemManaged: boolean } => ({
  enabled: spellSettings.enabled,
  language: spellSettings.language,
  languages: SPELL_LANGUAGES,
  systemManaged: process.platform === 'darwin'
})

ipcMain.handle('spell:state', () => spellState())
ipcMain.handle('spell:set', async (_e, raw: unknown) => {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  spellSettings = parseSpellSettings({ enabled: o.enabled ?? spellSettings.enabled, language: o.language ?? spellSettings.language })
  applySpellSettings()
  if (!TEST_EXPORT_DIR) await writeFile(spellFile(), JSON.stringify(spellSettings), 'utf-8').catch(() => {})
  return spellState()
})
ipcMain.handle('spell:dictionary', async () => (await session.defaultSession.listWordsInSpellCheckerDictionary()).filter(isDictionaryWord).sort((a, b) => a.localeCompare(b)))
ipcMain.handle('spell:add', (_e, word: unknown) => isDictionaryWord(word) && session.defaultSession.addWordToSpellCheckerDictionary(word))
ipcMain.handle('spell:remove', (_e, word: unknown) => isDictionaryWord(word) && session.defaultSession.removeWordFromSpellCheckerDictionary(word))

/** Clic droit : suggestions d'orthographe et commandes de saisie (Electron n'en affiche aucun de lui-même). */
function showContextMenu(win: BrowserWindow, params: Electron.ContextMenuParams): void {
  const wc = win.webContents
  const label = (item: ContextItem): MenuItemConstructorOptions | null => {
    switch (item.kind) {
      case 'suggestion':
        return { label: item.word, click: () => wc.replaceMisspelling(item.word) }
      case 'no-suggestion':
        return { label: tm('main.ctx.noSuggestion'), enabled: false }
      case 'add-word':
        return { label: tm('main.ctx.addWord', { word: item.word }), click: () => void session.defaultSession.addWordToSpellCheckerDictionary(item.word) }
      case 'separator':
        return { type: 'separator' }
      case 'cut':
        return { label: tm('main.ctx.cut'), role: 'cut', enabled: item.enabled }
      case 'copy':
        return { label: tm('main.ctx.copy'), role: 'copy', enabled: item.enabled }
      case 'paste':
        return { label: tm('main.ctx.paste'), role: 'paste', enabled: item.enabled }
      case 'select-all':
        return { label: tm('main.ctx.selectAll'), role: 'selectAll', enabled: item.enabled }
    }
  }
  const items = contextPlan(params).map(label).filter((i): i is MenuItemConstructorOptions => i !== null)
  if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
}

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
    if (typeof json !== 'string' || json.length > MAX_TEMPLATE_BYTES) throw new Error(tm('main.template.tooBig'))
    await mkdir(templatesDir(), { recursive: true })
    const index = await loadTemplateIndex()
    let entry: TemplateMeta | undefined
    let next: TemplateMeta[] | null
    if (replaceId !== undefined && replaceId !== null) {
      if (!isValidId(replaceId) || !index.some((m) => m.id === replaceId)) throw new Error(tm('main.template.notFound'))
      next = replaceMeta(index, replaceId, meta)
      entry = next?.[0]
    } else {
      entry = sanitizeMeta(meta, randomUUID(), Date.now()) ?? undefined
      next = entry ? addMeta(index, entry) : null
    }
    if (!entry || !next) throw new Error(tm('main.template.invalid'))
    await writeFile(join(templatesDir(), `${entry.id}.json`), json, 'utf-8')
    await saveTemplateIndex(next)
    return entry
  } catch (err) {
    dialog.showErrorBox(tm('main.template.saveFailed'), err instanceof Error ? err.message : String(err))
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

// Packs de modèles : plusieurs modèles personnels dans un seul fichier à partager (voir buildPack / parsePack)
ipcMain.handle('templates:export-pack', async (_e, ids: unknown) => {
  const wanted = Array.isArray(ids) ? ids.filter(isValidId) : []
  const entries: PackEntry[] = []
  for (const meta of (await loadTemplateIndex()).filter((m) => wanted.includes(m.id))) {
    const json = await readFile(join(templatesDir(), `${meta.id}.json`), 'utf-8').catch(() => null)
    if (json) entries.push({ meta, json })
  }
  if (entries.length === 0) return null
  const name = `${tm('main.pack.defaultName')}.${PACK_EXTENSION}`
  let path: string
  if (TEST_EXPORT_DIR) {
    path = join(TEST_EXPORT_DIR, name) // mode test (voir export:save)
  } else {
    const res = await dialog.showSaveDialog({ defaultPath: name, filters: [{ name: tm('main.pack.filter'), extensions: [PACK_EXTENSION] }] })
    if (res.canceled || !res.filePath) return null
    path = res.filePath
  }
  await writeFile(path, buildPack(entries), 'utf-8')
  return entries.length
})

ipcMain.handle('templates:import-pack', async () => {
  const file = await pickImportFile(PACK_EXTENSION, tm('main.pack.filter'))
  if (!file) return null
  const pack = parsePack(Buffer.from(file.bytes).toString('utf-8'))
  if (!pack) {
    dialog.showErrorBox(tm('main.pack.invalid.title'), tm('main.pack.invalid'))
    return null
  }
  await mkdir(templatesDir(), { recursive: true })
  let index = await loadTemplateIndex()
  let skipped = pack.skipped
  let imported = 0
  for (const entry of pack.entries) {
    const meta = sanitizeMeta(entry.meta, randomUUID(), Date.now())
    if (!meta) {
      skipped++
      continue
    }
    await writeFile(join(templatesDir(), `${meta.id}.json`), entry.json, 'utf-8')
    index = addMeta(index, meta)
    imported++
  }
  await saveTemplateIndex(index)
  return { imported, skipped }
})

// ── Bibliothèque de médias : un dossier choisi par l'utilisateur, relu à chaque affichage ─────────────────────────────────
// userData/media.json : { folder, tags } ; les images ne sont jamais copiées ni modifiées. Le renderer ne fournit jamais de chemin
// absolu : seulement un chemin relatif au dossier choisi, revérifié ici (voir isSafeRelative et la résolution réelle du fichier).
const mediaFile = (): string => join(app.getPath('userData'), 'media.json')
const loadMedia = async (): Promise<MediaState> => parseMediaState(await readFile(mediaFile(), 'utf-8').catch(() => ''))
const saveMedia = (state: MediaState): Promise<void> => writeFile(mediaFile(), JSON.stringify(state), 'utf-8')

/** Images du dossier (sous-dossiers compris, sans suivre de lien symbolique ni de fichier caché), par ordre alphabétique. */
async function scanMedia(folder: string, tags: MediaState['tags']): Promise<{ items: MediaItem[]; truncated: boolean }> {
  const items: MediaItem[] = []
  let truncated = false
  const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (items.length >= MAX_MEDIA_FILES) {
        truncated = true
        return
      }
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue
      const path = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (depth < MAX_MEDIA_DEPTH) await walk(join(dir, e.name), path, depth + 1)
      } else if (e.isFile() && isMediaFile(e.name)) {
        const st = await stat(join(dir, e.name)).catch(() => null)
        if (st) items.push({ path, name: e.name, size: st.size, tags: tags[path] ?? [] })
      }
    }
  }
  await walk(folder, '', 0)
  return { items, truncated }
}

ipcMain.handle('media:state', async () => ({ folder: (await loadMedia()).folder }))

ipcMain.handle('media:choose', async () => {
  let folder: string
  if (TEST_EXPORT_DIR) {
    folder = join(TEST_EXPORT_DIR, 'media') // mode test : le dossier « media » du dossier de test tient lieu de choix
    if (!(await stat(folder).catch(() => null))?.isDirectory()) return null
  } else {
    const res = await dialog.showOpenDialog({ title: tm('main.media.choose'), properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    folder = res.filePaths[0]
  }
  await saveMedia({ ...(await loadMedia()), folder })
  return folder
})

ipcMain.handle('media:forget', async () => {
  await saveMedia({ ...(await loadMedia()), folder: null })
})

ipcMain.handle('media:list', async () => {
  const state = await loadMedia()
  if (!state.folder) return { folder: null, items: [], truncated: false, missing: false }
  if (!(await stat(state.folder).catch(() => null))?.isDirectory()) return { folder: state.folder, items: [], truncated: false, missing: true }
  return { folder: state.folder, ...(await scanMedia(state.folder, state.tags)), missing: false }
})

ipcMain.handle('media:read', async (_e, rel: unknown) => {
  const { folder } = await loadMedia()
  if (!folder || !isSafeRelative(rel) || !isMediaFile(rel.split('/').pop()!)) return null
  try {
    const target = join(folder, ...rel.split('/'))
    const info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_MEDIA_BYTES) return null
    // le fichier réel doit rester dans le dossier choisi (un sous-dossier qui est un lien symbolique ne doit pas en faire sortir)
    if (!(await realpath(target)).startsWith((await realpath(folder)) + sep)) return null
    return `data:${mediaMime(rel)};base64,${(await readFile(target)).toString('base64')}`
  } catch {
    return null
  }
})

ipcMain.handle('media:set-tags', async (_e, rel: unknown, tags: unknown) => {
  if (!isSafeRelative(rel)) return []
  const state = withTags(await loadMedia(), rel, tags)
  await saveMedia(state)
  return state.tags[rel] ?? []
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
    buttons: [confirmLabel, tm('common.cancel')],
    defaultId: 1,
    cancelId: 1,
    message,
    detail
  })
  return response === 0
})

const UNSAVED_ACTIONS = ['close', 'new', 'open', 'importPdf', 'importPptx', 'importDocument', 'template'] as const
ipcMain.handle('dialog:unsaved', async (e, name: string, action: string) => {
  if (!(UNSAVED_ACTIONS as readonly string[]).includes(action)) return 'cancel'
  const win = BrowserWindow.fromWebContents(e.sender)!
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: [tm('unsaved.save'), tm('unsaved.discard'), tm('common.cancel')],
    defaultId: 0,
    cancelId: 2,
    message: tm('unsaved.message', { name }),
    detail: tm('unsaved.detail', { action: tm(`unsaved.action.${action as (typeof UNSAVED_ACTIONS)[number]}`) })
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
  noteLastDocument(typeof state.path === 'string' && state.path ? state.path : null)
  // macOS : point dans le bouton de fermeture et icône du document dans la barre de titre
  mainWindow?.setDocumentEdited(state.dirty)
  mainWindow?.setRepresentedFilename(state.path ?? '')
})

ipcMain.on('app:close-confirmed', () => {
  // si la fermeture bloquée venait d'une sortie (⌘Q), le blocage l'a annulée : on la relance
  if (closeGuard.onConfirmed() === 'quit') app.quit()
  else mainWindow?.close()
})

const MAX_IMPORT_BYTES = 150_000_000

/** Choix d'un fichier à importer (PDF, PPTX) : retourne son nom (sans extension) et son contenu. */
async function pickImportFile(ext: 'pdf' | 'pptx' | 'csv' | 'tramepack', label: string): Promise<{ name: string; bytes: Uint8Array } | null> {
  let path: string
  if (TEST_EXPORT_DIR) {
    // tests de bout en bout : le fichier pick-import.<ext> du dossier de test tient lieu de choix (aucun dialogue natif)
    path = join(TEST_EXPORT_DIR, `pick-import.${ext}`)
    if (!(await stat(path).catch(() => null))) return null
  } else {
    const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: label, extensions: ext === 'csv' ? ['csv', 'tsv', 'txt'] : [ext] }] })
    if (res.canceled || !res.filePaths[0]) return null
    path = res.filePaths[0]
  }
  if ((await stat(path)).size > MAX_IMPORT_BYTES) {
    dialog.showErrorBox(tm('main.import.tooBig.title'), tm('main.import.tooBig'))
    return null
  }
  return { name: basename(path).replace(/\.(pdf|pptx|csv|tsv|txt|tramepack)$/i, ''), bytes: new Uint8Array(await readFile(path)) }
}

// --- Photos libres (Openverse) -------------------------------------------------------------------------------------------------
// Tout le réseau passe par le processus principal : l'interface n'a pas le droit de contacter un site tiers (CSP), ne reçoit que des
// images déjà téléchargées (data URL) et ne peut jamais faire télécharger une adresse de son choix (seules celles d'une recherche).
// TRAME_OPENVERSE_URL (tests de bout en bout) remplace le serveur et autorise http://127.0.0.1.
const OPENVERSE = process.env.TRAME_OPENVERSE_URL || OPENVERSE_BASE
const COMMONS = process.env.TRAME_COMMONS_URL || COMMONS_BASE
const NASA = process.env.TRAME_NASA_URL || NASA_BASE
const CLEVELAND = process.env.TRAME_CLEVELAND_URL || CLEVELAND_BASE
const FONTS_API_URL = process.env.TRAME_FONTS_API_URL || FONTS_API
const FONTS_CDN_URL = process.env.TRAME_FONTS_CDN_URL || FONTS_CDN
const ALLOW_LOCAL = !!(process.env.TRAME_OPENVERSE_URL || process.env.TRAME_COMMONS_URL || process.env.TRAME_NASA_URL || process.env.TRAME_CLEVELAND_URL || process.env.TRAME_FONTS_API_URL || process.env.TRAME_FONTS_CDN_URL)
/** délai d'une recherche : au-delà, on bascule sur la source de secours (réglable pour les tests) */
const SEARCH_TIMEOUT = Number(process.env.TRAME_PHOTO_TIMEOUT_MS) || 10_000
let lastPhotos = new Map<string, Photo>()

class NetworkError extends Error {
  constructor(
    public kind: 'offline' | 'rate-limit' | 'unavailable',
    /** cause technique (code HTTP, début de la réponse, message système) : affichée pour pouvoir diagnostiquer un service qui refuse */
    public detail = ''
  ) {
    super(kind)
  }
}

async function download(url: string, maxBytes: number, accept: string, timeoutMs = 20_000): Promise<{ bytes: Buffer; contentType: string | null }> {
  if (!isAllowedUrl(url, ALLOW_LOCAL)) throw new NetworkError('unavailable', tm('net.addressRefused', { url: url.slice(0, 120) }))
  let res: Response
  try {
    // net.fetch (pile réseau de Chromium) plutôt que le fetch de Node : le service est derrière Cloudflare, qui bloque (HTTP 403) les
    // requêtes dont l'empreinte TLS n'est pas celle d'un navigateur ; elle suit aussi le proxy du système
    res = await net.fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': `Trame/${app.getVersion()} (+desktop visual editor)`, Accept: accept } })
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause
    throw new NetworkError('offline', `${(err as Error).message}${cause ? ` (${cause.code ?? cause.message})` : ''}`) // pas de réseau, DNS, délai dépassé
  }
  if (res.status === 429) throw new NetworkError('rate-limit', 'HTTP 429')
  if (!res.ok) throw new NetworkError('unavailable', `HTTP ${res.status} — ${(await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)}`)
  if (!isAllowedUrl(res.url || url, ALLOW_LOCAL)) throw new NetworkError('unavailable', tm('net.redirectRefused', { url: (res.url || '').slice(0, 120) }))
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new NetworkError('unavailable', tm('net.tooLarge', { bytes: declared }))
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > maxBytes) throw new NetworkError('unavailable', tm('net.tooLarge', { bytes: bytes.length }))
  return { bytes, contentType: res.headers.get('content-type') }
}

const asDataUrl = (d: { bytes: Buffer; contentType: string | null }): string | null => {
  const mime = imageMime(d.contentType)
  return mime ? `data:${mime};base64,${d.bytes.toString('base64')}` : null
}


/** Recherche chez Openverse (filtre de licences du service, puis requête minimale si le service le refuse ou plante). */
async function searchOpenverse(query: string, page: number): Promise<ReturnType<typeof parseSearch>> {
  const res = await download(searchUrl(OPENVERSE, query, page, true), 2_000_000, 'application/json', SEARCH_TIMEOUT).catch(async (err) => {
    if (err instanceof NetworkError && err.kind === 'unavailable' && /^HTTP (400|5\d\d)/.test(err.detail)) return download(searchUrl(OPENVERSE, query, page, false), 2_000_000, 'application/json', SEARCH_TIMEOUT)
    throw err
  })
  return parseSearch(readJson(res), ALLOW_LOCAL)
}

async function searchCommons(query: string, page: number): Promise<ReturnType<typeof parseCommons>> {
  const res = await download(commonsUrl(COMMONS, query, page), 2_000_000, 'application/json', SEARCH_TIMEOUT)
  return parseCommons(readJson(res), page, ALLOW_LOCAL)
}

async function searchNasa(query: string, page: number): Promise<ReturnType<typeof parseNasa>> {
  const res = await download(nasaUrl(NASA, query, page), 2_000_000, 'application/json', SEARCH_TIMEOUT)
  return parseNasa(readJson(res), page, ALLOW_LOCAL)
}

async function searchCleveland(query: string, page: number): Promise<ReturnType<typeof parseCleveland>> {
  const res = await download(clevelandUrl(CLEVELAND, query, page), 2_000_000, 'application/json', SEARCH_TIMEOUT)
  return parseCleveland(readJson(res), page, ALLOW_LOCAL)
}

const SEARCHERS: Record<PhotoSource, (query: string, page: number) => Promise<{ photos: Photo[]; page: number; pageCount: number }>> = {
  commons: searchCommons,
  openverse: searchOpenverse,
  nasa: searchNasa,
  cleveland: searchCleveland
}

function readJson(res: { bytes: Buffer; contentType: string | null }): unknown {
  try {
    return JSON.parse(res.bytes.toString('utf-8'))
  } catch {
    throw new NetworkError('unavailable', tm('net.unreadable', { type: res.contentType ?? tm('net.unknownType'), excerpt: res.bytes.toString('utf-8').replace(/\s+/g, ' ').slice(0, 150) }))
  }
}

/** Miniatures téléchargées ici (6 à la fois) : l'interface ne contacte jamais le site d'une image. Une miniature indisponible retire la photo de la liste. */
async function withThumbnails(found: Photo[]): Promise<Extract<PhotoSearchResult, { ok: true }>['photos']> {
  const photos: Extract<PhotoSearchResult, { ok: true }>['photos'] = []
  const queue = [...found]
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        try {
          const thumb = asDataUrl(await download(p.thumbnailUrl, MAX_THUMB_BYTES, 'image/*'))
          if (thumb) photos.push({ id: p.id, title: p.title, creator: p.creator, license: p.license, credit: p.credit, width: p.width, height: p.height, thumb })
        } catch {
          /* ignorée */
        }
      }
    })
  )
  const order = new Map(found.map((p, i) => [p.id, i]))
  return photos.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

/**
 * Wikimedia Commons est la source principale (source « auto ») ; Openverse prend le relais quand Commons est lent ou en panne — Openverse
 * a connu de longues pannes (HTTP 500, 504, délais dépassés). NASA Images et le Cleveland Museum of Art sont des fonds thématiques, à
 * choisir explicitement. Une recherche sans résultat n'est PAS une panne.
 */
ipcMain.handle('photos:search', async (_e, query: unknown, page: unknown, source: unknown): Promise<PhotoSearchResult> => {
  const wanted = sourcesFor(source)
  if (typeof query !== 'string' || !query.trim()) return { ok: true, photos: [], page: 1, pageCount: 1, source: wanted[0], fallback: false }
  const pageNo = typeof page === 'number' ? page : 1
  const failures: string[] = []
  let firstError: NetworkError | null = null
  for (const s of wanted) {
    try {
      const found = await SEARCHERS[s](query, pageNo)
      const photos = await withThumbnails(found.photos)
      lastPhotos = new Map([...lastPhotos, ...found.photos.map((p): [string, Photo] => [p.id, p])])
      return { ok: true, photos, page: found.page, pageCount: found.pageCount, source: s, fallback: s !== wanted[0] }
    } catch (err) {
      const e = err instanceof NetworkError ? err : new NetworkError('unavailable', String(err))
      console.error(`[photos:search:${s}]`, e.kind, e.detail)
      failures.push(`${PHOTO_SOURCE_NAMES[s]} : ${e.detail || e.kind}`)
      firstError ??= e
    }
  }
  return { ok: false, error: firstError!.kind, detail: failures.join(' · ') }
})

/** Télécharge la photo choisie (l'original, sinon la miniature de l'API) : retourne une data URL, copiée ensuite dans le document. */
ipcMain.handle('photos:import', async (_e, id: unknown): Promise<{ ok: true; dataUrl: string; credit: string; title: string } | { ok: false; error: 'offline' | 'rate-limit' | 'unavailable'; detail?: string }> => {
  const photo = typeof id === 'string' ? lastPhotos.get(id) : undefined
  if (!photo) return { ok: false, error: 'unavailable' }
  let lastError: NetworkError = new NetworkError('unavailable', tm('net.noPhoto'))
  for (const url of [photo.url, photo.thumbnailUrl]) {
    try {
      const dataUrl = asDataUrl(await download(url, MAX_IMAGE_BYTES, 'image/*'))
      if (dataUrl) return { ok: true, dataUrl, credit: photo.credit, title: photo.title }
    } catch (err) {
      if (err instanceof NetworkError) lastError = err
    }
  }
  console.error('[photos:import]', lastError.kind, lastError.detail)
  return { ok: false, error: lastError.kind, detail: lastError.detail }
})

// --- Polices en ligne (Fontsource / Google Fonts) --------------------------------------------------------------------------------
// Même principe que les photos : réseau dans le processus principal, sur demande. Une police installée est copiée dans le dossier de
// données (utilisable hors ligne ensuite) ; ses octets passent à l'interface en base64 pour l'affichage et l'export PDF.
const fontsDir = (): string => join(app.getPath('userData'), 'fonts')
const catalogFile = (): string => join(app.getPath('userData'), 'fonts-catalog.json')
let catalogMemo: CatalogFont[] | null = null

async function loadCatalog(): Promise<{ fonts: CatalogFont[]; stale: boolean }> {
  if (catalogMemo) return { fonts: catalogMemo, stale: false }
  try {
    const res = await download(`${FONTS_API_URL.replace(/\/+$/, '')}/v1/fonts`, 8_000_000, 'application/json', 20_000)
    const fonts = parseCatalog(JSON.parse(res.bytes.toString('utf-8')))
    if (fonts.length === 0) throw new NetworkError('unavailable', tm('net.catalogEmpty'))
    catalogMemo = fonts
    await writeFile(catalogFile(), JSON.stringify(fonts), 'utf-8').catch(() => {}) // copie pour le mode hors ligne
    return { fonts, stale: false }
  } catch (err) {
    const cached = parseCatalog(JSON.parse(await readFile(catalogFile(), 'utf-8').catch(() => 'null')) as unknown)
    if (cached.length) return { fonts: cached, stale: true }
    throw err
  }
}

/** Les polices installées (dossier de données), avec leurs octets en base64. */
async function readInstalledFont(id: string): Promise<InstalledFont | null> {
  try {
    const dir = join(fontsDir(), id)
    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf-8')) as { name?: unknown; category?: unknown; license?: unknown; custom?: unknown }
    if (typeof meta.name !== 'string' || typeof meta.category !== 'string') return null
    const data: Record<string, string> = {}
    for (const v of ALL_VARIANTS) {
      // police du catalogue : <variante>.woff2 ; police personnelle : <variante>.font (TTF, OTF, WOFF ou WOFF2, tel que fourni)
      const bytes = (await readFile(join(dir, `${v}.woff2`)).catch(() => null)) ?? (await readFile(join(dir, `${v}.font`)).catch(() => null))
      if (bytes && isFontFile(bytes)) data[v] = bytes.toString('base64')
    }
    if (!data['400']) return null
    return { id, name: meta.name, family: cssFamily(meta.name, meta.category), category: meta.category, license: typeof meta.license === 'string' ? meta.license : '', variants: Object.keys(data), data, ...(meta.custom === true ? { custom: true } : {}) }
  } catch {
    return null
  }
}

async function downloadVariant(id: string, v: FontVariant): Promise<Buffer> {
  const res = await download(fontFileUrl(FONTS_CDN_URL, id, v), MAX_FONT_BYTES, 'font/woff2,*/*', 20_000)
  if (!isWoff2(res.bytes)) throw new NetworkError('unavailable', tm('net.fontInvalidFile', { variant: v }))
  return res.bytes
}

type FontsFailure = { ok: false; error: 'offline' | 'rate-limit' | 'unavailable'; detail: string }
const fontsFailure = (err: unknown): FontsFailure => {
  const e = err instanceof NetworkError ? err : new NetworkError('unavailable', String(err))
  console.error('[fonts]', e.kind, e.detail)
  return { ok: false, error: e.kind, detail: e.detail }
}

ipcMain.handle('fonts:catalog', async () => {
  try {
    return { ok: true as const, ...(await loadCatalog()) }
  } catch (err) {
    return fontsFailure(err)
  }
})

ipcMain.handle('fonts:installed', async (): Promise<InstalledFont[]> => {
  const ids = await readdir(fontsDir()).catch(() => [] as string[])
  const out: InstalledFont[] = []
  for (const id of ids) if (isSafeId(id)) {
    const f = await readInstalledFont(id)
    if (f) out.push(f)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
})

ipcMain.handle('fonts:install', async (_e, id: unknown) => {
  try {
    if (!isSafeId(id)) throw new NetworkError('unavailable', tm('net.fontInvalidId'))
    const font = (await loadCatalog()).fonts.find((f) => f.id === id)
    if (!font) throw new NetworkError('unavailable', tm('net.fontNotInCatalog'))
    const files = await Promise.all(font.variants.map(async (v) => [v, await downloadVariant(id, v).catch((e) => (v === '400' ? Promise.reject(e) : null))] as const))
    const dir = join(fontsDir(), id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'meta.json'), JSON.stringify({ id, name: font.name, category: font.category, license: font.license }), 'utf-8')
    for (const [v, bytes] of files) if (bytes) await writeFile(join(dir, `${v}.woff2`), bytes)
    const installed = await readInstalledFont(id)
    if (!installed) throw new NetworkError('unavailable', tm('net.fontNotSaved'))
    return { ok: true as const, font: installed }
  } catch (err) {
    return fontsFailure(err)
  }
})

/** Aperçu avant installation : la graisse normale seule, jamais enregistrée. */
ipcMain.handle('fonts:preview', async (_e, id: unknown) => {
  try {
    if (!isSafeId(id)) throw new NetworkError('unavailable', tm('net.fontInvalidId'))
    const font = (await loadCatalog()).fonts.find((f) => f.id === id)
    if (!font) throw new NetworkError('unavailable', tm('net.fontNotInCatalog'))
    return { ok: true as const, name: font.name, data: (await downloadVariant(id, '400')).toString('base64') }
  } catch (err) {
    return fontsFailure(err)
  }
})

/** Choix de fichiers de police à importer. Taille lue d'abord : un fichier trop gros n'est pas chargé en mémoire (l'interface le refusera). */
ipcMain.handle('fonts:pick-files', async (): Promise<Array<{ name: string; size: number; bytes: Uint8Array }>> => {
  let paths: string[]
  if (TEST_EXPORT_DIR) {
    // tests de bout en bout : les fichiers pick-font-* du dossier de test tiennent lieu de choix (aucun dialogue natif)
    paths = (await readdir(TEST_EXPORT_DIR)).filter((f) => f.startsWith('pick-font-')).sort().map((f) => join(TEST_EXPORT_DIR, f))
  } else {
    const res = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: tm('main.filter.fonts'), extensions: ['ttf', 'otf', 'woff', 'woff2'] }] })
    if (res.canceled) return []
    paths = res.filePaths
  }
  const out: Array<{ name: string; size: number; bytes: Uint8Array }> = []
  for (const p of paths.slice(0, 24)) {
    const size = (await stat(p).catch(() => null))?.size ?? 0
    out.push({ name: basename(p), size, bytes: size > 0 && size <= 2_000_000 ? new Uint8Array(await readFile(p)) : new Uint8Array(0) })
  }
  return out
})

/** Enregistre une famille importée (les fichiers sont gardés tels quels, une famille du même nom est remplacée). */
ipcMain.handle('fonts:save-custom', async (_e, id: unknown, name: unknown, category: unknown, variants: unknown) => {
  try {
    if (!isSafeId(id) || !id.startsWith(CUSTOM_PREFIX) || !isSafeFamilyName(name) || typeof category !== 'string' || !CATEGORY_LIST.includes(category)) throw new NetworkError('unavailable', tm('net.fontInvalid'))
    const files: Array<[string, Buffer]> = []
    for (const [v, b64] of Object.entries((variants && typeof variants === 'object' ? variants : {}) as Record<string, unknown>)) {
      if (!ALL_VARIANTS.includes(v as FontVariant) || typeof b64 !== 'string') continue
      const bytes = Buffer.from(b64, 'base64')
      if (bytes.length > MAX_FONT_BYTES || !isFontFile(bytes)) throw new NetworkError('unavailable', tm('net.fontInvalidFile', { variant: v }))
      files.push([v, bytes])
    }
    if (!files.some(([v]) => v === '400')) throw new NetworkError('unavailable', tm('net.normalRequired'))
    const dir = join(fontsDir(), id)
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'meta.json'), JSON.stringify({ id, name, category, license: 'Fichier personnel', custom: true }), 'utf-8')
    for (const [v, bytes] of files) await writeFile(join(dir, `${v}.font`), bytes)
    const font = await readInstalledFont(id)
    if (!font) throw new NetworkError('unavailable', tm('net.fontNotSaved'))
    return { ok: true as const, font }
  } catch (err) {
    return fontsFailure(err)
  }
})

ipcMain.handle('fonts:remove', async (_e, id: unknown) => {
  if (!isSafeId(id)) return false
  await rm(join(fontsDir(), id), { recursive: true, force: true })
  return true
})

/** Plein écran du mode présentation (inactif pendant les tests de bout en bout : l'animation système bloquerait le pilotage). */
ipcMain.handle('window:fullscreen', (e, on: unknown) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win || TEST_EXPORT_DIR) return false
  if (on === true) placePresentation(win)
  else leavePresentation(win)
  return win.isFullScreen()
})

// ───────────── Écran de l'orateur : une seconde fenêtre, synchronisée avec le mode présentation ─────────────
//
// Deux écrans : la présentation va sur l'écran qui n'est pas l'écran principal (en général le projecteur), l'écran de l'orateur sur
// l'écran principal ; le bouton « Échanger les écrans » les permute. Un seul écran : la présentation reste dans sa fenêtre (pas de
// plein écran, qui cacherait l'écran de l'orateur) et les deux fenêtres se côtoient.
let speakerWindow: BrowserWindow | null = null
let speakerState: SpeakerState | null = null
/** écran de la présentation quand l'écran de l'orateur est ouvert (permutable) */
let presentationDisplayId: number | null = null
/** position de la fenêtre principale avant son déplacement vers l'autre écran */
let boundsBeforePresentation: Electron.Rectangle | null = null
/** sorties du plein écran voulues par l'application (déplacement, écran de l'orateur) : l'interface n'y voit pas la fin de la présentation */
const fullscreenGuard = createFullscreenGuard()

const multiDisplay = (): boolean => screen.getAllDisplays().length > 1

function presentationDisplay(): Electron.Display | undefined {
  return screen.getAllDisplays().find((d) => d.id === presentationDisplayId)
}

/** Plein écran de la présentation, sur l'écran voulu quand l'écran de l'orateur est ouvert. */
function placePresentation(win: BrowserWindow): void {
  const target = speakerWindow && multiDisplay() ? presentationDisplay() : undefined
  if (speakerWindow && !multiDisplay()) {
    // un seul écran : pas de plein écran, l'écran de l'orateur resterait caché derrière (sortie voulue : la présentation continue)
    if (win.isFullScreen()) {
      fullscreenGuard.expectLeave()
      win.setFullScreen(false)
    }
    return
  }
  if (!target) {
    win.setFullScreen(true)
    return
  }
  const move = (): void => {
    boundsBeforePresentation ??= win.getBounds()
    win.setBounds(target.bounds)
    win.setFullScreen(true)
  }
  if (win.isFullScreen()) {
    // déjà en plein écran (sur un autre écran) : on en sort pour le déplacer
    fullscreenGuard.expectLeave()
    win.once('leave-full-screen', move)
    win.setFullScreen(false)
  } else move()
}

function leavePresentation(win: BrowserWindow): void {
  win.setFullScreen(false)
  const back = boundsBeforePresentation
  boundsBeforePresentation = null
  if (back) win.once('leave-full-screen', () => win.setBounds(back))
}

function closeSpeaker(): void {
  speakerWindow?.close()
}

ipcMain.handle('speaker:open', async (e, raw: unknown) => {
  const main = mainWindow
  const state = parseSpeakerState(raw)
  if (!main || e.sender !== main.webContents || !state || !state.doc) return null
  speakerState = state
  if (speakerWindow) {
    speakerWindow.focus()
    return { separateDisplay: multiDisplay() }
  }
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const multi = displays.length > 1
  presentationDisplayId = multi ? (displays.find((d) => d.id !== primary.id) ?? primary).id : null
  // un seul écran : la présentation sort du plein écran AVANT la création de l'autre fenêtre (sinon, sur macOS, elle apparaîtrait dans
  // l'espace plein écran qui disparaît)
  if (!multi && !TEST_EXPORT_DIR) await leaveFullscreenQuietly(main, fullscreenGuard)
  const area = multi ? primary.workArea : screen.getDisplayMatching(main.getBounds()).workArea
  const win = new BrowserWindow({
    x: area.x + (multi ? 0 : Math.round(area.width * 0.1)),
    y: area.y + (multi ? 0 : Math.round(area.height * 0.1)),
    width: multi ? area.width : Math.round(area.width * 0.8),
    height: multi ? area.height : Math.round(area.height * 0.8),
    minWidth: 640,
    minHeight: 420,
    title: tm('main.speaker.title'),
    backgroundColor: '#14151a',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), additionalArguments: FORCED_LANG ? [`--trame-lang=${FORCED_LANG}`] : [], contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  speakerWindow = win
  win.on('closed', () => {
    speakerWindow = null
    speakerState = null
    presentationDisplayId = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('speaker:closed')
    }
  })
  const url = process.env['ELECTRON_RENDERER_URL']
  if (url) await win.loadURL(`${url}#speaker`)
  else await win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'speaker' })
  // déjà en plein écran : la présentation change d'écran (deux écrans) ou quitte le plein écran (un seul)
  if (!TEST_EXPORT_DIR && main.isFullScreen()) placePresentation(main)
  return { separateDisplay: multi }
})

ipcMain.on('speaker:sync', (e, raw: unknown) => {
  const state = parseSpeakerState(raw)
  if (!state || !mainWindow || e.sender !== mainWindow.webContents) return
  speakerState = mergeSpeakerState(speakerState, state)
  speakerWindow?.webContents.send('speaker:state', { ...state, doc: null })
})

/** L'écran de l'orateur demande l'état courant au démarrage (document compris). */
ipcMain.handle('speaker:hello', (e) => (speakerWindow && e.sender === speakerWindow.webContents ? speakerState : null))

ipcMain.on('speaker:command', (e, raw: unknown) => {
  const cmd = parseSpeakerCommand(raw)
  if (!cmd || !speakerWindow || e.sender !== speakerWindow.webContents) return
  if (cmd.type === 'swap') {
    const displays = screen.getAllDisplays()
    const main = mainWindow
    if (displays.length < 2 || !main) return
    // la présentation passe à l'autre écran, l'écran de l'orateur prend celui qu'elle quitte
    const current = presentationDisplay() ?? displays[0]
    const next = displays.find((d) => d.id !== current.id) ?? current
    presentationDisplayId = next.id
    speakerWindow.setBounds(current.workArea)
    placePresentation(main)
    return
  }
  mainWindow?.webContents.send('speaker:command', cmd)
})

ipcMain.on('speaker:close', (e) => {
  if (mainWindow && e.sender === mainWindow.webContents) closeSpeaker()
})

ipcMain.handle('pdf:pick', () => pickImportFile('pdf', 'PDF'))
ipcMain.handle('pptx:pick', () => pickImportFile('pptx', 'PowerPoint'))
ipcMain.handle('csv:pick', () => pickImportFile('csv', tm('main.filter.csv')))

// Import d'un document texte (Word, Markdown, texte brut). Le fichier est lu ici. Un fichier Markdown peut citer des images voisines
// (`![](img/schema.png)`) : elles ne se lisent que dans le dossier du dernier fichier choisi et ses sous-dossiers (`resolveDocumentImage`),
// jamais ailleurs sur le disque, même si l'interface en demandait un autre chemin.
let documentDir: string | null = null
const DOCUMENT_EXTENSIONS = ['docx', 'md', 'markdown', 'txt']
ipcMain.handle('outline:pick', async (): Promise<{ name: string; ext: 'docx' | 'md' | 'txt'; bytes: Uint8Array } | null> => {
  let path: string | null = null
  if (TEST_EXPORT_DIR) {
    // tests de bout en bout : le fichier pick-import.docx, .md ou .txt du dossier de test tient lieu de choix
    for (const ext of ['docx', 'md', 'txt']) {
      const candidate = join(TEST_EXPORT_DIR, `pick-import.${ext}`)
      if (await stat(candidate).catch(() => null)) {
        path = candidate
        break
      }
    }
  } else {
    const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: tm('main.filter.documents'), extensions: DOCUMENT_EXTENSIONS }] })
    if (!res.canceled && res.filePaths[0]) path = res.filePaths[0]
  }
  if (!path) return null
  if ((await stat(path)).size > MAX_IMPORT_BYTES) {
    dialog.showErrorBox(tm('main.import.tooBig.title'), tm('main.import.tooBig'))
    return null
  }
  const raw = (path.split('.').pop() ?? '').toLowerCase()
  const ext = raw === 'docx' ? 'docx' : raw === 'txt' ? 'txt' : 'md'
  documentDir = dirname(path)
  return { name: basename(path).replace(/\.[^.]+$/, ''), ext, bytes: new Uint8Array(await readFile(path)) }
})

ipcMain.handle('outline:image', async (_e, ref: unknown): Promise<string | null> => {
  if (typeof ref !== 'string' || !documentDir) return null
  const found = resolveDocumentImage(documentDir, ref)
  if (!found) return null
  try {
    // un lien symbolique ne doit pas faire sortir du dossier du document
    const real = await realpath(found.path)
    const root = await realpath(documentDir)
    if (real !== root && !real.startsWith(root + sep)) return null
    if ((await stat(real)).size > MAX_DOCUMENT_IMAGE_BYTES) return null
    const mime = DOCUMENT_IMAGE_MIME[real.split('.').pop()?.toLowerCase() ?? ''] ?? found.mime
    return `data:${mime};base64,${(await readFile(real)).toString('base64')}`
  } catch {
    return null
  }
})

ipcMain.handle('image:pick', async () => {
  // tests de bout en bout : l'image « choisie » est le fichier pick-image.png du dossier de test (aucun dialogue natif)
  if (TEST_EXPORT_DIR) {
    const buf = await readFile(join(TEST_EXPORT_DIR, 'pick-image.png')).catch(() => null)
    return buf ? `data:image/png;base64,${buf.toString('base64')}` : null
  }
  const res = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: tm('main.filter.images'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
  })
  if (res.canceled || !res.filePaths[0]) return null
  const path = res.filePaths[0]
  const ext = path.split('.').pop()!.toLowerCase()
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
  const buf = await readFile(path)
  return `data:${mime};base64,${buf.toString('base64')}`
})


// Impression directe : la page HTML préparée par le renderer (une section par feuille) est imprimée par une fenêtre cachée, sans passer par un PDF enregistré.
/** `opened` : le PDF a été ouvert dans le lecteur du système, d'où l'on imprime (Linux sous Wayland, voir `print:html`). */
type PrintResult = { status: 'printed' } | { status: 'opened' } | { status: 'cancelled' } | { status: 'failed'; reason: string }
ipcMain.handle('print:html', async (_e, html: unknown, widthPx: unknown, heightPx: unknown, duplexMode: unknown): Promise<PrintResult> => {
  const geo = sheetGeometry(widthPx, heightPx)
  if (typeof html !== 'string' || html.length === 0 || html.length > 600_000_000 || !geo) return { status: 'failed', reason: 'invalid' }
  const duplex = isDuplex(duplexMode) ? duplexMode : 'simplex'
  const dir = await mkdtemp(join(tmpdir(), 'trame-print-'))
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  try {
    // la page ne reçoit que ses propres données : aucune navigation, aucune fenêtre
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (ev) => ev.preventDefault())
    const file = join(dir, 'print.html')
    await writeFile(file, html, 'utf-8')
    await win.loadFile(file)
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    if (TEST_EXPORT_DIR) {
      // tests de bout en bout : pas de boîte d'impression ; le PDF que le système imprimerait est écrit dans le dossier de test
      await writeFile(join(TEST_EXPORT_DIR, 'print-test.pdf'), await win.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true }))
      return { status: 'printed' }
    }
    // Linux sous Wayland : la boîte d'impression système (GTK) s'attache à une fenêtre cachée que Wayland refuse d'exporter (« exported surface
    // had an invalid role ») et l'application plante. On produit alors le PDF et on l'ouvre dans le lecteur du système (réglages
    // d'imprimante, recto-verso compris). Avec --ozone-platform=x11 (XWayland), la boîte d'impression directe fonctionne.
    if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland' && app.commandLine.getSwitchValue('ozone-platform') !== 'x11') {
      const pdf = join(tmpdir(), `trame-impression-${Date.now()}.pdf`)
      await writeFile(pdf, await win.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true }))
      const failure = await shell.openPath(pdf)
      return failure ? { status: 'failed', reason: failure } : { status: 'opened' }
    }
    return await new Promise<PrintResult>((resolve) => {
      win.webContents.print(
        { silent: false, printBackground: true, margins: { marginType: 'none' }, landscape: geo.landscape, pageSize: geo.portraitMicrons, duplexMode: duplex },
        (success, reason) => resolve(success ? { status: 'printed' } : /cancel/i.test(reason) ? { status: 'cancelled' } : { status: 'failed', reason })
      )
    })
  } catch (err) {
    return { status: 'failed', reason: err instanceof Error ? err.message : String(err) }
  } finally {
    win.destroy()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
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

// musique de fond d'une vidéo : le fichier choisi par la personne est lu et remis tel quel à l'interface (qui le décode)
ipcMain.handle('audio:pick', async (): Promise<AudioPick> => {
  // tests de bout en bout : le fichier « choisi » est pick-audio.wav du dossier de test (aucun dialogue natif)
  if (TEST_EXPORT_DIR) {
    const buf = await readFile(join(TEST_EXPORT_DIR, 'pick-audio.wav')).catch(() => null)
    return buf ? { name: 'pick-audio.wav', bytes: new Uint8Array(buf) } : null
  }
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: tm('main.filter.audio'), extensions: [...AUDIO_EXTENSIONS] }] })
  if (res.canceled || !res.filePaths[0]) return null
  const path = res.filePaths[0]
  if (!isAudioFile(path)) return { error: 'unreadable' }
  try {
    if ((await stat(path)).size > MAX_AUDIO_BYTES) return { error: 'tooBig' }
    return { name: basename(path), bytes: new Uint8Array(await readFile(path)) }
  } catch {
    return { error: 'unreadable' }
  }
})

// lien d'un élément cliqué en présentation : confié au navigateur du système, mais seulement une adresse web ou de courrier déjà normalisée
ipcMain.handle('link:open', async (_event, url: unknown): Promise<boolean> => {
  if (!isOpenableLink(url)) return false
  // tests de bout en bout : aucune fenêtre de navigateur, l'adresse « ouverte » est écrite dans opened-link.txt du dossier de test
  if (TEST_EXPORT_DIR) {
    await writeFile(join(TEST_EXPORT_DIR, 'opened-link.txt'), url)
    return true
  }
  try {
    await shell.openExternal(url)
    return true
  } catch {
    return false
  }
})

// micro (voix off) : sur macOS, état de l'autorisation du système, demandée la première fois ; ailleurs le navigateur gère la demande
ipcMain.handle('mic:access', async (): Promise<'granted' | 'denied'> => {
  if (TEST_EXPORT_DIR || process.platform !== 'darwin') return 'granted'
  const status = systemPreferences.getMediaAccessStatus('microphone')
  if (status === 'granted') return 'granted'
  if (status === 'not-determined') return (await systemPreferences.askForMediaAccess('microphone').catch(() => false)) ? 'granted' : 'denied'
  return 'denied'
})

// clip vidéo à placer dans une page : lu tel quel et remis à l'interface (qui en tire l'aperçu et le garde dans le document)
ipcMain.handle('video:pick', async (): Promise<VideoPick> => {
  // tests de bout en bout : le clip « choisi » est pick-video.mp4 du dossier de test (aucun dialogue natif)
  if (TEST_EXPORT_DIR) {
    const buf = await readFile(join(TEST_EXPORT_DIR, 'pick-video.mp4')).catch(() => null)
    return buf ? { name: 'pick-video.mp4', mime: 'video/mp4', bytes: new Uint8Array(buf) } : null
  }
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: tm('main.filter.video'), extensions: Object.keys(VIDEO_TYPES) }] })
  if (res.canceled || !res.filePaths[0]) return null
  const path = res.filePaths[0]
  const mime = videoMime(path)
  if (!mime || !isVideoFile(path)) return { error: 'unreadable' }
  try {
    if ((await stat(path)).size > MAX_CLIP_BYTES) return { error: 'tooBig' }
    return { name: basename(path), mime, bytes: new Uint8Array(await readFile(path)) }
  } catch {
    return { error: 'unreadable' }
  }
})

/** Octets d'un fichier de l'export : vidéo (.mp4, .webm) ou présentation web (.html), jusqu'à 2 Go ; le nom est celui proposé dans la boîte d'enregistrement. */
const MAX_BINARY_EXPORT = 2 * 1024 * 1024 * 1024
ipcMain.handle('export:save-bytes', async (_e, bytes: unknown, name: unknown) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_BINARY_EXPORT || typeof name !== 'string') return null
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext !== 'mp4' && ext !== 'webm' && ext !== 'html') return null
  if (TEST_EXPORT_DIR) {
    const path = join(TEST_EXPORT_DIR, basename(name))
    await writeFile(path, bytes)
    return path
  }
  const res = await dialog.showSaveDialog({ defaultPath: basename(name), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
  if (res.canceled || !res.filePath) return null
  await writeFile(res.filePath, bytes)
  return res.filePath
})

// Export vers un dossier : le renderer ne choisit jamais le dossier. Il en demande un (boîte système) et n'écrit ensuite que dans
// celui qui lui a été accordé, des fichiers images à nom simple (voir exportFolder.ts).
const grantedFolders = new Set<string>()

ipcMain.handle('export:folder-pick', async (e, names: unknown, suggestion: unknown) => {
  const files = (Array.isArray(names) ? names : []).map(safeExportName)
  if (files.length === 0 || files.some((f) => f === null)) return null
  let dir: string
  if (TEST_EXPORT_DIR) {
    // mode test (voir export:save) : un sous-dossier du dossier de test, sans boîte de dialogue
    dir = join(TEST_EXPORT_DIR, `dossier-${basename(String(suggestion || 'export'))}`)
    await mkdir(dir, { recursive: true })
  } else {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win!, { title: tm('main.export.folderTitle'), properties: ['openDirectory', 'createDirectory'], buttonLabel: tm('main.export.folderButton') })
    if (res.canceled || !res.filePaths[0]) return null
    dir = res.filePaths[0]
  }
  grantedFolders.add(dir)
  const existing: string[] = []
  for (const f of files as string[]) if (await stat(join(dir, f)).then(() => true, () => false)) existing.push(f)
  return { dir, existing }
})

ipcMain.handle('export:folder-write', async (_e, dir: unknown, name: unknown, dataUrl: unknown) => {
  const safe = safeExportName(name)
  if (typeof dir !== 'string' || !grantedFolders.has(dir) || !safe || typeof dataUrl !== 'string') return false
  const comma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || comma < 0) return false
  await writeFile(join(dir, safe), Buffer.from(dataUrl.slice(comma + 1), 'base64'))
  return true
})

// Images d'un publipostage : le renderer ne choisit jamais le dossier ; il en demande un (boîte système) puis lit, par leur nom,
// des fichiers images de CE dossier seulement (noms pris dans sa liste, jamais un chemin fourni par le renderer).
let mergeImageDir: string | null = null
let mergeImageFiles = new Set<string>()

ipcMain.handle('mergeimages:pick', async (e) => {
  let dir: string
  if (TEST_EXPORT_DIR) {
    // mode test : le sous-dossier « images » du dossier de test, sans boîte de dialogue
    dir = join(TEST_EXPORT_DIR, 'images')
    if (!(await stat(dir).then((s) => s.isDirectory(), () => false))) return null
  } else {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win!, { title: tm('main.mergeImages.title'), properties: ['openDirectory'], buttonLabel: tm('main.mergeImages.button') })
    if (res.canceled || !res.filePaths[0]) return null
    dir = res.filePaths[0]
  }
  const names = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((d) => d.isFile() && isMergeImageFile(d.name)).map((d) => d.name).slice(0, MAX_MERGE_IMAGE_FILES)
  mergeImageDir = dir
  mergeImageFiles = new Set(names)
  return { name: basename(dir), files: names }
})

ipcMain.handle('mergeimages:read', async (_e, names: unknown) => {
  const out: Record<string, string | null> = {}
  if (!mergeImageDir || !Array.isArray(names)) return out
  for (const n of names.slice(0, 40)) {
    if (typeof n !== 'string' || !mergeImageFiles.has(n)) continue
    const mime = mergeImageMime(n)
    const path = join(mergeImageDir, n)
    const size = await stat(path).then((s) => s.size, () => -1)
    out[n] = mime && size > 0 && size <= MAX_MERGE_IMAGE_BYTES ? `data:${mime};base64,${(await readFile(path)).toString('base64')}` : null
  }
  return out
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
    dialog.showErrorBox(tm('file.openFailed'), err instanceof Error ? err.message : String(err))
    return
  }
  await noteRecent(path)
  if (!mainWindow) createWindow() // application ouverte sans fenêtre (macOS) : on en crée une, le fichier attend le renderer
  const now = fileInbox.push({ path, json })
  if (now) mainWindow?.webContents.send('app:open-file', now)
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.focus()
}

ipcMain.handle('i18n:set', (_e, code: unknown) => {
  setMainLocale(code)
  applySpellSettings() // la langue « automatique » suit celle de l'application
})
// Le renderer écoute désormais : on lui remet le fichier reçu pendant le démarrage, s'il y en a un
// Réglages généraux (voir appSettings.ts) et document en cours à la fermeture, rouvert au lancement s'il existe encore.
const appSettingsFile = (): string => join(app.getPath('userData'), 'app-settings.json')
const lastDocumentFile = (): string => join(app.getPath('userData'), 'last-document.json')
let appSettings: AppSettings = { ...DEFAULT_APP_SETTINGS }
let lastDocument: string | null = null
/** Vrai une fois le démarrage du renderer réglé : avant, son document vide ne doit pas effacer le dernier document. */
let startupDone = false
const appSettingsLoaded = (async (): Promise<void> => {
  await app.whenReady()
  appSettings = parseAppSettings(await readFile(appSettingsFile(), 'utf-8').catch(() => null), TEST_EXPORT_DIR ? { reopenLast: false } : DEFAULT_APP_SETTINGS)
  lastDocument = parseLastDocument(await readFile(lastDocumentFile(), 'utf-8').catch(() => null))
})()

function noteLastDocument(path: string | null): void {
  if (!startupDone || path === lastDocument) return
  lastDocument = path
  void writeFile(lastDocumentFile(), JSON.stringify({ path }), 'utf-8').catch(() => {})
}

ipcMain.handle('settings:get', async () => {
  await appSettingsLoaded
  return appSettings
})
ipcMain.handle('settings:set', async (_e, raw: unknown) => {
  await appSettingsLoaded
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  appSettings = parseAppSettings({ reopenLast: o.reopenLast ?? appSettings.reopenLast })
  await writeFile(appSettingsFile(), JSON.stringify(appSettings), 'utf-8').catch(() => {})
  return appSettings
})

/** Le dernier document, lu pour être rouvert : il doit encore être dans la liste des projets récents (le renderer ne choisit pas les fichiers lus) et exister. */
async function readLastDocument(path: string): Promise<{ path: string; json: string } | null> {
  if (!(await loadRecents()).some((r) => r.path === path)) return null
  try {
    const json = await readFile(path, 'utf-8')
    await noteRecent(path)
    return { path, json }
  } catch {
    return null // disparu entre-temps : on démarre sur un document vide
  }
}

ipcMain.handle('app:renderer-ready', async () => {
  await appSettingsLoaded
  const waiting = fileInbox.onRendererReady()
  const target = lastDocumentToReopen(appSettings, lastDocument, waiting !== null)
  const reopened = target ? await readLastDocument(target) : null
  startupDone = true
  return waiting ?? reopened
})

registerAiHandlers()

// Windows et Linux : une seule instance (un double-clic sur un .trame ouvre le projet dans la fenêtre existante). macOS le fait déjà seul.
const gotLock = process.platform === 'darwin' || app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else if (process.platform !== 'darwin') {
  app.on('second-instance', (_e, argv) => {
    const files = projectFilesFromArgv(argv.slice(1))
    if (files.length) void openFromSystem(files[files.length - 1])
    else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// Mises à jour automatiques (voir updater.ts) : GitHub Releases du dépôt indiqué par le champ `repository` de package.json.
const updateSettingsFile = (): string => join(app.getPath('userData'), 'update-settings.json')
const updateRepo = (): { owner: string; repo: string } | null => {
  try {
    return parseRepository(JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf-8')).repository)
  } catch {
    return null
  }
}
let updater: ReturnType<typeof createUpdater> | null = null
const getUpdater = (): ReturnType<typeof createUpdater> => {
  updater ??= createUpdater({
    engine: TEST_EXPORT_DIR ? testUpdateEngine(TEST_EXPORT_DIR) : (autoUpdater as unknown as UpdateEngine),
    current: app.getVersion(),
    disabled: TEST_EXPORT_DIR ? null : !app.isPackaged ? 'dev' : updateRepo() ? null : 'unconfigured',
    // Linux : seule l'AppImage sait se remplacer elle-même ; une archive ou un paquet se met à jour à la main
    manual: !TEST_EXPORT_DIR && process.platform === 'linux' && !process.env.APPIMAGE,
    // tests de bout en bout : jamais de vérification automatique (le bandeau gênerait les autres scénarios)
    loadSettings: async () => (TEST_EXPORT_DIR ? { auto: false } : parseUpdateSettings(await readFile(updateSettingsFile(), 'utf-8').catch(() => ''))),
    saveSettings: (s) => writeFile(updateSettingsFile(), JSON.stringify(s), 'utf-8'),
    emit: (s) => mainWindow?.webContents.send('update:state', s),
    // l'interface a déjà proposé d'enregistrer : la fermeture pour installer ne doit pas reposer la question
    beforeInstall: () => closeGuard.setDirty(false)
  })
  return updater
}
ipcMain.handle('update:get', () => getUpdater().state())
ipcMain.handle('update:check', () => getUpdater().check())
ipcMain.handle('update:download', () => getUpdater().download())
ipcMain.handle('update:install', () => getUpdater().install())
ipcMain.handle('update:set-auto', (_e, auto: unknown) => getUpdater().setAuto(auto === true))
/** Version, système et architecture pour le formulaire de retours (voir `src/shared/feedback.ts`). */
ipcMain.handle('app:system-info', () => {
  const name = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux'
  return { version: app.getVersion(), system: `${name} ${process.getSystemVersion()}`, arch: process.arch, automated: Boolean(TEST_EXPORT_DIR) }
})
ipcMain.handle('update:open-page', async () => {
  const r = updateRepo()
  if (r) await shell.openExternal(releasesUrl(r.owner, r.repo))
  return !!r
})

// tests de bout en bout : un micro fictif (un signal de test) et aucune question d'autorisation, faute de micro ni de personne devant l'écran
if (TEST_EXPORT_DIR) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
}

app.whenReady().then(() => {
  if (!gotLock) return
  // le seul droit demandé par l'interface est le micro (voix off) : la caméra reste refusée ; le reste est accordé comme par défaut
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission === 'media') return callback(((details as { mediaTypes?: string[] }).mediaTypes ?? []).every((m) => m === 'audio'))
    callback(true)
  })
  registerCapture({ getWindow: () => mainWindow, testMode: Boolean(TEST_EXPORT_DIR) })
  initMainLocale([...app.getPreferredSystemLanguages(), app.getLocale()], FORCED_LANG)
  void initSpellcheck().catch(() => {})
  createWindow()
  // vérification au lancement, après le démarrage (pas avant que la fenêtre soit prête)
  setTimeout(() => void getUpdater().init(), TEST_EXPORT_DIR ? 500 : 8000)
  // projet donné en argument au lancement (Windows, Linux)
  if (process.platform !== 'darwin') {
    const files = projectFilesFromArgv(process.argv.slice(app.isPackaged ? 1 : 2))
    if (files.length) void openFromSystem(files[files.length - 1])
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
