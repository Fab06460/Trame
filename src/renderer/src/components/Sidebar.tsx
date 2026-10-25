import { useCallback, useEffect, useState } from 'react'
import type { RecentProject } from '../../../preload'
import { useEditor } from '@/store/editor'
import { confirmUnsaved } from '@/fileActions'
import { SHAPES } from '@/shapes'
import { TEMPLATES, instantiate, previewPage } from '@/templates'
import { PageThumb } from './PageThumb'
import { RecentsPanel } from './RecentsPanel'

type Tab = 'recents' | 'templates' | 'elements'

const TEXT_PRESETS = [
  { label: 'Titre', fontSize: 110, fontStyle: 'bold', text: 'Titre' },
  { label: 'Sous-titre', fontSize: 56, fontStyle: 'bold', text: 'Sous-titre' },
  { label: 'Corps de texte', fontSize: 34, fontStyle: 'normal', text: 'Ajoutez votre texte ici' }
]

export function Sidebar(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('templates')
  const [recents, setRecents] = useState<RecentProject[]>([])
  const { addElement, loadDocument } = useEditor.getState()
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

  const applyTemplate = async (id: string): Promise<void> => {
    const t = TEMPLATES.find((x) => x.id === id)!
    if (await confirmUnsaved('remplacer ce design par un modèle')) loadDocument(instantiate(t))
  }

  const categories = [...new Set(TEMPLATES.map((t) => t.category))]

  return (
    <aside className="sidebar">
      <div className="tabs">
        <button className={tab === 'recents' ? 'active' : ''} onClick={() => setTab('recents')}>Récents</button>
        <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>Modèles</button>
        <button className={tab === 'elements' ? 'active' : ''} onClick={() => setTab('elements')}>Éléments</button>
      </div>

      {tab === 'recents' && <RecentsPanel items={recents} refresh={refreshRecents} />}

      {tab === 'templates' &&
        categories.map((c) => (
          <section key={c}>
            <h3>{c}</h3>
            <div className="grid">
              {TEMPLATES.filter((t) => t.category === c).map((t) => (
                <button key={t.id} className="card" onClick={() => applyTemplate(t.id)} title={t.name}>
                  <PageThumb page={previewPage(t.pages[0])} width={t.width} height={t.height} maxW={110} maxH={110} />
                  <span>{t.name}{t.pages.length > 1 ? ` · ${t.pages.length} p.` : ''}</span>
                </button>
              ))}
            </div>
          </section>
        ))}

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
