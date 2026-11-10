import { useCallback, useEffect, useState } from 'react'
import type { RecentProject } from '../../../preload'
import { useEditor } from '@/store/editor'
import { BUBBLES } from '@/bubbles'
import { insertBubble } from '@/bubbleActions'
import { SHAPES } from '@/shapes'
import { useWordCloud } from '@/store/wordCloud'
import { TEMPLATES, previewPage, templateCategory, templateName } from '@/templates'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'
import { useTemplates } from '@/store/templates'
import { applyBuiltinTemplate, hideBuiltinTemplate, renameBuiltinTemplate, restoreHiddenTemplates } from '@/userTemplateActions'
import { TemplateCard } from './TemplateCard'
import { PageThumb } from './PageThumb'
import { RecentsPanel } from './RecentsPanel'
import { PhotosTab } from './PhotosTab'
import { LibraryPanel } from './LibraryPanel'
import { BrandPanel } from './BrandPanel'
import { LayersPanel } from './LayersPanel'
import { UserTemplates } from './UserTemplates'
import { SettingsMenu } from './SettingsMenu'
import { AiPanel } from './AiPanel'
import { AccessibilityPanel } from './AccessibilityPanel'
import { ReviewPanel } from './ReviewPanel'
import { openCount } from '@/review'
import { accessibilityIssues } from '@/accessibility'
import { useSidebar, type SidebarTab } from '@/store/sidebar'
import { SideIcon } from './SideIcons'
import { imagesMissingAlt } from '@/altCheck'
import { CHART_KINDS, insertChart } from '@/chartActions'
import { insertQr } from '@/qrActions'
import { useSignature } from '@/store/signature'
import { clipResultMessage, insertClipFromFile } from '@/clipActions'
import { SpellPanel } from '@/components/SpellPanel'
import { issueCount } from '@/spellScan'
import { useSpell } from '@/store/spell'


/** Colonne d'onglets : trois groupes séparés par un filet (le projet, la création, le document). */
const TAB_GROUPS: Array<Array<{ id: SidebarTab; label: MessageKey }>> = [
  [{ id: 'recents', label: 'sidebar.recents' }, { id: 'templates', label: 'sidebar.templates' }],
  [{ id: 'elements', label: 'sidebar.elements' }, { id: 'icons', label: 'sidebar.icons' }, { id: 'photos', label: 'sidebar.photos' }, { id: 'ai', label: 'ai.tab' }],
  [{ id: 'layers', label: 'sidebar.layers' }, { id: 'brand', label: 'sidebar.brand' }, { id: 'a11y', label: 'a11y.tab' }, { id: 'spell', label: 'spell.tab' }, { id: 'review', label: 'review.tab' }]
]
const TAB_ORDER = TAB_GROUPS.flat().map((x) => x.id)

const TEXT_PRESETS = [
  { label: 'sidebar.preset.title', fontSize: 110, fontStyle: 'bold', text: 'sidebar.preset.title' },
  { label: 'sidebar.preset.subtitle', fontSize: 56, fontStyle: 'bold', text: 'sidebar.preset.subtitle' },
  { label: 'sidebar.preset.body', fontSize: 34, fontStyle: 'normal', text: 'sidebar.preset.bodyText' }
] as const

export function Sidebar(): React.JSX.Element {
  const t = useT()
  const tab = useSidebar((s) => s.tab)
  const setTab = useSidebar((s) => s.setTab)
  const [recents, setRecents] = useState<RecentProject[]>([])
  const { addElement } = useEditor.getState()
  const userTemplates = useTemplates((s) => s.user)
  const hidden = useTemplates((s) => s.hidden)
  const filePath = useEditor((s) => s.filePath)
  const missingAlt = useEditor((s) => imagesMissingAlt(s.doc).length)
  const a11yIssues = useEditor((s) => accessibilityIssues(s.doc).length)
  const openComments = useEditor((s) => openCount(s.doc))
  const spellIssues = useSpell((s) => issueCount(s.issues))

  const refreshRecents = useCallback((): void => {
    window.trame.listRecents().then(setRecents, () => setRecents([]))
  }, [])

  // Au démarrage, on ouvre l'onglet Récents s'il y a quelque chose à y voir
  useEffect(() => {
    window.trame.listRecents().then((list) => {
      setRecents(list)
      if (list.length > 0) setTab('recents')
    }, () => {})
  }, [])

  // Un enregistrement ou une ouverture met la liste à jour
  useEffect(refreshRecents, [filePath, refreshRecents])

  useEffect(() => {
    void useTemplates.getState().refresh()
  }, [])

  // Modèles intégrés affichés : ni masqués, ni remplacés par une version personnalisée (qui est alors dans « Mes modèles »)
  const replaced = new Set(userTemplates.map((u) => u.basedOn).filter(Boolean))
  const shown = TEMPLATES.filter((tpl) => !hidden.includes(tpl.id) && !replaced.has(tpl.id))
  const categories = [...new Set(shown.map((t) => t.category))]

  return (
    <aside className="sidebar">
      <div className="side-rail">
      <div
        className="tabs side-tabs"
        role="tablist"
        aria-orientation="vertical"
        aria-label={t('sidebar.tabs')}
        onKeyDown={(e) => {
          // flèches haut / bas, Début / Fin : on passe d'un onglet à l'autre (le focus suit)
          const move = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? 'first' : e.key === 'End' ? 'last' : 0
          if (!move) return
          e.preventDefault()
          const at = TAB_ORDER.indexOf(tab)
          const next = move === 'first' ? 0 : move === 'last' ? TAB_ORDER.length - 1 : (at + move + TAB_ORDER.length) % TAB_ORDER.length
          setTab(TAB_ORDER[next])
          const rail = e.currentTarget // React vide currentTarget à la fin du gestionnaire
          requestAnimationFrame(() => rail.querySelector<HTMLElement>(`[data-tab="${TAB_ORDER[next]}"]`)?.focus())
        }}
      >
        {TAB_GROUPS.map((group, i) => (
          <div key={i} className="side-group" role="presentation">
            {group.map((x) => (
              <button
                key={x.id}
                role="tab"
                id={`side-tab-${x.id}`}
                aria-selected={tab === x.id}
                aria-controls="side-panel"
                tabIndex={tab === x.id ? 0 : -1}
                className={`side-tab${tab === x.id ? ' active' : ''}`}
                data-tab={x.id}
                title={x.id === 'ai' && missingAlt > 0 ? `${t(x.label)} · ${t('altAudit.missing', { count: missingAlt })}` : x.id === 'a11y' && a11yIssues > 0 ? `${t(x.label)} · ${t('a11y.summary', { count: a11yIssues })}` : x.id === 'review' && openComments > 0 ? `${t(x.label)} · ${t('review.summary.open', { count: openComments })}` : x.id === 'spell' && spellIssues > 0 ? `${t(x.label)} · ${t('spell.count', { count: spellIssues })}` : t(x.label)}
                onClick={() => setTab(x.id)}
              >
                <SideIcon tab={x.id} />
                {x.id === 'ai' && missingAlt > 0 && <span className="side-dot" data-side-alert="ai" aria-hidden="true" />}
                {x.id === 'a11y' && a11yIssues > 0 && <span className="side-dot" data-side-alert="a11y" aria-hidden="true" />}
                {x.id === 'spell' && spellIssues > 0 && <span className="side-dot" data-side-alert="spell" aria-hidden="true" />}
                {x.id === 'review' && openComments > 0 && <span className="side-dot" data-side-alert="review" aria-hidden="true" />}
                <span className="side-label">{t(x.label)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <SettingsMenu />
      </div>

      <div className="side-content" id="side-panel" role="tabpanel" aria-labelledby={`side-tab-${tab}`}>

      {tab === 'layers' && <LayersPanel />}

      {tab === 'brand' && <BrandPanel />}

      {tab === 'photos' && <PhotosTab />}

      {tab === 'icons' && <LibraryPanel />}

      {tab === 'ai' && <AiPanel />}

      {tab === 'a11y' && <AccessibilityPanel />}
      {tab === 'spell' && <SpellPanel />}
      {tab === 'review' && <ReviewPanel />}

      {tab === 'recents' && <RecentsPanel items={recents} refresh={refreshRecents} />}

      {tab === 'templates' && <UserTemplates />}

      {tab === 'templates' &&
        categories.map((c) => (
          <section key={c}>
            <h3>{templateCategory({ category: c })}</h3>
            <div className="grid">
              {shown.filter((tpl) => tpl.category === c).map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  id={tpl.id}
                  kind="builtin"
                  name={templateName(tpl)}
                  suffix={tpl.pages.length > 1 ? t('tpl.pagesSuffix', { count: tpl.pages.length }) : undefined}
                  thumb={<PageThumb page={previewPage(tpl.pages[0], tpl)} width={tpl.width} height={tpl.height} maxW={110} maxH={110} />}
                  onOpen={() => void applyBuiltinTemplate(tpl.id)}
                  onRename={(n) => void renameBuiltinTemplate(tpl.id, n)}
                  onRemove={() => void hideBuiltinTemplate(tpl.id)}
                  renameTitle={t('tpl.rename.builtin')}
                  removeTitle={t('tpl.hide.title')}
                />
              ))}
            </div>
          </section>
        ))}

      {tab === 'templates' && hidden.length > 0 && (
        <button className="link" onClick={() => void restoreHiddenTemplates()}>
          {t('tpl.restoreHidden', { count: hidden.length })}
        </button>
      )}

      {tab === 'elements' && (
        <>
          <section>
            <h3>{t('sidebar.text')}</h3>
            <div className="stack">
              {TEXT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className="text-preset"
                  style={{ fontSize: Math.min(p.fontSize / 3.5, 28), fontWeight: p.fontStyle === 'bold' ? 700 : 400 }}
                  onClick={() => addElement({ type: 'text', text: t(p.text), fontSize: p.fontSize, fontStyle: p.fontStyle, height: p.fontSize * 1.2 }, { edit: true })}
                >
                  {t(p.label)}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>{t('sidebar.shapes')}</h3>
            <div className="grid shapes">
              <button className="shape" title={t('sidebar.shape.rect')} onClick={() => addElement({ type: 'rect' })}>
                <svg viewBox="0 0 100 100"><rect x="8" y="22" width="84" height="56" fill="currentColor" /></svg>
              </button>
              <button className="shape" title={t('sidebar.shape.rounded')} onClick={() => addElement({ type: 'rect', cornerRadius: 40 })}>
                <svg viewBox="0 0 100 100"><rect x="8" y="22" width="84" height="56" rx="14" fill="currentColor" /></svg>
              </button>
              <button className="shape" title={t('sidebar.shape.circle')} onClick={() => addElement({ type: 'ellipse' })}>
                <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="currentColor" /></svg>
              </button>
              <button className="shape" title={t('sidebar.shape.line')} onClick={() => addElement({ type: 'rect', width: 500, height: 8, fill: '#1e1f24' })}>
                <svg viewBox="0 0 100 100"><rect x="6" y="46" width="88" height="8" fill="currentColor" /></svg>
              </button>
              {SHAPES.map((s) => (
                <button key={s.id} className="shape" title={t(`shape.${s.id}` as MessageKey)} onClick={() => addElement({ type: 'path', path: s.path })}>
                  <svg viewBox="0 0 100 100"><path d={s.path} fill="currentColor" /></svg>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>{t('bubble.section')}</h3>
            <div className="grid shapes">
              {BUBBLES.map((b) => (
                <button key={b.id} className="shape" data-bubble={b.id} title={t(`bubble.kind.${b.id}` as MessageKey)} onClick={() => insertBubble(b.id)}>
                  <svg viewBox="0 0 100 100"><path d={b.path} fill="currentColor" /></svg>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>{t('cloud.section')}</h3>
            <button data-action="cloud-open" title={t('cloud.open.title')} onClick={() => useWordCloud.getState().setOpen(true)}>{t('cloud.open')}</button>
          </section>

          <section>
            <h3>{t('chart.section')}</h3>
            <div className="chart-kinds">
              {CHART_KINDS.map((k) => (
                <button key={k} data-chart-kind={k} title={t('chart.insert', { kind: t(`chart.kind.${k}` as MessageKey) })} onClick={() => insertChart(k)}>
                  {t(`chart.kind.${k}` as MessageKey)}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>{t('qr.section')}</h3>
            <button data-action="qr-insert" title={t('qr.insert.title')} onClick={insertQr}>{t('qr.insert')}</button>
          </section>

          <section>
            <h3>{t('clip.section')}</h3>
            <button
              data-action="clip-insert"
              title={t('clip.insert.title')}
              onClick={() =>
                void insertClipFromFile().then((r) => {
                  const message = clipResultMessage(r)
                  if (message) void window.trame.showInfo(t('clip.section'), t(message))
                })
              }
            >
              {t('clip.insert')}
            </button>
          </section>

          <section>
            <h3>{t('sig.section')}</h3>
            <button data-action="signature-open" title={t('sig.open.title')} onClick={() => useSignature.getState().setOpen(true)}>{t('sig.open')}</button>
          </section>
        </>
      )}
      </div>
    </aside>
  )
}
