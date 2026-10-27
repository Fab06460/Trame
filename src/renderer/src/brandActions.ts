import { insertImage } from '@/clipboardActions'
import { normalizeColor } from '@/brandKit'
import { selectPage, useEditor } from '@/store/editor'
import { useBrand } from '@/store/brand'

/** Applique une couleur à la sélection (texte, formes : couleur de remplissage) ou, sans sélection, au fond de la page. Un seul cran d'historique. */
export function applyColor(color: string): void {
  const c = normalizeColor(color)
  if (!c) return
  const s = useEditor.getState()
  const targets = selectPage(s).elements.filter((e) => s.selectedIds.includes(e.id) && e.type !== 'image')
  if (s.selectedIds.length === 0) s.setBackground(c)
  else if (targets.length === 0) return
  else {
    s.beginChange()
    for (const e of targets) s.updateElement(e.id, { fill: c, gradient: undefined }, false)
  }
  useBrand.getState().noteColor(c)
}

/** Applique une police aux textes sélectionnés ; sans texte sélectionné, crée un texte dans cette police. */
export function applyFont(family: string): void {
  const s = useEditor.getState()
  const texts = selectPage(s).elements.filter((e) => s.selectedIds.includes(e.id) && e.type === 'text')
  if (!texts.length) return s.addElement({ type: 'text', fontFamily: family }, { edit: true })
  s.beginChange()
  for (const e of texts) s.updateElement(e.id, { fontFamily: family }, false)
}

export const placeLogo = (src: string): Promise<void> => insertImage(src)

/** Pipette : prélève une couleur n'importe où à l'écran (API EyeDropper de Chromium). Retourne null si annulée ou indisponible. */
export async function pickScreenColor(): Promise<string | null> {
  const Eye = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper
  if (!Eye) return null
  try {
    return normalizeColor((await new Eye().open()).sRGBHex)
  } catch {
    return null // Échap
  }
}
