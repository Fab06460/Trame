import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  /** identifiant stable du champ (utilisé par les tests de bout en bout) */
  field: string
  value: number
  onCommit: (value: number) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  suffix?: string
  /**
   * Applique la valeur dès qu'elle est valide (pendant la frappe, ou aux flèches du champ) : le résultat se voit tout de suite. `first` est vrai
   * pour le premier changement depuis l'entrée dans le champ (c'est lui qui crée le cran d'historique), faux ensuite.
   */
  onLive?: (value: number, first: boolean) => void
}

const show = (v: number): string => String(Math.round(v * 100) / 100)

/**
 * Champ numérique qui n'applique la valeur qu'à la validation (Entrée ou sortie du champ) : un seul cran d'historique par
 * modification, et la frappe « 1 », « 10 », « 100 » ne déplace pas l'élément à chaque chiffre. Échap annule. Avec `onLive`, une valeur valide
 * (dans les bornes) s'applique tout de suite, en un seul cran d'historique pour toute la modification.
 */
export function NumberField({ label, field, value, onCommit, onLive, disabled, min, max, step = 1, suffix }: Props): React.JSX.Element {
  const [draft, setDraft] = useState(show(value))
  const focused = useRef(false)
  const liveStarted = useRef(false)

  // la valeur change de l'extérieur (glisser sur le canvas, annuler…) : on suit, sauf pendant la saisie
  useEffect(() => {
    if (!focused.current) setDraft(show(value))
  }, [value])

  const commit = (): void => {
    // rien n'a été saisi : on ne « valide » pas la valeur affichée (arrondie) à la place de la vraie
    if (draft === show(value)) return
    const n = Number(draft.replace(',', '.'))
    if (!Number.isFinite(n) || draft.trim() === '') return setDraft(show(value))
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
    if (Math.abs(clamped - value) > 1e-9) onCommit(clamped)
    setDraft(show(clamped))
  }

  return (
    <label className="num-field">
      <span>{label}</span>
      <span className="num-input">
        <input
          type="number"
          data-field={field}
          value={draft}
          disabled={disabled}
          step={step}
          onFocus={() => {
            focused.current = true
            liveStarted.current = false
          }}
          onChange={(e) => {
            setDraft(e.target.value)
            if (!onLive) return
            const n = Number(e.target.value.replace(',', '.'))
            if (e.target.value.trim() === '' || !Number.isFinite(n) || n < (min ?? -Infinity) || n > (max ?? Infinity) || Math.abs(n - value) < 1e-9) return
            onLive(n, !liveStarted.current)
            liveStarted.current = true
          }}
          onBlur={() => {
            focused.current = false
            commit()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setDraft(show(value))
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        {suffix ? <em>{suffix}</em> : null}
      </span>
    </label>
  )
}
