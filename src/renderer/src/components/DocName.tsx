import { useEffect, useState } from 'react'
import { useT } from '@/i18n'
import { useEditor } from '@/store/editor'
import { MAX_NAME } from '@/docName'

/** Nom du document : celui des exports et le nom proposé par « Enregistrer sous ». Entrée valide, Échap annule. */
export function DocName(): React.JSX.Element {
  const t = useT()
  const name = useEditor((s) => s.doc.name)
  const [draft, setDraft] = useState(name)
  useEffect(() => setDraft(name), [name])
  const commit = (): void => {
    useEditor.getState().setName(draft)
    setDraft(useEditor.getState().doc.name)
  }
  return (
    <input
      className="doc-name"
      aria-label={t('doc.name.label')}
      title={t('doc.name.title')}
      value={draft}
      maxLength={MAX_NAME}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(name)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
