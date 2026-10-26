import { contextBridge, ipcRenderer } from 'electron'

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
  /** Sans `path`, ouvre « Enregistrer sous » (proposant `name`). Retourne le chemin, ou null si annulé/échec. */
  saveProject: (json: string, path?: string, name?: string): Promise<string | null> =>
    ipcRenderer.invoke('project:save', json, path, name),
  openProject: (): Promise<{ path: string; json: string } | null> =>
    ipcRenderer.invoke('project:open'),
  pickImage: (): Promise<string | null> => ipcRenderer.invoke('image:pick'),
  saveExport: (dataUrl: string, name: string): Promise<string | null> =>
    ipcRenderer.invoke('export:save', dataUrl, name),
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
  rendererReady: (): Promise<{ path: string; json: string } | null> => ipcRenderer.invoke('app:renderer-ready'),
  writeClipboardElements: (json: string): Promise<void> => ipcRenderer.invoke('clipboard:write-elements', json),
  /** Contenu le plus récent du presse-papiers : éléments Trame, image, ou texte. */
  readClipboard: (): Promise<
    { kind: 'elements'; json: string } | { kind: 'image'; dataUrl: string } | { kind: 'text'; text: string } | null
  > => ipcRenderer.invoke('clipboard:read'),
  askUnsaved: (name: string, action: string): Promise<'save' | 'discard' | 'cancel'> =>
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
  confirmClose: (): void => ipcRenderer.send('app:close-confirmed')
}

contextBridge.exposeInMainWorld('trame', api)

export type TrameApi = typeof api
