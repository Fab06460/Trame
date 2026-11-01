import { useEffect, useMemo, useRef, useState } from 'react'
import { allComments, MAX_TEXT, openCount, type NumberedComment } from '@/review'
import { useEditor } from '@/store/editor'
import { useReview } from '@/store/review'
import { changeComment, clearAllComments, copyCommentsText, publishDraft, removeComment, removeReply, replyTo, resolveComment, showComment, startAddingComment } from '@/reviewActions'
import { formatDateTime } from '@/formatDate'
import { useT } from '@/i18n'

/** Onglet « Relecture » : épingler des commentaires sur les pages, y répondre, les marquer comme traités. Ils voyagent dans le fichier `.trame`. */
export function ReviewPanel(): React.JSX.Element {
  const t = useT()
  const doc = useEditor((s) => s.doc)
  const { adding, draft, activeId, hideResolved, author } = useReview()
  const all = useMemo(() => allComments(doc), [doc])
  const open = useMemo(() => openCount(doc), [doc])
  const shown = all.filter((c) => !(hideResolved && c.comment.resolved))
  const [note, setNote] = useState('')
  const activeRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const copy = async (): Promise<void> => setNote((await copyCommentsText()) ? t('review.copied') : t('review.copyFailed'))

  return (
    <div className="review-panel" data-review-panel>
      <label className="field-row">
        {t('review.author')}
        <input type="text" data-field="reviewAuthor" value={author} maxLength={60} placeholder={t('review.author.placeholder')} onChange={(e) => useReview.getState().setAuthor(e.target.value)} />
      </label>

      <button className={adding ? 'primary' : ''} data-action="review-add" aria-pressed={adding} onClick={() => (adding ? useReview.getState().setAdding(false) : startAddingComment())}>
        {adding ? t('review.adding') : t('review.add')}
      </button>
      {adding && <p className="hint" data-review-adding>{t('review.adding.hint')}</p>}

      {draft && <Composer />}

      <div className="row wrap">
        <span data-review-summary>{all.length === 0 ? t('review.none') : t('review.summary', { count: open, total: all.length })}</span>
      </div>
      {all.length > 0 && (
        <>
          <label className="choice-row">
            <input type="checkbox" data-field="reviewHideResolved" checked={hideResolved} onChange={(e) => useReview.getState().setHideResolved(e.target.checked)} /> {t('review.hideResolved')}
          </label>
          <ul className="review-list" data-review-list>
            {shown.map((c) => (
              <CommentItem key={c.comment.id} item={c} active={c.comment.id === activeId} itemRef={c.comment.id === activeId ? activeRef : undefined} />
            ))}
          </ul>
          <div className="row wrap">
            <button data-action="review-copy" onClick={() => void copy()}>{t('review.copy')}</button>
            <button data-action="review-clear" onClick={() => void clearAllComments()}>{t('review.clear')}</button>
          </div>
          {note && <p className="hint" role="status">{note}</p>}
        </>
      )}
      {all.length === 0 && !draft && <p className="hint">{t('review.how')}</p>}
    </div>
  )
}

/** Saisie du texte du commentaire qu'on vient d'épingler. */
function Composer(): React.JSX.Element {
  const t = useT()
  const author = useReview((s) => s.author)
  const [text, setText] = useState('')
  const submit = (): void => {
    if (!text.trim()) return
    publishDraft(text)
  }
  return (
    <div className="review-composer" data-review-composer>
      <textarea
        autoFocus
        data-field="reviewText"
        value={text}
        maxLength={MAX_TEXT}
        rows={3}
        placeholder={t('review.text.placeholder')}
        aria-label={t('review.text')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          if (e.key === 'Escape') useReview.getState().setDraft(null)
        }}
      />
      {!author.trim() && <p className="hint" data-review-noauthor>{t('review.author.missing')}</p>}
      <div className="row end">
        <button data-action="review-cancel" onClick={() => useReview.getState().setDraft(null)}>{t('common.cancel')}</button>
        <button className="primary" data-action="review-publish" disabled={!text.trim()} onClick={submit}>{t('review.publish')}</button>
      </div>
    </div>
  )
}

function CommentItem({ item, active, itemRef }: { item: NumberedComment; active: boolean; itemRef?: React.Ref<HTMLLIElement> }): React.JSX.Element {
  const t = useT()
  const { comment: c, pageId, pageNumber, n } = item
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState('')
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(c.text)
  const sendReply = (): void => {
    if (!reply.trim()) return
    replyTo(pageId, c.id, reply)
    setReply('')
    setReplying(false)
  }
  return (
    <li ref={itemRef} className={`review-item${active ? ' active' : ''}${c.resolved ? ' resolved' : ''}`} data-comment={c.id}>
      <button className="review-head" onClick={() => showComment(pageId, c.id)} aria-label={t('review.goto', { n, page: pageNumber })}>
        <span className="review-n">{n}</span>
        <span>
          <strong>{c.author || t('review.anonymous')}</strong>
          <span className="hint"> · {t('review.page')} {pageNumber} · {formatDateTime(c.at)}{c.resolved ? ` · ${t('review.resolved')}` : ''}</span>
        </span>
      </button>
      {editing ? (
        <>
          <textarea value={text} rows={3} maxLength={MAX_TEXT} aria-label={t('review.text')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <div className="row end">
            <button onClick={() => (setEditing(false), setText(c.text))}>{t('common.cancel')}</button>
            <button className="primary" disabled={!text.trim()} onClick={() => (changeComment(pageId, c.id, text), setEditing(false))}>{t('common.ok')}</button>
          </div>
        </>
      ) : (
        <p className="review-text">{c.text}</p>
      )}
      {(c.replies ?? []).map((r) => (
        <div key={r.id} className="review-reply" data-reply={r.id}>
          <div>
            <strong>{r.author || t('review.anonymous')}</strong>
            <span className="hint"> · {formatDateTime(r.at)}</span>
            <button className="link" aria-label={t('review.reply.delete')} title={t('review.reply.delete')} onClick={() => removeReply(pageId, c.id, r.id)}>×</button>
          </div>
          <p className="review-text">{r.text}</p>
        </div>
      ))}
      {replying && (
        <div className="review-composer">
          <textarea
            autoFocus
            data-field="reviewReply"
            value={reply}
            rows={2}
            maxLength={MAX_TEXT}
            aria-label={t('review.reply')}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply()
              if (e.key === 'Escape') setReplying(false)
            }}
          />
          <div className="row end">
            <button onClick={() => setReplying(false)}>{t('common.cancel')}</button>
            <button className="primary" data-action="review-send-reply" disabled={!reply.trim()} onClick={sendReply}>{t('review.reply.send')}</button>
          </div>
        </div>
      )}
      <div className="row wrap review-actions">
        <button data-action="review-reply" onClick={() => setReplying(true)}>{t('review.reply')}</button>
        <button data-action="review-resolve" onClick={() => resolveComment(pageId, c.id, !c.resolved)}>{c.resolved ? t('review.reopen') : t('review.resolve')}</button>
        <button onClick={() => setEditing(true)}>{t('review.edit')}</button>
        <button data-action="review-delete" onClick={() => removeComment(pageId, c.id)}>{t('review.delete')}</button>
      </div>
    </li>
  )
}
