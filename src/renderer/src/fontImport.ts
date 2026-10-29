import { allFonts, extraFonts, registerExtraFont, unregisterExtraFont } from '@/fonts'
import { MAX_FONT_FILE_BYTES, customId, groupFamilies, parseFontFile, uniqueName, type FontFileInfo } from '@/fontFiles'
import { t } from '@/i18n'

export interface FontImportReport {
  /** familles importées, avec leurs variantes */
  imported: Array<{ name: string; variants: string[] }>
  /** fichiers refusés, avec la raison */
  ignored: string[]
  /** avertissements (licence, police variable, graisses ignorées, renommage) */
  notes: string[]
}

const toBase64 = (bytes: Uint8Array): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve((fr.result as string).split(',')[1] ?? '')
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(new Blob([bytes as BlobPart]))
  })

/**
 * Importe des fichiers de police choisis par l'utilisateur : lecture et contrôle de chaque fichier, regroupement en familles, copie dans
 * le dossier de données de l'application, puis mise à disposition immédiate. Retourne null si le sélecteur est annulé.
 */
export async function importFontFiles(category: string): Promise<FontImportReport | null> {
  const picked = await window.trame.pickFontFiles()
  if (picked.length === 0) return null
  const report: FontImportReport = { imported: [], ignored: [], notes: [] }
  const ok: Array<{ bytes: Uint8Array; info: FontFileInfo }> = []
  for (const f of picked) {
    if (f.size > MAX_FONT_FILE_BYTES) {
      report.ignored.push(t('font.file.line', { name: f.name, reason: t('font.file.tooBig', { mb: (f.size / 1e6).toFixed(1) }) }))
      continue
    }
    const r = f.bytes.length === 0 ? ({ ok: false, reason: t('font.file.empty') } as const) : parseFontFile(f.name, f.bytes)
    if (r.ok) ok.push({ bytes: f.bytes, info: r.info })
    else report.ignored.push(t('font.file.line', { name: f.name, reason: r.reason }))
  }

  for (const group of groupFamilies(ok)) {
    // une famille importée une seconde fois remplace la première ; sinon le nom ne doit jamais masquer une police existante
    const sameId = customId(group.family)
    const existing = extraFonts().find((e) => e.id === sameId)
    const taken = new Set(allFonts().map((f) => f.name))
    const name = existing && existing.name === group.family ? group.family : uniqueName(group.family, taken)
    const id = name === group.family ? sameId : customId(name)
    if (name !== group.family) report.notes.push(t('font.import.exists', { family: group.family, name }))
    const variants: Record<string, string> = {}
    for (const [v, file] of Object.entries(group.variants)) variants[v] = await toBase64(file!.bytes)
    const res = await window.trame.saveCustomFont(id, name, group.mono ? 'monospace' : category, variants)
    if (!res.ok) {
      report.ignored.push(t('font.file.line', { name, reason: res.detail || res.error }))
      continue
    }
    unregisterExtraFont(id)
    await registerExtraFont(res.font)
    report.imported.push({ name, variants: res.font.variants })
    report.notes.push(...group.notes)
  }
  return report
}
