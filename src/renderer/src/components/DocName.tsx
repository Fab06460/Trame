import { useEffect, useState } from 'react'
import { useEditor } from '@/store/editor'
import { MAX_NAME } from '@/docName'

/** Nom du document : celui des exports et le nom proposé par « Enregistrer sous ». Entrée valide, Échap annule. */
export function DocName(): React.JSX.Element {
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
      aria-label="Nom du document"
      title="Nom du document (nom des exports et du fichier)"
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
