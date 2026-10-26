import { useState } from 'react'

interface Props {
  id: string
  /** `user` : modèle personnel ; `builtin` : modèle intégré */
  kind: 'user' | 'builtin'
  /** nom du modèle (celui qu'on renomme) */
  name: string
  /** texte ajouté à l'affichage du nom, par ex. « · 2 p. » */
  suffix?: string
  /** aperçu du modèle (miniature) */
  thumb: React.ReactNode
  badge?: string
  onOpen: () => void
  /** appelée avec le nouveau nom, une fois validé (Entrée) */
  onRename: (name: string) => void
  onRemove: () => void
  renameTitle: string
  removeTitle: string
  /** icône du bouton de suppression : ✕ (supprimer / masquer) ou ↺ (rétablir l'original) */
  removeIcon?: string
}

/** Carte d'un modèle (intégré ou personnel) avec ses actions : ouvrir, renommer sur place, supprimer. */
export function TemplateCard({ id, kind, name: label, suffix, thumb, badge, onOpen, onRename, onRemove, renameTitle, removeTitle, removeIcon = '✕' }: Props): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(label)

  const commit = (): void => {
    setEditing(false)
    if (name.trim() && name.trim() !== label) onRename(name)
  }

  return (
    <div className={`card template-card ${kind === 'user' ? 'user-template' : 'builtin-template'}`} data-template-id={id}>
      <button className="card-open" onClick={onOpen} title={label}>
        {thumb}
        {!editing && (
          <span>
            {label}
            {suffix}
            {badge ? <em className="badge">{badge}</em> : null}
          </span>
        )}
      </button>
      {editing && (
        <input
          className="text-field card-rename-input"
          autoFocus
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation() // ne pas déclencher les raccourcis de l'éditeur pendant la saisie
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setName(label)
              setEditing(false)
            }
          }}
        />
      )}
      <div className="card-actions">
        <button
          className="card-action card-rename"
          title={renameTitle}
          onClick={() => {
            setName(label)
            setEditing(true)
          }}
        >
          ✎
        </button>
        <button className="card-action card-remove" title={removeTitle} onClick={onRemove}>
          {removeIcon}
        </button>
      </div>
    </div>
  )
}
