import { nanoid } from 'nanoid'
import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { fileSafeName } from '@/docName'
import { openPdf } from '@/pdfImport/importPdf'
import { buildPdf, countPages, MAX_TOOL_PAGES, moveItem, parsePageRanges, partName, splitGroups, turn, type PageRef, type SplitMode } from '@/pdfTools'
import { pdfThumb } from '@/pdfThumb'
import { usePdfTools } from '@/store/pdfTools'
import { t as translate, useT } from '@/i18n'

interface Src {
  id: string
  name: string
  bytes: Uint8Array
  pages: number
}
interface Card {
  id: string
  ref: PageRef
  thumb?: string
}

const toBase64 = (bytes: Uint8Array): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve((fr.result as string).split(',')[1] ?? '')
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(new Blob([bytes as BlobPart]))
  })

/**
 * Outils PDF : on réunit les pages d'un ou plusieurs PDF, on les remet dans l'ordre, on en retire ou on en pivote, puis on enregistre un
 * seul PDF (fusion, réordonnancement, extraction) ou plusieurs (scission). Indépendant du document ouvert, qui n'est pas modifié.
 */
export function PdfToolsDialog(): React.JSX.Element | null {
  const open = usePdfTools((s) => s.open)
  return open ? <Tools onClose={() => usePdfTools.getState().setOpen(false)} /> : null
}

function Tools({ onClose }: { onClose: () => void }): React.JSX.Element {
  const t = useT()
  const [sources, setSources] = useState<Src[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [range, setRange] = useState('')
  const [split, setSplit] = useState<'each' | 'every'>('each')
  const [every, setEvery] = useState(2)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const proxies = useRef(new Map<string, PDFDocumentProxy>())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const held = proxies.current
    return () => {
      alive.current = false
      for (const p of held.values()) void p.loadingTask.destroy()
      held.clear()
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (!busy) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onClose])

  const fail = (err: unknown, name = ''): void => {
    const code = err instanceof Error ? err.message : String(err)
    setMessage({ error: true, text: code === 'encrypted' ? t('pdft.encrypted', { name }) : code === 'unreadable' ? t('pdft.unreadable', { name }) : t('pdft.failed', { reason: code }) })
  }

  const add = async (): Promise<void> => {
    if (busy) return
    const picked = await window.trame.pickPdf()
    if (!picked) return
    setMessage(null)
    let pages: number
    try {
      pages = await countPages(picked.bytes)
    } catch (err) {
      return fail(err, picked.name)
    }
    if (pages === 0) return fail(new Error('unreadable'), picked.name)
    if (cards.length + pages > MAX_TOOL_PAGES) return setMessage({ error: true, text: t('pdft.tooMany', { max: MAX_TOOL_PAGES }) })
    const id = nanoid(6)
    const fresh: Card[] = Array.from({ length: pages }, (_, index) => ({ id: nanoid(6), ref: { src: id, index, rotate: 0 } }))
    setSources((s) => [...s, { id, name: picked.name, bytes: picked.bytes, pages }])
    setCards((c) => [...c, ...fresh])
    // miniatures, une à une : l'affichage reste utilisable pendant qu'elles arrivent
    try {
      const proxy = await openPdf(picked.bytes)
      if (!alive.current) return void proxy.loadingTask.destroy()
      proxies.current.set(id, proxy)
      for (const card of fresh) {
        if (!alive.current || !proxies.current.has(id)) return
        const thumb = await pdfThumb(proxy, card.ref.index).catch(() => undefined)
        if (thumb && alive.current) setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, thumb } : c)))
      }
    } catch {
      // sans miniatures le PDF reste utilisable : les cartes montrent seulement leur numéro
    }
  }

  const removeSource = (id: string): void => {
    void proxies.current.get(id)?.loadingTask.destroy()
    proxies.current.delete(id)
    setSources((s) => s.filter((x) => x.id !== id))
    setCards((c) => c.filter((x) => x.ref.src !== id))
  }
  const nameOf = (id: string): string => sources.find((s) => s.id === id)?.name ?? ''

  const keep = (): void => {
    const idx = parsePageRanges(range, cards.length)
    if (!idx) return setMessage({ error: true, text: t('pdft.keepInvalid') })
    setMessage(null)
    setCards((c) => idx.map((i) => c[i]))
    setRange('')
  }

  const sourceBytes = (): Record<string, Uint8Array> => Object.fromEntries(sources.map((s) => [s.id, s.bytes]))
  const stem = fileSafeName(sources[0]?.name ?? 'PDF')

  const save = async (): Promise<void> => {
    if (!cards.length || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const bytes = await buildPdf(sourceBytes(), cards.map((c) => c.ref))
      const name = sources.length > 1 ? t('pdft.fileMerged') : t('pdft.fileEdited', { name: stem })
      const saved = await window.trame.saveExport(`data:application/pdf;base64,${await toBase64(bytes)}`, name)
      if (saved) setMessage({ text: t('pdft.saved', { path: saved }) })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const mode: SplitMode = split === 'each' ? { kind: 'each' } : { kind: 'every', n: every }
  const groups = splitGroups(cards.length, mode)

  const doSplit = async (): Promise<void> => {
    if (groups.length < 2 || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const names = groups.map((_, i) => partName(stem, i, groups.length))
      // le dossier est demandé AVANT l'assemblage : annuler ne coûte rien
      const picked = await window.trame.pickExportFolder(names, stem)
      if (!picked) return
      if (picked.existing.length && !(await window.trame.confirm(translate('xp.replace.title', { count: picked.existing.length }), translate('xp.replace.detail', { list: `${picked.existing.slice(0, 5).join(', ')}${picked.existing.length > 5 ? '…' : ''}` }), translate('xp.replace.button')))) return
      const bytes = sourceBytes()
      for (const [i, g] of groups.entries()) {
        setMessage({ text: t('pdft.working', { done: i, total: groups.length }) })
        const pdf = await buildPdf(bytes, g.map((k) => cards[k].ref))
        if (!(await window.trame.writeExportFile(picked.dir, names[i], `data:application/pdf;base64,${await toBase64(pdf)}`))) throw new Error(translate('xp.writeFailed', { name: names[i] }))
      }
      setMessage({ text: t('pdft.splitDone', { count: groups.length, dir: picked.dir }) })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('pdft.title')} data-pdft-dialog onKeyDown={(e) => e.stopPropagation()}>
      <div className="modal wide pdft">
        <h3>{t('pdft.title')}</h3>
        <p className="hint">{t('pdft.hint')}</p>
        <div className="row">
          <button data-action="pdft-add" disabled={busy} onClick={() => void add()}>{t('pdft.add')}</button>
          {sources.map((s) => (
            <span key={s.id} className="pdft-source" data-pdft-source>
              {t('pdft.source', { name: s.name, n: s.pages })}
              <button aria-label={t('pdft.removeSource', { name: s.name })} title={t('pdft.removeSource', { name: s.name })} disabled={busy} onClick={() => removeSource(s.id)}>✕</button>
            </span>
          ))}
        </div>

        {cards.length === 0 ? (
          <p className="hint" data-pdft-empty>{t('pdft.empty')}</p>
        ) : (
          <>
            <div className="row">
              <label className="pdft-range">
                {t('pdft.keep')}
                <input type="text" data-field="pdftRange" value={range} placeholder="1-3, 5" disabled={busy} onChange={(e) => setRange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && keep()} />
              </label>
              <button data-action="pdft-keep" disabled={busy || !range.trim()} onClick={keep}>{t('pdft.keepApply')}</button>
              <span className="hint" data-pdft-count>{t('pdft.count', { count: cards.length })}</span>
            </div>
            <div className="pdft-grid" data-pdft-grid>
              {cards.map((c, i) => (
                <div
                  key={c.id}
                  className={`pdft-card${dragFrom === i ? ' dragging' : ''}`}
                  data-pdft-card
                  draggable={!busy}
                  onDragStart={() => setDragFrom(i)}
                  onDragEnd={() => setDragFrom(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragFrom !== null) setCards((cs) => moveItem(cs, dragFrom, i))
                    setDragFrom(null)
                  }}
                >
                  <div className="pdft-thumb">
                    {c.thumb ? <img src={c.thumb} alt="" draggable={false} style={{ transform: `rotate(${c.ref.rotate}deg)`, ...(c.ref.rotate % 180 ? { maxWidth: 130, maxHeight: 100 } : {}) }} /> : <span className="hint">{i + 1}</span>}
                  </div>
                  <span className="pdft-label">{t('pdft.page', { name: nameOf(c.ref.src), n: c.ref.index + 1 })}</span>
                  <div className="pdft-actions">
                    <button aria-label={t('pdft.moveLeft')} title={t('pdft.moveLeft')} data-pdft="left" disabled={busy || i === 0} onClick={() => setCards((cs) => moveItem(cs, i, i - 1))}>◀</button>
                    <button aria-label={t('pdft.moveRight')} title={t('pdft.moveRight')} data-pdft="right" disabled={busy || i === cards.length - 1} onClick={() => setCards((cs) => moveItem(cs, i, i + 1))}>▶</button>
                    <button aria-label={t('pdft.rotateLeft')} title={t('pdft.rotateLeft')} data-pdft="rotate-left" disabled={busy} onClick={() => setCards((cs) => cs.map((x) => (x.id === c.id ? { ...x, ref: { ...x.ref, rotate: turn(x.ref.rotate, -90) } } : x)))}>↺</button>
                    <button aria-label={t('pdft.rotate')} title={t('pdft.rotate')} data-pdft="rotate" disabled={busy} onClick={() => setCards((cs) => cs.map((x) => (x.id === c.id ? { ...x, ref: { ...x.ref, rotate: turn(x.ref.rotate, 90) } } : x)))}>↻</button>
                    <button aria-label={t('pdft.remove')} title={t('pdft.remove')} data-pdft="remove" disabled={busy} onClick={() => setCards((cs) => cs.filter((x) => x.id !== c.id))}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="row">
              <button className="primary" data-action="pdft-save" disabled={busy} onClick={() => void save()}>{t('pdft.save')}</button>
              <select data-field="pdftSplit" aria-label={t('pdft.split')} value={split} disabled={busy} onChange={(e) => setSplit(e.target.value as 'each' | 'every')}>
                <option value="each">{t('pdft.split.each')}</option>
                <option value="every">{t('pdft.split.every')}</option>
              </select>
              {split === 'every' && <input type="number" data-field="pdftEvery" aria-label={t('pdft.split.every')} min={1} max={MAX_TOOL_PAGES} value={every} disabled={busy} onChange={(e) => setEvery(Math.max(1, Math.min(MAX_TOOL_PAGES, Math.round(Number(e.target.value)) || 1)))} style={{ width: 64 }} />}
              <button data-action="pdft-split" disabled={busy || groups.length < 2} title={t('pdft.split.title')} onClick={() => void doSplit()}>{t('pdft.splitButton', { count: groups.length })}</button>
            </div>
          </>
        )}
        <p className="hint">{t('pdft.note')}</p>
        {message && (
          <p className={message.error ? 'warn' : 'hint'} role={message.error ? 'alert' : 'status'} data-pdft-message={message.error ? 'error' : 'ok'}>
            {message.text}
          </p>
        )}
        <div className="row">
          <button data-action="pdft-close" disabled={busy} onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}
