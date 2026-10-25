import type { UserTemplateMeta } from '../../preload'
import { confirmUnsaved } from '@/fileActions'
import { renderPage } from '@/exportPages'
import { parseDocument, useEditor } from '@/store/editor'
import { cloneWithNewIds } from '@/templates'

const THUMBNAIL_SIZE = 320

/** Enregistre le document courant (toutes ses pages) comme modèle personnel. */
export async function saveAsTemplate(name: string): Promise<UserTemplateMeta | null> {
  const { doc } = useEditor.getState()
  const thumbnail = await renderPage(doc, doc.pages[0], 'image/jpeg', THUMBNAIL_SIZE)
  return window.trame.saveUserTemplate(
    { name, width: doc.width, height: doc.height, pageCount: doc.pages.length, thumbnail },
    JSON.stringify(doc)
  )
}

/** Crée un nouveau document à partir d'un modèle personnel. Retourne false si introuvable ou annulé. */
export async function applyUserTemplate(meta: UserTemplateMeta): Promise<boolean> {
  const json = await window.trame.loadUserTemplate(meta.id)
  let doc
  try {
    if (!json) throw new Error(`Le modèle « ${meta.name} » est introuvable sur le disque.`)
    doc = parseDocument(json)
  } catch (err) {
    await window.trame.showError('Modèle inutilisable', err instanceof Error ? err.message : String(err))
    return false
  }
  if (!(await confirmUnsaved('remplacer ce design par un modèle'))) return false
  useEditor.getState().loadDocument({ ...cloneWithNewIds(doc), name: meta.name })
  return true
}

export async function deleteUserTemplate(meta: UserTemplateMeta): Promise<boolean> {
  const ok = await window.trame.confirm(
    `Supprimer le modèle « ${meta.name} » ?`,
    'Cette action est définitive. Les designs déjà créés à partir de ce modèle ne sont pas affectés.',
    'Supprimer'
  )
  if (ok) await window.trame.deleteUserTemplate(meta.id)
  return ok
}
