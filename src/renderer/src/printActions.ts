import { fileSafeName } from '@/docName'
import { exportPdf } from '@/pdfExport'
import { describeFallbacks } from '@/pdfFallbacks'
import { t } from '@/i18n'
import { useEditor } from '@/store/editor'
import type { ImposedDocument } from '@/imposition'

/** Écrit le PDF d'une imposition (livret ou plusieurs pages par feuille) ; les textes qui n'ont pas pu rester du texte sont signalés après l'enregistrement. */
export async function exportImposed(imposed: ImposedDocument, fileStem: string): Promise<string | null> {
  const { doc } = useEditor.getState()
  const { dataUrl, fallbacks } = await exportPdf(imposed.doc)
  const saved = await window.trame.saveExport(dataUrl, `${fileSafeName(fileStem || doc.name)}.pdf`)
  const warning = saved ? describeFallbacks(fallbacks, imposed.doc.pages.length) : null
  if (warning) await window.trame.showInfo(warning.message, warning.detail)
  return saved
}
