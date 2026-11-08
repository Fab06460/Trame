import { useEffect, useState } from 'react'
import { withGroupMates } from '@/builds'
import { canLink, normalizeLink } from '@/links'
import { selectPage, useEditor } from '@/store/editor'
import { useT } from '@/i18n'
import type { ElementLink } from '@/types'

type Mode = 'none' | 'url' | 'page' | 'mixed'

/**
 * Lien des éléments sélectionnés (un groupe entier à la fois) : une adresse web ou de courrier, ou une page du document. Il est cliquable
 * en présentation, dans le PDF, la présentation web et PowerPoint. Une adresse n'est enregistrée qu'une fois valide (au retour ou en
 * quittant le champ).
 */
export function LinkPanel(): React.JSX.Element {
  const t = useT()
  const page = useEditor(selectPage)
  const pages = useEditor((s) => s.doc.pages)
  const selectedIds = useEditor((s) => s.selectedIds)
  const ids = withGroupMates(page.elements, selectedIds)
  const targets = page.elements.filter((e) => ids.includes(e.id) && canLink(e))
  const first = targets[0]?.link
  const same = targets.every((e) => JSON.stringify(e.link ?? null) === JSON.stringify(first ?? null))
  const current: ElementLink | undefined = same ? first : undefined
  const stored: Mode = !same ? 'mixed' : !current ? 'none' : 'url' in current ? 'url' : 'page'
  const [mode, setMode] = useState<Mode>(stored)
  const [draft, setDraft] = useState(current && 'url' in current ? current.url : '')
  const [invalid, setInvalid] = useState(false)
  const key = targets.map((e) => e.id).join(',')
  const currentJson = JSON.stringify(current ?? null)
  useEffect(() => {
    setMode(stored)
    setDraft(current && 'url' in current ? current.url : '')
    setInvalid(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, currentJson, stored])

  if (!targets.length) {
    return (
      <>
        <h3>{t('link.section')}</h3>
        <p className="hint" data-link-clip>{t('link.clip')}</p>
      </>
    )
  }

  const apply = (link: ElementLink | undefined): void => {
    useEditor.getState().patchElements(targets.map((e) => ({ elementId: e.id, patch: { link } })))
  }
  const choose = (next: Mode): void => {
    setInvalid(false)
    if (next === 'none') apply(undefined)
    else if (next === 'page') {
      const other = pages.find((p) => p.id !== page.id) ?? pages[0]
      apply({ page: other.id })
    }
    setMode(next)
  }
  const commit = (): void => {
    if (!draft.trim()) {
      setInvalid(false)
      return apply(undefined)
    }
    const url = normalizeLink(draft)
    setInvalid(!url)
    if (!url) return
    setDraft(url)
    if (!(current && 'url' in current && current.url === url)) apply({ url })
  }

  return (
    <>
      <h3>{t('link.section')}</h3>
      <label>
        {t('link.kind')}
        <select data-field="linkKind" value={mode} onChange={(e) => choose(e.target.value as Mode)}>
          {mode === 'mixed' && <option value="mixed" disabled>{t('link.mixed')}</option>}
          <option value="none">{t('link.none')}</option>
          <option value="url">{t('link.url')}</option>
          <option value="page">{t('link.page')}</option>
        </select>
      </label>
      {mode === 'url' && (
        <label>
          {t('link.address')}
          <input
            type="text"
            data-field="linkUrl"
            value={draft}
            placeholder={t('link.placeholder')}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
            }}
          />
        </label>
      )}
      {mode === 'page' && (
        <label>
          {t('link.target')}
          <select data-field="linkPage" value={current && 'page' in current ? current.page : ''} onChange={(e) => apply({ page: e.target.value })}>
            {pages.map((p, i) => (
              <option key={p.id} value={p.id}>{t('link.pageN', { n: i + 1 })}</option>
            ))}
          </select>
        </label>
      )}
      {invalid && <p className="warn" role="alert" data-link-problem>{t('link.invalid')}</p>}
      <p className="hint">{t('link.hint')}</p>
    </>
  )
}
