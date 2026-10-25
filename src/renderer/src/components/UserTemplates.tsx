import { useCallback, useEffect, useState } from 'react'
import type { UserTemplateMeta } from '../../../preload'
import { applyUserTemplate, deleteUserTemplate, saveAsTemplate } from '@/userTemplateActions'
import { useEditor } from '@/store/editor'

/** Section « Mes modèles » : enregistrer le design actuel, réutiliser ou supprimer ses modèles. */
export function UserTemplates(): React.JSX.Element {
  const [items, setItems] = useState<UserTemplateMeta[]>([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const docName = useEditor((s) => s.doc.name)
  const isEmpty = useEditor((s) => s.doc.pages.every((p) => p.elements.length === 0))

  const refresh = useCallback((): void => {
    window.trame.listUserTemplates().then(setItems, () => setItems([]))
  }, [])
  useEffect(refresh, [refresh])

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      if (await saveAsTemplate(name)) {
        setNaming(false)
        refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3>Mes modèles</h3>

      {naming ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <input
            className="text-field"
            autoFocus
            value={name}
            maxLength={60}
            placeholder="Nom du modèle"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation() // ne pas déclencher les raccourcis de l'éditeur pendant la saisie
              if (e.key === 'Escape') setNaming(false)
            }}
          />
          <div className="row">
            <button type="submit" className="primary" disabled={busy || !name.trim()}>Enregistrer</button>
            <button type="button" onClick={() => setNaming(false)}>Annuler</button>
          </div>
        </form>
      ) : (
        <button
          className="wide"
          disabled={isEmpty}
          title={isEmpty ? 'Ajoutez d’abord des éléments à votre design' : 'Conserver ce design (toutes les pages) comme modèle'}
          onClick={() => {
            setName(docName === 'Sans titre' ? '' : docName)
            setNaming(true)
          }}
        >
          ＋ Enregistrer ce design comme modèle
        </button>
      )}

      {items.length === 0 ? (
        <p className="empty">Vos modèles apparaîtront ici.</p>
      ) : (
        <div className="grid">
          {items.map((t) => (
            <div key={t.id} className="card user-template">
              <button className="card-open" onClick={() => applyUserTemplate(t)} title={t.name}>
                <img src={t.thumbnail} alt="" draggable={false} />
                <span>{t.name}{t.pageCount > 1 ? ` · ${t.pageCount} p.` : ''}</span>
              </button>
              <button
                className="card-remove"
                title="Supprimer ce modèle"
                onClick={async () => {
                  if (await deleteUserTemplate(t)) refresh()
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
