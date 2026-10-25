import { parseDocument, useEditor } from '@/store/editor'

/** Enregistre le document. `saveAs` force le choix d'un nouvel emplacement. Retourne false si annulé ou en échec. */
export async function saveProject(saveAs = false): Promise<boolean> {
  const { doc, filePath, markSaved } = useEditor.getState()
  const path = await window.trame.saveProject(JSON.stringify(doc), saveAs ? undefined : filePath, doc.name)
  if (!path) return false
  markSaved(path)
  return true
}

/**
 * À appeler avant toute action qui remplace ou ferme le document.
 * Sans modifications : true. Sinon demande Enregistrer / Ne pas enregistrer / Annuler
 * et retourne true seulement si l'action peut se poursuivre.
 */
export async function confirmUnsaved(action: string): Promise<boolean> {
  const { dirty, doc } = useEditor.getState()
  if (!dirty) return true
  const choice = await window.trame.askUnsaved(doc.name, action)
  if (choice === 'cancel') return false
  if (choice === 'discard') return true
  return saveProject()
}

export async function newProject(): Promise<void> {
  if (await confirmUnsaved('créer un nouveau projet')) useEditor.getState().newDocument()
}

export async function openProject(): Promise<void> {
  // on choisit le fichier d'abord : annuler le sélecteur ne doit pas poser de question
  const res = await window.trame.openProject()
  if (!res) return
  let doc
  try {
    doc = parseDocument(res.json)
  } catch (err) {
    await window.trame.showError('Ouverture impossible', err instanceof Error ? err.message : String(err))
    return
  }
  if (await confirmUnsaved('ouvrir un autre projet')) useEditor.getState().loadDocument(doc, res.path)
}
