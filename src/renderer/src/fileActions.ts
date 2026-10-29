import { fileSafeName } from '@/docName'
import { embedFonts } from '@/fontEmbed'
import { extraFonts } from '@/fonts'
import { pruneSources } from '@/pdfSources'
import { t } from '@/i18n'
import { parseDocument, useEditor } from '@/store/editor'

/** Ce que l'utilisateur s'apprête à faire (le processus principal traduit la question, voir `unsaved.action.*`). */
export type UnsavedAction = 'close' | 'new' | 'open' | 'importPdf' | 'importPptx' | 'template'

/** Enregistre le document. `saveAs` force le choix d'un nouvel emplacement. Retourne false si annulé ou en échec. */
export async function saveProject(saveAs = false): Promise<boolean> {
  const { doc, filePath, markSaved } = useEditor.getState()
  const path = await window.trame.saveProject(JSON.stringify(embedFonts(pruneSources(doc), extraFonts())), saveAs ? undefined : filePath, fileSafeName(doc.name))
  if (!path) return false
  markSaved(path)
  return true
}

/**
 * À appeler avant toute action qui remplace ou ferme le document.
 * Sans modifications : true. Sinon demande Enregistrer / Ne pas enregistrer / Annuler
 * et retourne true seulement si l'action peut se poursuivre.
 */
export async function confirmUnsaved(action: UnsavedAction): Promise<boolean> {
  const { dirty, doc } = useEditor.getState()
  if (!dirty) return true
  const choice = await window.trame.askUnsaved(doc.name, action)
  if (choice === 'cancel') return false
  if (choice === 'discard') return true
  return saveProject()
}

export async function newProject(): Promise<void> {
  if (await confirmUnsaved('new')) useEditor.getState().newDocument()
}

/** Valide un fichier lu, demande de sauvegarder le document courant si besoin, puis le charge. */
export async function openFile(res: { path: string; json: string }): Promise<void> {
  let doc
  try {
    doc = parseDocument(res.json)
  } catch (err) {
    await window.trame.showError(t('file.openFailed'), err instanceof Error ? err.message : String(err))
    return
  }
  if (await confirmUnsaved('open')) useEditor.getState().loadDocument(doc, res.path)
}

export async function openProject(): Promise<void> {
  // on choisit le fichier d'abord : annuler le sélecteur ne doit pas poser de question
  const res = await window.trame.openProject()
  if (res) await openFile(res)
}

/** Ouvre un projet récent ; s'il a disparu, le signale et le retire de la liste. */
export async function openRecent(path: string): Promise<void> {
  const res = await window.trame.openPath(path)
  if (!res) {
    await window.trame.showError(t('file.notFound.title'), t('file.notFound', { path }))
    await window.trame.removeRecent(path)
    return
  }
  await openFile(res)
}
