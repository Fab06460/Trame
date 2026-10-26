import { useEffect, useState } from 'react'
import { applyUserTemplate, deleteUserTemplate, renameUserTemplate, saveAsTemplate } from '@/userTemplateActions'
import { useEditor } from '@/store/editor'
import { useTemplates } from '@/store/templates'
import { TEMPLATES } from '@/templates'
import { TemplateCard } from './TemplateCard'

/** Section « Mes modèles » : enregistrer le design actuel (ou remplacer le modèle dont il vient), réutiliser, renommer, supprimer. */
export function UserTemplates(): React.JSX.Element {
  const items = useTemplates((s) => s.user)
  const refresh = useTemplates((s) => s.refresh)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const docName = useEditor((s) => s.doc.name)
  const origin = useEditor((s) => s.templateOrigin)
  const isEmpty = useEditor((s) => s.doc.pages.every((p) => p.elements.length === 0))

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Le document vient-il d'un modèle qu'on peut encore remplacer ?
  const replaceable =
    origin && (origin.kind === 'user' ? items.some((t) => t.id === origin.id) : !items.some((t) => t.basedOn === origin.id) && TEMPLATES.some((t) => t.id === origin.id))
      ? origin
      : null

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      const opts = replace && replaceable ? (replaceable.kind === 'user' ? { replaceId: replaceable.id } : { basedOn: replaceable.id }) : {}
      if (await saveAsTemplate(name, opts)) setNaming(false)
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
          {replaceable && (
            <fieldset className="choice">
              <label>
                <input type="radio" name="tpl-mode" checked={!replace} onChange={() => { setReplace(false); setName(docName === 'Sans titre' ? '' : docName) }} />
                Nouveau modèle
              </label>
              <label>
                <input type="radio" name="tpl-mode" checked={replace} onChange={() => { setReplace(true); setName(replaceable.name) }} />
                <span>
                  Remplacer « {replaceable.name} »
                  {replaceable.kind === 'builtin' ? <small> — l'original pourra être rétabli</small> : null}
                </span>
              </label>
            </fieldset>
          )}
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
            <button type="submit" className="primary" disabled={busy || !name.trim()}>{replace && replaceable ? 'Remplacer' : 'Enregistrer'}</button>
            <button type="button" onClick={() => setNaming(false)}>Annuler</button>
          </div>
        </form>
      ) : (
        <button
          className="wide"
          disabled={isEmpty}
          title={isEmpty ? 'Ajoutez d’abord des éléments à votre design' : 'Conserver ce design (toutes les pages) comme modèle'}
          onClick={() => {
            setReplace(false) // par défaut on ne remplace rien : choix explicite
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
          {items.map((t) => {
            const builtin = t.basedOn ? TEMPLATES.find((b) => b.id === t.basedOn) : undefined
            return (
              <TemplateCard
                key={t.id}
                id={t.id}
                kind="user"
                name={t.name}
                suffix={t.pageCount > 1 ? ` · ${t.pageCount} p.` : undefined}
                thumb={<img src={t.thumbnail} alt="" draggable={false} />}
                badge={builtin ? 'personnalisé' : undefined}
                onOpen={() => void applyUserTemplate(t)}
                onRename={(n) => void renameUserTemplate(t, n)}
                onRemove={() => void deleteUserTemplate(t)}
                renameTitle="Renommer ce modèle"
                removeTitle={builtin ? `Rétablir le modèle d'origine « ${builtin.name} »` : 'Supprimer ce modèle'}
                removeIcon={builtin ? '↺' : '✕'}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
