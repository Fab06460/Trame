import { useEffect, useRef, useState } from 'react'
import { MAX_QR_TEXT, QR_LEVELS, qrContrastLow, qrMatrix, type QrSpec } from '@/qr'
import { updateQr } from '@/qrActions'
import { fieldsIn } from '@/mailMerge'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'
import type { TrameElement } from '@/types'

/**
 * Réglages d'un QR code sélectionné : contenu, correction d'erreurs, couleurs. Chaque changement redessine le groupe dans le même cadre
 * (un seul pas d'historique) ; un contenu vide ou trop long est signalé et le QR code précédent est gardé.
 */
export function QrPanel({ anchor }: { anchor: TrameElement }): React.JSX.Element | null {
  const t = useT()
  const spec = anchor.qr
  const [text, setText] = useState(spec?.text ?? '')
  const [colors, setColors] = useState({ dark: spec?.dark ?? '', light: spec?.light ?? '' })
  // le sélecteur de couleur émet un changement à chaque déplacement : on attend une pause pour redessiner (un seul pas d'historique)
  const pending = useRef<{ timer: number; patch: Partial<QrSpec> } | null>(null)
  const apply = (patch: Partial<QrSpec>): void => {
    updateQr(anchor, patch)
  }
  const flush = (): void => {
    if (!pending.current) return
    window.clearTimeout(pending.current.timer)
    const { patch } = pending.current
    pending.current = null
    apply(patch)
  }
  const setColor = (key: 'dark' | 'light', value: string): void => {
    const next = { ...colors, [key]: value }
    setColors(next)
    if (pending.current) window.clearTimeout(pending.current.timer)
    pending.current = { timer: window.setTimeout(flush, 400), patch: next }
  }
  // un changement de couleur en attente n'est pas perdu si la sélection change avant la pause
  useEffect(() => flush, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!spec) return null
  // le texte en cours de saisie (pas encore appliqué) : on signale tout de suite ce qui ne passera pas
  const edited = text !== spec.text
  const problem = !text ? 'qr.empty' : !qrMatrix(text, spec.ecc) ? 'qr.tooLong' : null
  const commit = (): void => {
    if (edited && !problem) apply({ text })
  }
  const lowContrast = qrContrastLow(colors)
  const square = Math.abs(anchor.width - anchor.height) > 0.5

  return (
    <div data-qr-panel>
      <h3>{t('qr.panel')}</h3>
      <label>
        {t('qr.text')}
        <textarea
          data-field="qrText"
          rows={3}
          maxLength={MAX_QR_TEXT}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              commit()
            }
          }}
        />
      </label>
      {problem && <div className="warn" role="status" data-qr-problem>{t(problem as MessageKey)}</div>}
      <label>
        {t('qr.level')}
        <select
          data-field="qrLevel"
          value={spec.ecc}
          onChange={(e) => {
            const ecc = e.target.value as QrSpec['ecc']
            if (qrMatrix(spec.text, ecc)) apply({ ecc })
            else setText(spec.text)
          }}
        >
          {QR_LEVELS.map((l) => (
            <option key={l} value={l}>{t(`qr.level.${l}` as MessageKey)}</option>
          ))}
        </select>
      </label>
      <div className="row">
        <label>
          {t('qr.dark')}
          <input type="color" data-field="qrDark" value={colors.dark} onChange={(e) => setColor('dark', e.target.value)} onBlur={flush} />
        </label>
        <label>
          {t('qr.light')}
          <input type="color" data-field="qrLight" value={colors.light} onChange={(e) => setColor('light', e.target.value)} onBlur={flush} />
        </label>
      </div>
      {lowContrast && <div className="warn" role="status" data-qr-contrast>{t('qr.contrast')}</div>}
      {square && (
        <div className="row wrap">
          <span className="warn" role="status" data-qr-skewed>{t('qr.skewed')}</span>
          <button data-action="qr-square" onClick={() => apply({})}>{t('qr.square')}</button>
        </div>
      )}
      {fieldsIn(spec.text).length > 0 && <div className="hint" data-qr-fields>{t('qr.fields')}</div>}
      <p className="hint">{t('qr.hint')}</p>
      <p className="hint">{t('qr.mergeHint', { example: '{{lien}}' })}</p>
    </div>
  )
}
