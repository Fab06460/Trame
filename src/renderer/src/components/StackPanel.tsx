import { useT } from '@/i18n'
import { canBeMask } from '@/clipMask'
import { layerLabel } from '@/layers'
import { measureElement } from '@/stackMeasure'
import { STACK_ALIGNS, STACK_LIMITS, planStack, stackContent, stackSpecOf, type StackAlign } from '@/stackLayout'
import { selectPage, useEditor } from '@/store/editor'
import type { MessageKey } from '@shared/i18n'
import { NumberField } from './NumberField'

/**
 * Pile (auto-layout) : ranger des éléments l'un après l'autre avec un espacement et un alignement, qui se replacent tout seuls quand un texte
 * s'allonge. Sans pile : « Pile verticale / horizontale » à partir d'une sélection. Avec une pile : sens, espacement, alignement, fond et marge.
 */
export function StackPanel(): React.JSX.Element | null {
  const t = useT()
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const selection = page.elements.filter((e) => selectedIds.includes(e.id))
  const groupIds = new Set(selection.map((e) => e.groupId).filter((g): g is string => !!g))
  const inStack = selection.filter((e) => e.stack)
  // les piles et les masques ne se mélangent pas (un masque découpe tout son groupe)
  if (selection.some((e) => e.clip) || (groupIds.size > 0 && page.elements.some((e) => e.clip && e.groupId && groupIds.has(e.groupId)))) return null

  if (!inStack.length) {
    if (selection.length < 2) return null
    const create = (dir: 'v' | 'h'): void => {
      const plan = planStack(selection, dir, measureElement, canBeMask)
      if (!plan || !useEditor.getState().makeStack(plan)) void window.trame.showInfo(t('stack.title'), t('stack.locked'))
    }
    return (
      <>
        <h3>{t('stack.title')}</h3>
        <div className="row">
          <button data-action="stack-make-v" title={t('stack.make.title')} onClick={() => create('v')}>{t('stack.make.v')}</button>
          <button data-action="stack-make-h" title={t('stack.make.title')} onClick={() => create('h')}>{t('stack.make.h')}</button>
        </div>
      </>
    )
  }

  const groupId = inStack[0].groupId!
  const members = page.elements.filter((e) => e.groupId === groupId)
  const spec = stackSpecOf(members)!
  const content = stackContent(members)
  const hasBg = members.some((e) => e.stackBg)
  const set = (patch: Parameters<ReturnType<typeof useEditor.getState>['setStack']>[1]): void => useEditor.getState().setStack(groupId, patch)

  return (
    <>
      <h3>{t('stack.title')}</h3>
      <div className="seg" role="group" aria-label={t('stack.dir')}>
        {(['v', 'h'] as const).map((d) => (
          <button key={d} data-stack-dir={d} aria-pressed={spec.dir === d} className={spec.dir === d ? 'active' : ''} onClick={() => set({ dir: d })}>
            {t(d === 'v' ? 'stack.dir.v' : 'stack.dir.h')}
          </button>
        ))}
      </div>
      <div className="row">
        <NumberField label={t('stack.gap')} field="stackGap" value={spec.gap} min={STACK_LIMITS.gap.min} max={STACK_LIMITS.gap.max} suffix="px" onCommit={(v) => set({ gap: v })} />
        {hasBg && <NumberField label={t('stack.pad')} field="stackPad" value={spec.pad} min={STACK_LIMITS.pad.min} max={STACK_LIMITS.pad.max} suffix="px" onCommit={(v) => set({ pad: v })} />}
      </div>
      <label>
        {t('stack.align')}
        <select data-field="stackAlign" value={spec.align} onChange={(e) => set({ align: e.target.value as StackAlign })}>
          {STACK_ALIGNS.map((a) => (
            <option key={a} value={a}>{t(`stack.align.${a}` as MessageKey)}</option>
          ))}
        </select>
      </label>
      <h4 className="sub">{t('stack.members')}</h4>
      <ul className="stack-members" data-stack-members>
        {[...content, ...members.filter((e) => e.stackBg)].map((e) => {
          const i = content.findIndex((c) => c.id === e.id)
          const isBg = !!e.stackBg
          return (
            <li key={e.id} data-stack-member={e.id}>
              <span className="stack-member-name">{layerLabel(e)}</span>
              {!isBg && (
                <>
                  <button data-action="stack-up" disabled={i <= 0} title={t('stack.up')} onClick={() => useEditor.getState().moveInStack(e.id, -1)}>↑</button>
                  <button data-action="stack-down" disabled={i < 0 || i >= content.length - 1} title={t('stack.down')} onClick={() => useEditor.getState().moveInStack(e.id, 1)}>↓</button>
                </>
              )}
              {(e.type === 'rect' || e.type === 'ellipse' || e.type === 'path') && (
                <button data-action="stack-bg" aria-pressed={isBg} className={isBg ? 'active' : ''} title={t('stack.bg.title')} onClick={() => useEditor.getState().setStackBackground(e.id, !isBg)}>
                  {t('stack.bg')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <p className="hint">{t('stack.placed')}</p>
      <div className="row">
        <button data-action="stack-release" title={t('stack.release.title')} onClick={() => useEditor.getState().releaseStack(groupId)}>{t('stack.release')}</button>
      </div>
    </>
  )
}
