import { useEffect, useState } from 'react'
import { applyUserTemplate, deleteUserTemplate, renameUserTemplate, saveAsTemplate } from '@/userTemplateActions'
import { useEditor } from '@/store/editor'
import { useTemplates } from '@/store/templates'
import { TEMPLATES, templateName } from '@/templates'
import { TemplateCard } from './TemplateCard'
import { isUntitledName, useT } from '@/i18n'

/** Section « Mes modèles » : enregistrer le design actuel (ou remplacer le modèle dont il vient), réutiliser, renommer, supprimer. */
export function UserTemplates(): React.JSX.Element {
  const t = useT()
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
    origin && (origin.kind === 'user' ? items.some((u) => u.id === origin.id) : !items.some((u) => u.basedOn === origin.id) && TEMPLATES.some((tpl) => tpl.id === origin.id))
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
      <h3>{t('tpl.mine')}</h3>

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
                <input type="radio" name="tpl-mode" checked={!replace} onChange={() => { setReplace(false); setName(isUntitledName(docName) ? '' : docName) }} />
                {t('tpl.new')}
              </label>
              <label>
                <input type="radio" name="tpl-mode" checked={replace} onChange={() => { setReplace(true); setName(replaceable.name) }} />
                <span>
                  {t('tpl.replace', { name: replaceable.name })}
                  {replaceable.kind === 'builtin' ? <small>{t('tpl.replace.note')}</small> : null}
                </span>
              </label>
            </fieldset>
          )}
          <input
            className="text-field"
            autoFocus
            value={name}
            maxLength={60}
            placeholder={t('tpl.name.placeholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation() // ne pas déclencher les raccourcis de l'éditeur pendant la saisie
              if (e.key === 'Escape') setNaming(false)
            }}
          />
          <div className="row">
            <button type="submit" className="primary" disabled={busy || !name.trim()}>{replace && replaceable ? t('tpl.replace.button') : t('tpl.save.button')}</button>
            <button type="button" onClick={() => setNaming(false)}>{t('common.cancel')}</button>
          </div>
        </form>
      ) : (
        <button
          className="wide"
          disabled={isEmpty}
          title={isEmpty ? t('tpl.saveAs.empty') : t('tpl.saveAs.title')}
          onClick={() => {
            setReplace(false) // par défaut on ne remplace rien : choix explicite
            setName(isUntitledName(docName) ? '' : docName)
            setNaming(true)
          }}
        >
          {t('tpl.saveAs')}
        </button>
      )}

      {items.length === 0 ? (
        <p className="empty">{t('tpl.mine.empty')}</p>
      ) : (
        <div className="grid">
          {items.map((u) => {
            const builtin = u.basedOn ? TEMPLATES.find((b) => b.id === u.basedOn) : undefined
            return (
              <TemplateCard
                key={u.id}
                id={u.id}
                kind="user"
                name={u.name}
                suffix={u.pageCount > 1 ? t('tpl.pagesSuffix', { count: u.pageCount }) : undefined}
                thumb={<img src={u.thumbnail} alt="" draggable={false} />}
                badge={builtin ? t('tpl.badge.custom') : undefined}
                onOpen={() => void applyUserTemplate(u)}
                onRename={(n) => void renameUserTemplate(u, n)}
                onRemove={() => void deleteUserTemplate(u)}
                renameTitle={t('tpl.rename.user')}
                removeTitle={builtin ? t('tpl.restoreOriginal.title', { name: templateName(builtin) }) : t('tpl.delete.title')}
                removeIcon={builtin ? '↺' : '✕'}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
