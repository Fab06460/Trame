import { PRINT_LIMITS, NO_PRINT_SETUP, printSetupOf, textsOutsideSafe, type PrintSetup } from '@/printSetup'
import { selectPage, useEditor } from '@/store/editor'
import { NumberField } from './NumberField'
import { useT } from '@/i18n'

/** Fond perdu, marge de sécurité et traits de coupe du document (impression professionnelle). Le PDF les applique ; l'éditeur les montre. */
export function PrintSetupPanel(): React.JSX.Element {
  const t = useT()
  const doc = useEditor((s) => s.doc)
  const page = useEditor(selectPage)
  const setup = printSetupOf(doc)
  const outside = textsOutsideSafe(page, doc, setup)
  const change = (patch: Partial<PrintSetup>): void =>
    useEditor.getState().editDocument((d) => {
      const next = { ...printSetupOf(d), ...patch }
      const { print: _drop, ...rest } = d
      return next.bleedMm || next.safeMm || next.marks ? { ...rest, print: next } : rest
    })
  return (
    <section data-print-setup>
      <h4>{t('printSetup.title')}</h4>
      <div className="num-grid">
        <NumberField label={t('printSetup.bleed')} field="bleedMm" value={setup.bleedMm} min={PRINT_LIMITS.bleedMm.min} max={PRINT_LIMITS.bleedMm.max} step={0.5} suffix="mm" onCommit={(v) => change({ bleedMm: v })} />
        <NumberField label={t('printSetup.safe')} field="safeMm" value={setup.safeMm} min={PRINT_LIMITS.safeMm.min} max={PRINT_LIMITS.safeMm.max} step={0.5} suffix="mm" onCommit={(v) => change({ safeMm: v })} />
      </div>
      <label className="check" title={t('printSetup.marks.title')}>
        <input type="checkbox" data-field="cropMarks" checked={setup.marks} onChange={(e) => change({ marks: e.target.checked })} />
        {t('printSetup.marks')}
      </label>
      {(setup.bleedMm > 0 || setup.marks) && <p className="hint">{t('printSetup.hint.pdf')}</p>}
      {outside.length > 0 && (
        <button data-action="select-outside-safe" title={t('printSetup.outside.title')} onClick={() => useEditor.getState().select(outside)}>
          {t('printSetup.outside', { count: outside.length })}
        </button>
      )}
      {setup.safeMm === NO_PRINT_SETUP.safeMm && setup.bleedMm === 0 && !setup.marks && <p className="hint">{t('printSetup.hint.empty')}</p>}
    </section>
  )
}
