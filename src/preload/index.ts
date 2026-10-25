import { contextBridge, ipcRenderer } from 'electron'

export interface RecentProject {
  path: string
  name: string
  /** dossier, avec le répertoire personnel abrégé en ~ */
  dir: string
  /** date de modification en ms, ou null si le fichier n'existe plus */
  modified: number | null
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
  writeClipboardElements: (json: string): Promise<void> => ipcRenderer.invoke('clipboard:write-elements', json),
  /** Contenu le plus récent du presse-papiers : éléments Trame, image, ou texte. */
  readClipboard: (): Promise<
    { kind: 'elements'; json: string } | { kind: 'image'; dataUrl: string } | { kind: 'text'; text: string } | null
  > => ipcRenderer.invoke('clipboard:read'),
  askUnsaved: (name: string, action: string): Promise<'save' | 'discard' | 'cancel'> =>
    ipcRenderer.invoke('dialog:unsaved', name, action),
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
