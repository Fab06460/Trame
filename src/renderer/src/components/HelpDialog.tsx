import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { helpContent, searchHelp, type HelpBlock } from '@shared/help'
import { ctrlNameFor, shortcutText } from '@shared/shortcuts'
import { isMac, useLocale, useT } from '@/i18n'
import { useHelp } from '@/store/help'
import { useTour } from '@/store/tour'

/** `**gras**` et `code` dans un texte d'aide ; les raccourcis sont déjà adaptés à la plateforme. */
function Inline({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>
      )}
    </>
  )
}

function Block({ block, sc }: { block: HelpBlock; sc: (s: string) => string }): React.JSX.Element {
  if ('p' in block) return <p><Inline text={sc(block.p)} /></p>
  if ('tip' in block) return <p className="help-tip"><Inline text={sc(block.tip)} /></p>
  if ('steps' in block) {
    return (
      <ol className="help-steps">
        {block.steps.map((s, i) => <li key={i}><Inline text={sc(s)} /></li>)}
      </ol>
    )
  }
  return (
    <dl className="help-keys">
      {block.keys.map(([keys, action], i) => (
        <Fragment key={i}>
          <dt><kbd>{sc(keys)}</kbd></dt>
          <dd><Inline text={sc(action)} /></dd>
        </Fragment>
      ))}
    </dl>
  )
}

function Dialog(): React.JSX.Element {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const wanted = useHelp((s) => s.topic)
  const [query, setQuery] = useState('')
  const articleRef = useRef<HTMLElement>(null)
  const [picked, setPicked] = useState<string | null>(wanted)
  const content = useMemo(() => helpContent(locale), [locale])
  const found = useMemo(() => searchHelp(content.topics, query), [content, query])
  const topic = found.find((x) => x.id === picked) ?? found[0] ?? null
  const sc = (s: string): string => shortcutText(s, isMac, ctrlNameFor(locale))
  const close = (): void => useHelp.getState().setOpen(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    articleRef.current?.scrollTo({ top: 0 })
  }, [topic?.id])

  const nav = (list: typeof found): React.JSX.Element[] =>
    list.map((x) => (
      <button key={x.id} className={`help-nav-item${topic?.id === x.id ? ' active' : ''}`} data-help-topic={x.id} aria-current={topic?.id === x.id ? 'true' : undefined} onClick={() => setPicked(x.id)}>
        {x.title}
      </button>
    ))

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('help.dialog.title')} data-help-dialog onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal help-dialog">
        <div className="help-head">
          <h3>{t('help.dialog.title')}</h3>
          <input
            type="search"
            className="text-field"
            data-field="help-search"
            autoFocus
            value={query}
            placeholder={t('help.search')}
            aria-label={t('help.search')}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button data-action="help-close" onClick={close}>{t('common.close')}</button>
        </div>
        <div className="help-body">
          <nav className="help-nav" aria-label={t('help.dialog.title')}>
            {query.trim() ? (
              found.length ? nav(found) : <p className="hint">{t('help.empty')}</p>
            ) : (
              content.groups.map((g) => (
                <Fragment key={g.id}>
                  <h4>{g.title}</h4>
                  {nav(found.filter((x) => x.group === g.id))}
                </Fragment>
              ))
            )}
          </nav>
          <article className="help-article" ref={articleRef} data-help-article={topic?.id}>
            {topic && (
              <>
                <h2>{topic.title}</h2>
                {topic.body.map((b, i) => <Block key={i} block={b} sc={sc} />)}
              </>
            )}
          </article>
        </div>
        <div className="help-foot">
          {locale !== 'fr' && <span className="hint">{t('help.french')}</span>}
          <span className="spacer" />
          <button
            data-action="tour-start"
            onClick={() => {
              close()
              useTour.getState().start()
            }}
          >
            {t('help.tour')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function HelpDialog(): React.JSX.Element | null {
  const open = useHelp((s) => s.open)
  return open ? <Dialog /> : null
}
