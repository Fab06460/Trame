import { useEffect, useRef, useState } from 'react'
import { useEditor } from '@/store/editor'
import { useReview } from '@/store/review'
import { allComments, commentsOf } from '@/review'
import { placeComment, showComment } from '@/reviewActions'
import { useT } from '@/i18n'

/**
 * Épingles de relecture de la page affichée, posées sur le canevas (HTML par-dessus : elles ne font pas partie de la page, donc jamais
 * exportées). On les déplace en les faisant glisser ; un clic met le commentaire en avant dans l'onglet « Relecture ».
 */
export function CommentPins({ offX, offY, scale }: { offX: number; offY: number; scale: number }): React.JSX.Element | null {
  const t = useT()
  const doc = useEditor((s) => s.doc)
  const pageId = useEditor((s) => s.pageId)
  const draft = useReview((s) => s.draft)
  const activeId = useReview((s) => s.activeId)
  const hideResolved = useReview((s) => s.hideResolved)
  const adding = useReview((s) => s.adding)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const moved = useRef(false)

  const page = doc.pages.find((p) => p.id === pageId)
  const numbers = new Map(allComments(doc).map((c) => [c.comment.id, c.n]))
  const list = page ? commentsOf(page).filter((c) => !(hideResolved && c.resolved)) : []

  // Échap abandonne le mode « ajouter un commentaire »
  useEffect(() => {
    if (!adding) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useReview.getState().setAdding(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [adding])

  // un glissement en cours suit la souris même hors de l'épingle
  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent): void => {
      moved.current = true
      const wrap = document.querySelector('.canvas-wrap')!.getBoundingClientRect()
      setDrag((d) => d && { ...d, x: Math.min(doc.width, Math.max(0, (e.clientX - wrap.left - offX) / scale)), y: Math.min(doc.height, Math.max(0, (e.clientY - wrap.top - offY) / scale)) })
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setDrag((d) => {
        if (d && moved.current && page) placeComment(page.id, d.id, d.x, d.y)
        return null
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, offX, offY, scale, doc.width, doc.height])

  if (!page) return null
  const at = (x: number, y: number): React.CSSProperties => ({ left: offX + x * scale, top: offY + y * scale })
  return (
    <div className="comment-pins" data-comment-pins>
      {list.map((c) => {
        const pos = drag?.id === c.id ? drag : c
        return (
          <button
            key={c.id}
            className={`comment-pin${c.id === activeId ? ' active' : ''}${c.resolved ? ' resolved' : ''}`}
            data-comment-pin={c.id}
            style={at(pos.x, pos.y)}
            title={`${c.author ? `${c.author} : ` : ''}${c.text}`}
            aria-label={t('review.pin', { n: numbers.get(c.id) ?? 0 })}
            onMouseDown={(e) => {
              if (e.button !== 0) return
              e.stopPropagation()
              moved.current = false
              setDrag({ id: c.id, x: c.x, y: c.y })
            }}
            onClick={() => {
              if (!moved.current) showComment(page.id, c.id)
            }}
          >
            {numbers.get(c.id)}
          </button>
        )
      })}
      {draft && draft.pageId === page.id && <span className="comment-pin draft" data-comment-draft style={at(draft.x, draft.y)} aria-hidden="true">+</span>}
    </div>
  )
}
