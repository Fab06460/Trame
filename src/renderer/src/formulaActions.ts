import { DEFAULT_FORMULA, FORMULA_SIZE, formulaElement, formulaKept, inkOn, renderFormula, type FormulaSpec } from '@/formula'
import { selectPage, useEditor } from '@/store/editor'
import type { TrameElement } from '@/types'

/** Insère une formule d'exemple, centrée sur la page. Ses réglages s'ouvrent dans le panneau de droite. */
export function insertFormula(): void {
  const { doc } = useEditor.getState()
  const size = Math.max(FORMULA_SIZE.min, Math.min(FORMULA_SIZE.max, Math.round(Math.min(doc.width, doc.height) * 0.06)))
  const el = formulaElement({ ...DEFAULT_FORMULA, size }, { x: 0, y: 0 }, { keep: { fill: inkOn(selectPage(useEditor.getState()).background) } })
  if (!('type' in el)) return
  el.x = Math.round((doc.width - el.width) / 2)
  el.y = Math.round((doc.height - el.height) / 2)
  useEditor.getState().insertChart([el])
}

/**
 * Redessine la formule avec des réglages modifiés, au même endroit (coin haut-gauche). La taille reste celle que l'utilisateur a donnée à
 * l'élément en l'étirant sur la page : elle se déduit de la largeur actuelle, sauf si `patch.size` en impose une. Retourne l'erreur
 * (le dessin précédent est alors gardé), ou null. `commit` : crée un pas d'historique (faux pour la suite d'une frappe).
 */
export function updateFormula(el: TrameElement, patch: Partial<FormulaSpec>, commit = true): { error: string } | null {
  const spec = el.formula
  if (!spec) return null
  const before = renderFormula(spec.latex, spec.display)
  const current = before.ok && before.widthEm > 0 ? el.width / before.widthEm : spec.size
  const next: FormulaSpec = { ...spec, size: Math.max(FORMULA_SIZE.min, Math.min(FORMULA_SIZE.max, current)), ...patch }
  const drawn = formulaElement(next, { x: el.x, y: el.y }, { id: el.id, keep: formulaKept(el) })
  if (!('type' in drawn)) return { error: drawn.error }
  useEditor.getState().updateElement(el.id, { path: drawn.path, width: drawn.width, height: drawn.height, formula: drawn.formula }, commit)
  return null
}

/** L'élément sélectionné, s'il est le seul et que c'est une formule. */
export function selectedFormula(): TrameElement | null {
  const s = useEditor.getState()
  const els = selectPage(s).elements.filter((e) => s.selectedIds.includes(e.id))
  return els.length === 1 && els[0].formula ? els[0] : null
}
