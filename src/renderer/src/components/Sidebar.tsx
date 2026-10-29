import { useCallback, useEffect, useState } from 'react'
import type { RecentProject } from '../../../preload'
import { useEditor } from '@/store/editor'
import { SHAPES } from '@/shapes'
import { TEMPLATES, previewPage, templateCategory, templateName } from '@/templates'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'
import { useTemplates } from '@/store/templates'
import { applyBuiltinTemplate, hideBuiltinTemplate, renameBuiltinTemplate, restoreHiddenTemplates } from '@/userTemplateActions'
import { TemplateCard } from './TemplateCard'
import { PageThumb } from './PageThumb'
import { RecentsPanel } from './RecentsPanel'
import { PhotosPanel } from './PhotosPanel'
import { BrandPanel } from './BrandPanel'
import { LayersPanel } from './LayersPanel'
import { UserTemplates } from './UserTemplates'
import { LanguageSelect } from './LanguageSelect'
import { AiPanel } from './AiPanel'

type Tab = 'recents' | 'templates' | 'elements' | 'layers' | 'brand' | 'photos' | 'ai'

const TEXT_PRESETS = [
  { label: 'sidebar.preset.title', fontSize: 110, fontStyle: 'bold', text: 'sidebar.preset.title' },
  { label: 'sidebar.preset.subtitle', fontSize: 56, fontStyle: 'bold', text: 'sidebar.preset.subtitle' },
  { label: 'sidebar.preset.body', fontSize: 34, fontStyle: 'normal', text: 'sidebar.preset.bodyText' }
] as const

export function Sidebar(): React.JSX.Element {
  const t = useT()
  const [tab, setTab] = useState<Tab>('templates')
  const [recents, setRecents] = useState<RecentProject[]>([])
  const { addElement } = useEditor.getState()
  const userTemplates = useTemplates((s) => s.user)
  const hidden = useTemplates((s) => s.hidden)
  const filePath = useEditor((s) => s.filePath)

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
      <div className="tabs">
        <button className={tab === 'recents' ? 'active' : ''} onClick={() => setTab('recents')}>{t('sidebar.recents')}</button>
        <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>{t('sidebar.templates')}</button>
        <button className={tab === 'elements' ? 'active' : ''} onClick={() => setTab('elements')}>{t('sidebar.elements')}</button>
        <button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}>{t('sidebar.layers')}</button>
        <button className={tab === 'brand' ? 'active' : ''} onClick={() => setTab('brand')}>{t('sidebar.brand')}</button>
        <button className={tab === 'photos' ? 'active' : ''} onClick={() => setTab('photos')}>{t('sidebar.photos')}</button>
        <button className={tab === 'ai' ? 'active' : ''} data-tab="ai" onClick={() => setTab('ai')}>{t('ai.tab')}</button>
      </div>

      {tab === 'layers' && <LayersPanel />}

      {tab === 'brand' && <BrandPanel />}

      {tab === 'photos' && <PhotosPanel />}

      {tab === 'ai' && <AiPanel />}

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
                  thumb={<PageThumb page={previewPage(tpl.pages[0])} width={tpl.width} height={tpl.height} maxW={110} maxH={110} />}
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
        </>
      )}
      <LanguageSelect />
    </aside>
  )
}
