import { contextBridge, ipcRenderer } from 'electron'

const api = {
  saveProject: (json: string, path?: string): Promise<string | null> =>
    ipcRenderer.invoke('project:save', json, path),
  openProject: (): Promise<{ path: string; json: string } | null> =>
    ipcRenderer.invoke('project:open'),
  pickImage: (): Promise<string | null> => ipcRenderer.invoke('image:pick'),
  saveExport: (dataUrl: string, name: string): Promise<string | null> =>
    ipcRenderer.invoke('export:save', dataUrl, name)
}

contextBridge.exposeInMainWorld('trame', api)

export type TrameApi = typeof api
