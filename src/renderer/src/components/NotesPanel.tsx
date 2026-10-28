import { useRef, useState } from 'react'
import { useEditor, selectPage } from '@/store/editor'
import { MAX_NOTES } from '@/notes'

const KEY = 'trame.notesOpen'
const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Notes de l'orateur de la page courante : repliées par défaut, visibles en mode présentation (touche N). */
export function NotesPanel(): React.JSX.Element {
  const notes = useEditor((s) => selectPage(s).notes ?? '')
  const pageId = useEditor((s) => selectPage(s).id)
  const pageNumber = useEditor((s) => s.doc.pages.findIndex((p) => p.id === pageId) + 1)
  const [open, setOpen] = useState(read)
  // un cran d'historique par séance de frappe (du focus au blur), pas un par caractère
  const started = useRef(false)

  const toggle = (): void => {
    setOpen((o) => {
      try {
        localStorage.setItem(KEY, o ? '0' : '1')
      } catch {
        /* stockage indisponible */
      }
      return !o
    })
  }

  return (
    <section className="notes-panel" data-notes-panel aria-label="Notes de l'orateur">
      <button className="notes-toggle" data-notes="toggle" aria-expanded={open} onClick={toggle}>
        {open ? '▾' : '▸'} Notes de l'orateur — page {pageNumber}
        {notes && !open ? ' •' : ''}
      </button>
      {open && (
        <textarea
          key={pageId}
          data-notes="text"
          value={notes}
          maxLength={MAX_NOTES}
          placeholder="Ce que vous direz sur cette page. Visible en présentation (touche N), exporté dans PowerPoint."
          onFocus={() => (started.current = false)}
          onChange={(e) => {
            useEditor.getState().setNotes(e.target.value, !started.current)
            started.current = true
          }}
        />
      )}
    </section>
  )
}
