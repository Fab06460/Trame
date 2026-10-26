import type { UserTemplateMeta } from '../../preload'
import { confirmUnsaved } from '@/fileActions'
import { renderPage } from '@/exportPages'
import { parseDocument, useEditor } from '@/store/editor'
import { useTemplates } from '@/store/templates'
import { TEMPLATES, cloneWithNewIds, instantiate } from '@/templates'
import type { TrameDocument } from '@/types'

const THUMBNAIL_SIZE = 320

async function metaOf(doc: TrameDocument, name: string, basedOn?: string): Promise<Omit<UserTemplateMeta, 'id' | 'createdAt'>> {
  const thumbnail = await renderPage(doc, doc.pages[0], 'image/jpeg', THUMBNAIL_SIZE)
  return { name, width: doc.width, height: doc.height, pageCount: doc.pages.length, thumbnail, ...(basedOn ? { basedOn } : {}) }
}

/**
 * Enregistre le document courant (toutes ses pages) comme modèle personnel.
 * `replace` : remplace le modèle existant (même identifiant) au lieu d'en créer un ; `basedOn` : identifiant du modèle intégré
 * que cette version remplace (le modèle d'origine est alors masqué, et ce modèle peut être supprimé pour le rétablir).
 */
export async function saveAsTemplate(name: string, opts: { replaceId?: string; basedOn?: string } = {}): Promise<UserTemplateMeta | null> {
  const { doc } = useEditor.getState()
  const saved = await window.trame.saveUserTemplate(await metaOf(doc, name, opts.basedOn), JSON.stringify(doc), opts.replaceId)
  if (saved) {
    // la session d'édition continue sur le modèle qui vient d'être enregistré
    useEditor.getState().setTemplateOrigin({ kind: 'user', id: saved.id, name: saved.name })
    await useTemplates.getState().refresh()
  }
  return saved
}

/** Crée un nouveau document à partir d'un modèle intégré. */
export async function applyBuiltinTemplate(id: string): Promise<boolean> {
  const t = TEMPLATES.find((x) => x.id === id)
  if (!t || !(await confirmUnsaved('remplacer ce design par un modèle'))) return false
  const { loadDocument, setTemplateOrigin } = useEditor.getState()
  loadDocument(instantiate(t))
  setTemplateOrigin({ kind: 'builtin', id: t.id, name: t.name })
  return true
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
  const { loadDocument, setTemplateOrigin } = useEditor.getState()
  loadDocument({ ...cloneWithNewIds(doc), name: meta.name })
  setTemplateOrigin({ kind: 'user', id: meta.id, name: meta.name })
  return true
}

export async function renameUserTemplate(meta: UserTemplateMeta, name: string): Promise<void> {
  if (name.trim() && name.trim() !== meta.name) await window.trame.renameUserTemplate(meta.id, name)
  await useTemplates.getState().refresh()
}

/**
 * Renommer un modèle intégré : il est dans le code, donc on enregistre **votre version** (même contenu, nouveau nom), qui prend
 * sa place. Le modèle d'origine reste rétablissable en supprimant cette version.
 */
export async function renameBuiltinTemplate(id: string, name: string): Promise<void> {
  const t = TEMPLATES.find((x) => x.id === id)
  if (!t || !name.trim()) return
  const doc = { ...instantiate(t), name: name.trim() }
  await window.trame.saveUserTemplate(await metaOf(doc, name.trim(), t.id), JSON.stringify(doc))
  await useTemplates.getState().refresh()
}

/** « Supprimer » un modèle intégré : il est masqué (restaurable), jamais perdu. */
export async function hideBuiltinTemplate(id: string): Promise<boolean> {
  const t = TEMPLATES.find((x) => x.id === id)
  const ok = await window.trame.confirm(
    `Masquer le modèle « ${t?.name ?? id} » ?`,
    'Il disparaît de la liste mais n\'est pas perdu : « Restaurer les modèles masqués » le fait réapparaître. Les designs déjà créés ne sont pas affectés.',
    'Masquer'
  )
  if (ok) {
    await window.trame.hideBuiltinTemplate(id)
    await useTemplates.getState().refresh()
  }
  return ok
}

export async function restoreHiddenTemplates(): Promise<void> {
  await window.trame.unhideAllTemplates()
  await useTemplates.getState().refresh()
}

/** Supprime un modèle personnel. Pour une version personnalisée d'un modèle intégré, cela **rétablit l'original**. */
export async function deleteUserTemplate(meta: UserTemplateMeta): Promise<boolean> {
  const builtin = meta.basedOn ? TEMPLATES.find((t) => t.id === meta.basedOn) : undefined
  const ok = await window.trame.confirm(
    builtin ? `Rétablir le modèle d'origine « ${builtin.name} » ?` : `Supprimer le modèle « ${meta.name} » ?`,
    builtin
      ? 'Votre version personnalisée sera supprimée et le modèle d\'origine reviendra dans la liste. Cette action est définitive.'
      : 'Cette action est définitive. Les designs déjà créés à partir de ce modèle ne sont pas affectés.',
    builtin ? 'Rétablir' : 'Supprimer'
  )
  if (ok) {
    await window.trame.deleteUserTemplate(meta.id)
    // si le document ouvert venait de ce modèle, il n'y a plus rien à remplacer
    const origin = useEditor.getState().templateOrigin
    if (origin?.kind === 'user' && origin.id === meta.id) useEditor.getState().setTemplateOrigin(null)
    await useTemplates.getState().refresh()
  }
  return ok
}
