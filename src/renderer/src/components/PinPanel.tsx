import { useT } from '@/i18n'
import { PIN_MODES, pinOf, type PinMode } from '@/magicResize'
import { selectPage, useEditor } from '@/store/editor'
import type { MessageKey } from '@shared/i18n'

/** Contraintes au changement de format (Magic Resize), par axe : sans réglage, Trame décide seul (bords, fonds, composition centrée). */
export function PinPanel(): React.JSX.Element | null {
  const t = useT()
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const selection = page.elements.filter((e) => selectedIds.includes(e.id))
  if (!selection.length) return null
  const pin = pinOf(selection)
  const label = (axis: 'h' | 'v', m: PinMode): string => t((m === 'start' || m === 'end' ? `pin.${m}.${axis}` : `pin.${m}`) as MessageKey)
  const field = (axis: 'h' | 'v'): React.JSX.Element => (
    <label>
      {t(`pin.${axis}` as MessageKey)}
      <select data-field={`pin-${axis}`} value={pin[axis] ?? ''} onChange={(e) => useEditor.getState().setPin(axis, (e.target.value || undefined) as PinMode | undefined)}>
        <option value="">{t('pin.auto')}</option>
        {PIN_MODES.map((m) => (
          <option key={m} value={m}>{label(axis, m)}</option>
        ))}
      </select>
    </label>
  )
  return (
    <>
      <h3>{t('pin.title')}</h3>
      <div className="row">{field('h')}{field('v')}</div>
      <p className="hint">{t('pin.hint')}</p>
    </>
  )
}
