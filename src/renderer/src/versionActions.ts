import { embedFonts } from '@/fontEmbed'
import { extraFonts } from '@/fonts'
import { pruneSources } from '@/pdfSources'
import { cleanDocName } from '@/docName'
import { confirmUnsaved, saveProject } from '@/fileActions'
import { t } from '@/i18n'
import { parseDocument, useEditor } from '@/store/editor'
import { formatDateTime } from '@/formatDate'
import type { TrameDocument } from '@/types'

/** Lit une version gardée (validée comme n'importe quel fichier) ; null si elle n'existe plus ou est illisible. */
export async function readVersionDocument(path: string, id: string): Promise<TrameDocument | null> {
  const json = await window.trame.readVersion(path, id)
  if (!json) return null
  try {
    return parseDocument(json)
  } catch {
    return null
  }
}

/** Garde l'état actuel comme version nommée. Un document jamais enregistré doit d'abord l'être (l'historique est celui d'un fichier). */
export async function saveNamedVersion(label: string): Promise<boolean> {
  const { doc, filePath } = useEditor.getState()
  let path = filePath
  if (!path) {
    if (!(await saveProject())) return false
    path = useEditor.getState().filePath
    if (!path) return false
  }
  const json = JSON.stringify(embedFonts(pruneSources(doc), extraFonts()))
  return (await window.trame.snapshotVersion(path, json, label)) !== null
}

/** Revient à une version : le contenu actuel est remplacé en un cran d'historique (annulable), le fichier reste le même. */
export function restoreVersion(doc: TrameDocument): void {
  useEditor.getState().replaceDocument(doc)
}

/** Ouvre une version comme document à part, sans fichier : l'original n'est pas touché. */
export async function openVersionAsCopy(doc: TrameDocument, at: number): Promise<boolean> {
  if (!(await confirmUnsaved('open'))) return false
  const name = cleanDocName(t('versions.copyName', { name: doc.name, date: formatDateTime(at) }))
  useEditor.getState().loadDocument({ ...doc, name }, undefined)
  // sans fichier : la copie est « modifiée » d'emblée, pour que la fermer demande de l'enregistrer
  useEditor.setState({ dirty: true })
  return true
}
