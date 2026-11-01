import { parseDocument } from '@/store/editor'
import { useCompare } from '@/store/compare'
import { t } from '@/i18n'

/** Choisit un autre fichier .trame et ouvre la comparaison avec le document actuel. */
export async function compareWithFile(): Promise<void> {
  const res = await window.trame.pickOtherProject()
  if (!res) return
  try {
    const doc = parseDocument(res.json)
    useCompare.getState().start({ doc, label: res.path.split(/[\\/]/).pop()!.replace(/\.trame$/, '') })
  } catch (err) {
    await window.trame.showError(t('file.openFailed'), err instanceof Error ? err.message : String(err))
  }
}
