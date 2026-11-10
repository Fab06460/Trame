import { confirmUnsaved } from '@/fileActions'
import { useOutlineImport } from '@/store/outlineImport'
import { useEditor } from '@/store/editor'
import { t } from '@/i18n'
import { parseDocx } from './docx'
import { decodeText, measureInBrowser, resolveOutlineImages } from './images'
import { parseMarkdown } from './markdown'
import { outlineToDocument, type ImportOptions } from './layout'
import type { Outline } from './outline'

/** Choisit un fichier Word, Markdown ou texte, le lit, puis ouvre la fenêtre d'options (rien n'est remplacé avant d'avoir confirmé). */
export async function importDocumentFile(): Promise<void> {
  const picked = await window.trame.pickDocument()
  if (!picked) return // annuler le sélecteur ne pose aucune question
  try {
    let outline: Outline
    if (picked.ext === 'docx') outline = await parseDocx(picked.bytes)
    else {
      outline = parseMarkdown(decodeText(picked.bytes), { plain: picked.ext === 'txt' })
      outline = await resolveOutlineImages(outline, { read: (ref) => window.trame.readDocumentImage(ref), measure: measureInBrowser })
    }
    useOutlineImport.getState().open({ outline, name: picked.name })
  } catch (err) {
    await window.trame.showError(t('imp.failed'), t('outlineImport.failed', { error: err instanceof Error ? err.message : String(err) }))
  }
}

/** Construit le document avec les choix faits, après confirmation si le document courant est modifié. Rend false si l'utilisateur annule. */
export async function applyDocumentImport(outline: Outline, name: string, options: Omit<ImportOptions, 'name' | 'continued'>): Promise<boolean> {
  if (!(await confirmUnsaved('importDocument'))) return false
  const result = outlineToDocument(outline, { ...options, name, continued: t('outlineImport.continued') })
  useEditor.getState().loadDocument(result.doc, undefined)
  useEditor.setState({ dirty: true }) // un import n'est enregistré nulle part tant qu'on ne l'a pas fait
  return true
}
