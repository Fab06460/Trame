import { contextBridge, ipcRenderer } from 'electron'
import type { SpeakerCommand, SpeakerState } from '../main/speakerProtocol'
import type { AiGenerateResult, AiProviderId, AiSize, AiStatus } from '../shared/ai'

export interface RecentProject {
  path: string
  name: string
  /** dossier, avec le répertoire personnel abrégé en ~ */
  dir: string
  /** date de modification en ms, ou null si le fichier n'existe plus */
  modified: number | null
}

export interface UserTemplateMeta {
  id: string
  name: string
  createdAt: number
  width: number
  height: number
  pageCount: number
  /** data URL de la première page */
  thumbnail: string
  /** identifiant du modèle intégré que celui-ci remplace (version personnalisée) */
  basedOn?: string
}

const api = {
  /** Langue imposée au lancement (variable `TRAME_LANG`, utilisée par les tests) ; sinon undefined. */
  forcedLocale: process.argv.find((a) => a.startsWith('--trame-lang='))?.slice('--trame-lang='.length),
  /** Informe le processus principal de la langue choisie (boîtes de dialogue, erreurs). */
  setLocale: (code: string): Promise<void> => ipcRenderer.invoke('i18n:set', code),
  /** Sans `path`, ouvre « Enregistrer sous » (proposant `name`). Retourne le chemin, ou null si annulé/échec. */
  saveProject: (json: string, path?: string, name?: string): Promise<string | null> =>
    ipcRenderer.invoke('project:save', json, path, name),
  openProject: (): Promise<{ path: string; json: string } | null> =>
    ipcRenderer.invoke('project:open'),
  pickPdf: (): Promise<{ name: string; bytes: Uint8Array } | null> => ipcRenderer.invoke('pdf:pick'),
  /** Recherche de photos libres (en ligne, via le processus principal). */
  searchPhotos: (query: string, page: number, source: PhotoSourceChoice = 'auto'): Promise<PhotoSearchResult> => ipcRenderer.invoke('photos:search', query, page, source),
  /** Télécharge la photo choisie (par son identifiant dans la dernière recherche). */
  importPhoto: (id: string): Promise<{ ok: true; dataUrl: string; credit: string; title: string } | { ok: false; error: PhotoError; detail?: string }> => ipcRenderer.invoke('photos:import', id),
  /** Polices en ligne (catalogue Fontsource), installées dans le dossier de données de l'application. */
  fontCatalog: (): Promise<{ ok: true; fonts: CatalogFont[]; stale: boolean } | FontsFailure> => ipcRenderer.invoke('fonts:catalog'),
  installedFonts: (): Promise<InstalledFont[]> => ipcRenderer.invoke('fonts:installed'),
  installFont: (id: string): Promise<{ ok: true; font: InstalledFont } | FontsFailure> => ipcRenderer.invoke('fonts:install', id),
  previewFont: (id: string): Promise<{ ok: true; name: string; data: string } | FontsFailure> => ipcRenderer.invoke('fonts:preview', id),
  removeFont: (id: string): Promise<boolean> => ipcRenderer.invoke('fonts:remove', id),
  /** Import de fichiers de police personnels (TTF, OTF, WOFF, WOFF2). */
  pickFontFiles: (): Promise<Array<{ name: string; size: number; bytes: Uint8Array }>> => ipcRenderer.invoke('fonts:pick-files'),
  saveCustomFont: (id: string, name: string, category: string, variants: Record<string, string>): Promise<{ ok: true; font: InstalledFont } | FontsFailure> => ipcRenderer.invoke('fonts:save-custom', id, name, category, variants),
  pickPptx: (): Promise<{ name: string; bytes: Uint8Array } | null> => ipcRenderer.invoke('pptx:pick'),
  pickImage: (): Promise<string | null> => ipcRenderer.invoke('image:pick'),
  saveExport: (dataUrl: string, name: string): Promise<string | null> =>
    ipcRenderer.invoke('export:save', dataUrl, name),
  /** Export vers un dossier : choix du dossier (null si annulé ; `existing` : fichiers qui seraient remplacés), puis écriture fichier par fichier. */
  pickExportFolder: (names: string[], suggestion: string): Promise<{ dir: string; existing: string[] } | null> => ipcRenderer.invoke('export:folder-pick', names, suggestion),
  writeExportFile: (dir: string, name: string, dataUrl: string): Promise<boolean> => ipcRenderer.invoke('export:folder-write', dir, name, dataUrl),
  /** Kit de marque (JSON brut, à valider côté interface) ; null s'il n'existe pas encore. */
  loadBrandKit: (): Promise<string | null> => ipcRenderer.invoke('brand:load'),
  saveBrandKit: (json: string): Promise<boolean> => ipcRenderer.invoke('brand:save', json),
  listRecents: (): Promise<RecentProject[]> => ipcRenderer.invoke('recent:list'),
  removeRecent: (path: string): Promise<void> => ipcRenderer.invoke('recent:remove', path),
  clearRecents: (): Promise<void> => ipcRenderer.invoke('recent:clear'),
  /** Ouvre un projet de la liste des récents ; null s'il est introuvable ou n'en fait pas partie. */
  openPath: (path: string): Promise<{ path: string; json: string } | null> => ipcRenderer.invoke('project:open-path', path),
  listUserTemplates: (): Promise<UserTemplateMeta[]> => ipcRenderer.invoke('templates:list'),
  /** Enregistre un modèle ; retourne ses métadonnées, ou null en cas d'échec (erreur affichée). */
  saveUserTemplate: (
    meta: Omit<UserTemplateMeta, 'id' | 'createdAt'>,
    json: string,
    /** si fourni, remplace le contenu de ce modèle au lieu d'en créer un nouveau */
    replaceId?: string
  ): Promise<UserTemplateMeta | null> => ipcRenderer.invoke('templates:save', meta, json, replaceId),
  renameUserTemplate: (id: string, name: string): Promise<UserTemplateMeta | null> => ipcRenderer.invoke('templates:rename', id, name),
  /** Modèles intégrés masqués par l'utilisateur. */
  listHiddenTemplates: (): Promise<string[]> => ipcRenderer.invoke('templates:hidden'),
  hideBuiltinTemplate: (id: string): Promise<void> => ipcRenderer.invoke('templates:hide', id),
  unhideAllTemplates: (): Promise<void> => ipcRenderer.invoke('templates:unhide-all'),
  loadUserTemplate: (id: string): Promise<string | null> => ipcRenderer.invoke('templates:load', id),
  deleteUserTemplate: (id: string): Promise<void> => ipcRenderer.invoke('templates:delete', id),
  /** Boîte de confirmation native ; true si l'utilisateur choisit `confirmLabel`. */
  confirm: (message: string, detail: string, confirmLabel: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirm', message, detail, confirmLabel),
  /** Fichier ouvert depuis le système (Finder, Dock) pendant que l'application tourne. */
  onOpenFile: (cb: (file: { path: string; json: string }) => void): (() => void) => {
    const listener = (_e: unknown, file: { path: string; json: string }): void => cb(file)
    ipcRenderer.on('app:open-file', listener)
    return () => ipcRenderer.removeListener('app:open-file', listener)
  },
  /** À appeler une fois l'interface prête : retourne le fichier ouvert par le système pendant le démarrage. */
  // ── Images générées par un service en ligne (voir main/aiIpc.ts) : les identifiants ne reviennent jamais ici ──
  aiStatus: (): Promise<AiStatus> => ipcRenderer.invoke('ai:status'),
  aiSave: (provider: AiProviderId, values: Record<string, string>): Promise<{ ok: true } | { ok: false; field: string }> => ipcRenderer.invoke('ai:save', provider, values),
  aiForget: (provider: AiProviderId): Promise<void> => ipcRenderer.invoke('ai:forget', provider),
  aiGenerate: (provider: AiProviderId, prompt: string, size: AiSize, requestId: string): Promise<AiGenerateResult> => ipcRenderer.invoke('ai:generate', provider, prompt, size, requestId),
  aiCancel: (requestId: string): Promise<void> => ipcRenderer.invoke('ai:cancel', requestId),
  rendererReady: (): Promise<{ path: string; json: string } | null> => ipcRenderer.invoke('app:renderer-ready'),
  writeClipboardElements: (json: string): Promise<void> => ipcRenderer.invoke('clipboard:write-elements', json),
  /** Contenu le plus récent du presse-papiers : éléments Trame, image, ou texte. */
  readClipboard: (): Promise<
    { kind: 'elements'; json: string } | { kind: 'image'; dataUrl: string } | { kind: 'text'; text: string } | null
  > => ipcRenderer.invoke('clipboard:read'),
  askUnsaved: (name: string, action: 'close' | 'new' | 'open' | 'importPdf' | 'importPptx' | 'template'): Promise<'save' | 'discard' | 'cancel'> =>
    ipcRenderer.invoke('dialog:unsaved', name, action),
  /** Boîte d'information native (un bouton OK). */
  showInfo: (message: string, detail: string): Promise<void> => ipcRenderer.invoke('dialog:info', message, detail),
  showError: (title: string, message: string): Promise<void> => ipcRenderer.invoke('dialog:error', title, message),
  /** Informe le processus principal de l'état du document (fermeture, titre macOS). */
  setState: (state: { dirty: boolean; path?: string }): void => ipcRenderer.send('app:state', state),
  /** Appelé quand l'utilisateur tente de fermer la fenêtre avec des modifications non enregistrées. */
  onBeforeClose: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('app:before-close', listener)
    return () => ipcRenderer.removeListener('app:before-close', listener)
  },
  /** Plein écran (mode présentation). */
  setFullScreen: (on: boolean): Promise<boolean> => ipcRenderer.invoke('window:fullscreen', on),
  /** Appelé quand la fenêtre quitte le plein écran (y compris par le bouton du système). */
  onLeaveFullScreen: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('window:left-fullscreen', listener)
    return () => ipcRenderer.removeListener('window:left-fullscreen', listener)
  },
  // ── Écran de l'orateur (voir main/speakerProtocol.ts) ──
  /** Fenêtre principale : ouvre l'écran de l'orateur ; null si refusé. */
  speakerOpen: (state: SpeakerState): Promise<{ separateDisplay: boolean } | null> => ipcRenderer.invoke('speaker:open', state),
  speakerSync: (state: SpeakerState): void => ipcRenderer.send('speaker:sync', state),
  speakerClose: (): void => ipcRenderer.send('speaker:close'),
  onSpeakerCommand: (cb: (cmd: SpeakerCommand) => void): (() => void) => {
    const listener = (_e: unknown, cmd: SpeakerCommand): void => cb(cmd)
    ipcRenderer.on('speaker:command', listener)
    return () => ipcRenderer.removeListener('speaker:command', listener)
  },
  onSpeakerClosed: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('speaker:closed', listener)
    return () => ipcRenderer.removeListener('speaker:closed', listener)
  },
  /** Écran de l'orateur : état courant au démarrage, mises à jour, commandes vers la présentation. */
  speakerHello: (): Promise<SpeakerState | null> => ipcRenderer.invoke('speaker:hello'),
  onSpeakerState: (cb: (state: SpeakerState) => void): (() => void) => {
    const listener = (_e: unknown, state: SpeakerState): void => cb(state)
    ipcRenderer.on('speaker:state', listener)
    return () => ipcRenderer.removeListener('speaker:state', listener)
  },
  sendSpeakerCommand: (cmd: SpeakerCommand): void => ipcRenderer.send('speaker:command', cmd),
  confirmClose: (): void => ipcRenderer.send('app:close-confirmed')
}

contextBridge.exposeInMainWorld('trame', api)

export interface CatalogFont {
  id: string
  name: string
  category: string
  license: string
  variants: string[]
}
export interface InstalledFont {
  id: string
  name: string
  /** famille CSS stockée dans les éléments (`"Nom", serif`) */
  family: string
  category: string
  license: string
  /** `400`, `700`, `400-italic`, `700-italic` (celles qui ont été téléchargées) */
  variants: string[]
  /** fichiers de police (WOFF2 pour le catalogue ; TTF, OTF, WOFF ou WOFF2 pour une police importée) en base64, par variante */
  data: Record<string, string>
  /** police importée depuis un fichier de l'utilisateur */
  custom?: boolean
}
export type FontsFailure = { ok: false; error: 'offline' | 'rate-limit' | 'unavailable'; detail: string }

export type PhotoSourceChoice = 'auto' | 'openverse' | 'commons'
export type PhotoError = 'offline' | 'rate-limit' | 'unavailable'
export interface PhotoView {
  id: string
  title: string
  creator: string
  license: string
  credit: string
  width: number
  height: number
  /** miniature (data URL) */
  thumb: string
}
export type PhotoSearchResult = { ok: true; photos: PhotoView[]; page: number; pageCount: number; source: 'openverse' | 'commons'; fallback: boolean } | { ok: false; error: PhotoError; detail?: string }

export type TrameApi = typeof api
