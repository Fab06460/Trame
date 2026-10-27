import { selectPage, useEditor } from '@/store/editor'
import { hasProtected, isEnforced } from '@/protection'
import type { Protection } from '@/types'

/**
 * Bandeau « modèle de marque » : tant que le document contient des éléments protégés, il dit dans quel état on est
 * (modèle verrouillé : on remplit ; modèle en modification : on décide ce qui est figé ou à remplir).
 */
export function TemplateBanner(): React.JSX.Element | null {
  const protectedAny = useEditor((s) => hasProtected(s.doc))
  const unlocked = useEditor((s) => s.templateUnlocked)
  const { setTemplateUnlocked } = useEditor.getState()
  if (!protectedAny) return null
  return unlocked ? (
    <div className="template-banner editing" role="status" data-template-state="editing">
      <strong>✏️ Modification du modèle</strong>
      <span>Les éléments figés sont déverrouillés. Choisissez pour chaque élément : libre, à remplir ou figé.</span>
      <button className="primary" data-action="template-lock" onClick={() => setTemplateUnlocked(false)}>
        Terminer et verrouiller
      </button>
    </div>
  ) : (
    <div className="template-banner" role="status" data-template-state="locked">
      <strong>🔒 Modèle verrouillé</strong>
      <span>Les éléments figés ne peuvent pas être modifiés ; les éléments « à remplir » le sont dans leur contenu seulement.</span>
      <button data-action="template-unlock" onClick={() => setTemplateUnlocked(true)}>
        Modifier le modèle
      </button>
    </div>
  )
}

const OPTIONS: Array<[Protection | undefined, string, string]> = [
  [undefined, 'Libre', 'Aucune protection : l\'élément reste entièrement modifiable'],
  ['fill', 'À remplir', 'Le contenu (texte, image, couleur…) reste modifiable ; la position, la taille et la présence sont figées'],
  ['fixed', 'Figé', 'Rien ne peut être modifié : logo, mentions, bandeaux de la marque']
]

/** Choix de la protection des éléments sélectionnés (disponible quand le modèle n'est pas verrouillé). */
export function ProtectionControls(): React.JSX.Element | null {
  const enforced = useEditor((s) => isEnforced(s.doc, s.templateUnlocked))
  const values = useEditor((s) => selectPage(s).elements.filter((e) => s.selectedIds.includes(e.id)).map((e) => e.protect ?? '').join('|'))
  const { setProtection } = useEditor.getState()
  if (enforced) return null
  const list = values.split('|')
  const common = list.every((v) => v === list[0]) ? list[0] || undefined : null // null : sélection mixte
  return (
    <>
      <h3>Modèle de marque</h3>
      <div className="seg three" role="group" aria-label="Protection de l'élément">
        {OPTIONS.map(([value, label, title]) => (
          <button key={label} data-protect={value ?? 'free'} title={title} aria-pressed={common === value} className={common === value ? 'active' : ''} onClick={() => setProtection(value)}>
            {label}
          </button>
        ))}
      </div>
      <p className="hint">Pour fabriquer un modèle : marquez le logo et les mentions « figés », le titre et les photos « à remplir », puis « Terminer et verrouiller » et enregistrez-le comme modèle.</p>
    </>
  )
}
