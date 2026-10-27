import { useState } from 'react'
import { dropIndex, layerLabel } from '@/layers'
import { isEnforced } from '@/protection'
import { selectPage, useEditor } from '@/store/editor'
import { usePdfIssues } from '@/store/pdfIssues'
import type { TrameElement } from '@/types'

const GLYPH: Record<TrameElement['type'], string> = { rect: '▭', ellipse: '◯', text: 'T', image: '▣', path: '★' }

/**
 * Calques de la page courante, du plus haut au plus bas : sélectionner, masquer (œil), verrouiller (cadenas),
 * renommer (double-clic) et réordonner (glisser-déposer).
 */
export function LayersPanel(): React.JSX.Element {
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const pdfIssues = usePdfIssues((s) => s.issues)
  const enforced = useEditor((s) => isEnforced(s.doc, s.templateUnlocked))
  const { select, toggleSelect, setLayerFlag, updateElement, reorderElement } = useEditor.getState()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overRow, setOverRow] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  const rows = [...page.elements].reverse()
  if (!rows.length) return <p className="empty">Les éléments de la page apparaîtront ici, du premier plan à l'arrière-plan.</p>

  return (
    <ul className="layers" data-testid="layers">
      {rows.map((el, row) => (
        <li
          key={el.id}
          data-layer-id={el.id}
          className={`layer${selectedIds.includes(el.id) ? ' selected' : ''}${el.hidden ? ' hidden' : ''}${overRow === row && dragId !== el.id ? ' drop' : ''}`}
          draggable={renaming !== el.id}
          onDragStart={(e) => {
            setDragId(el.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setOverRow(row)
          }}
          onDrop={(e) => {
            e.preventDefault()
            const to = dragId ? dropIndex(page.elements, dragId, row) : null
            if (dragId && to !== null) reorderElement(dragId, to)
            setDragId(null)
            setOverRow(null)
          }}
          onDragEnd={() => {
            setDragId(null)
            setOverRow(null)
          }}
          onClick={(e) => (e.shiftKey ? toggleSelect(el.id) : select([el.id]))}
        >
          <button
            disabled={enforced && !!el.protect}
            className={`layer-flag eye${el.hidden ? ' off' : ''}`}
            title={el.hidden ? 'Afficher' : 'Masquer (ni affiché ni exporté)'}
            aria-pressed={!el.hidden}
            onClick={(e) => {
              e.stopPropagation()
              setLayerFlag(el.id, 'hidden', !el.hidden)
            }}
          >
            {el.hidden ? '◌' : '●'}
          </button>
          <span className="layer-glyph" aria-hidden>{GLYPH[el.type]}</span>
          {renaming === el.id ? (
            <input
              className="layer-rename"
              autoFocus
              defaultValue={layerLabel(el)}
              maxLength={60}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                setRenaming(null)
                const name = e.target.value.trim()
                if (name !== layerLabel(el)) updateElement(el.id, { name })
              }}
              onKeyDown={(e) => {
                e.stopPropagation() // pas de raccourcis de l'éditeur pendant la saisie
                if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
              }}
            />
          ) : (
            <span className="layer-name" title="Double-clic pour renommer" onDoubleClick={() => setRenaming(el.id)}>
              {layerLabel(el)}
              {el.groupId ? <em className="layer-tag" title="Fait partie d'un groupe"> groupe</em> : null}
              {el.protect ? <em className="layer-protect" data-layer-protect={el.protect} title={el.protect === 'fixed' ? 'Figé par le modèle' : 'À remplir (contenu modifiable, position fixée)'}>{el.protect === 'fixed' ? '🔐' : '🏷'}</em> : null}
              {pdfIssues[el.id] ? <em className="layer-tag warn-tag" title="Sera exporté en image dans le PDF"> ⚠</em> : null}
            </span>
          )}
          <button
            disabled={enforced && !!el.protect}
            className={`layer-flag lock${el.locked ? ' on' : ''}`}
            title={el.locked ? 'Déverrouiller' : 'Verrouiller la position'}
            aria-pressed={!!el.locked}
            onClick={(e) => {
              e.stopPropagation()
              setLayerFlag(el.id, 'locked', !el.locked)
            }}
          >
            {el.locked ? '🔒' : '🔓'}
          </button>
        </li>
      ))}
    </ul>
  )
}
