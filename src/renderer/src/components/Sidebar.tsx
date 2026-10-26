import { useCallback, useEffect, useState } from 'react'
import type { RecentProject } from '../../../preload'
import { useEditor } from '@/store/editor'
import { SHAPES } from '@/shapes'
import { TEMPLATES, previewPage } from '@/templates'
import { useTemplates } from '@/store/templates'
import { applyBuiltinTemplate, hideBuiltinTemplate, renameBuiltinTemplate, restoreHiddenTemplates } from '@/userTemplateActions'
import { TemplateCard } from './TemplateCard'
import { PageThumb } from './PageThumb'
import { RecentsPanel } from './RecentsPanel'
import { BrandPanel } from './BrandPanel'
import { LayersPanel } from './LayersPanel'
import { UserTemplates } from './UserTemplates'

type Tab = 'recents' | 'templates' | 'elements' | 'layers' | 'brand'

const TEXT_PRESETS = [
  { label: 'Titre', fontSize: 110, fontStyle: 'bold', text: 'Titre' },
  { label: 'Sous-titre', fontSize: 56, fontStyle: 'bold', text: 'Sous-titre' },
  { label: 'Corps de texte', fontSize: 34, fontStyle: 'normal', text: 'Ajoutez votre texte ici' }
]

export function Sidebar(): React.JSX.Element {
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
  const replaced = new Set(userTemplates.map((t) => t.basedOn).filter(Boolean))
  const shown = TEMPLATES.filter((t) => !hidden.includes(t.id) && !replaced.has(t.id))
  const categories = [...new Set(shown.map((t) => t.category))]

  return (
    <aside className="sidebar">
      <div className="tabs">
        <button className={tab === 'recents' ? 'active' : ''} onClick={() => setTab('recents')}>Récents</button>
        <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>Modèles</button>
        <button className={tab === 'elements' ? 'active' : ''} onClick={() => setTab('elements')}>Éléments</button>
        <button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}>Calques</button>
        <button className={tab === 'brand' ? 'active' : ''} onClick={() => setTab('brand')}>Marque</button>
      </div>

      {tab === 'layers' && <LayersPanel />}

      {tab === 'brand' && <BrandPanel />}

      {tab === 'recents' && <RecentsPanel items={recents} refresh={refreshRecents} />}

      {tab === 'templates' && <UserTemplates />}

      {tab === 'templates' &&
        categories.map((c) => (
          <section key={c}>
            <h3>{c}</h3>
            <div className="grid">
              {shown.filter((t) => t.category === c).map((t) => (
                <TemplateCard
                  key={t.id}
                  id={t.id}
                  kind="builtin"
                  name={t.name}
                  suffix={t.pages.length > 1 ? ` · ${t.pages.length} p.` : undefined}
                  thumb={<PageThumb page={previewPage(t.pages[0])} width={t.width} height={t.height} maxW={110} maxH={110} />}
                  onOpen={() => void applyBuiltinTemplate(t.id)}
                  onRename={(n) => void renameBuiltinTemplate(t.id, n)}
                  onRemove={() => void hideBuiltinTemplate(t.id)}
                  renameTitle="Renommer : crée votre version personnalisée de ce modèle (dans « Mes modèles »)"
                  removeTitle="Masquer ce modèle (restaurable)"
                />
              ))}
            </div>
          </section>
        ))}

      {tab === 'templates' && hidden.length > 0 && (
        <button className="link" onClick={() => void restoreHiddenTemplates()}>
          Restaurer les modèles masqués ({hidden.length})
        </button>
      )}

      {tab === 'elements' && (
        <>
          <section>
            <h3>Texte</h3>
            <div className="stack">
              {TEXT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className="text-preset"
                  style={{ fontSize: Math.min(p.fontSize / 3.5, 28), fontWeight: p.fontStyle === 'bold' ? 700 : 400 }}
                  onClick={() => addElement({ type: 'text', text: p.text, fontSize: p.fontSize, fontStyle: p.fontStyle, height: p.fontSize * 1.2 })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Formes</h3>
            <div className="grid shapes">
              <button className="shape" title="Rectangle" onClick={() => addElement({ type: 'rect' })}>
                <svg viewBox="0 0 100 100"><rect x="8" y="22" width="84" height="56" fill="currentColor" /></svg>
              </button>
              <button className="shape" title="Rectangle arrondi" onClick={() => addElement({ type: 'rect', cornerRadius: 40 })}>
                <svg viewBox="0 0 100 100"><rect x="8" y="22" width="84" height="56" rx="14" fill="currentColor" /></svg>
              </button>
              <button className="shape" title="Cercle" onClick={() => addElement({ type: 'ellipse' })}>
                <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="currentColor" /></svg>
              </button>
              <button className="shape" title="Ligne" onClick={() => addElement({ type: 'rect', width: 500, height: 8, fill: '#1e1f24' })}>
                <svg viewBox="0 0 100 100"><rect x="6" y="46" width="88" height="8" fill="currentColor" /></svg>
              </button>
              {SHAPES.map((s) => (
                <button key={s.id} className="shape" title={s.name} onClick={() => addElement({ type: 'path', path: s.path })}>
                  <svg viewBox="0 0 100 100"><path d={s.path} fill="currentColor" /></svg>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </aside>
  )
}
