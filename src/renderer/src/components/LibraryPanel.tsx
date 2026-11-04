import { useState } from 'react'
import { useT } from '@/i18n'
import { IconsPanel } from '@/components/IconsPanel'
import { IllustrationsPanel } from '@/components/IllustrationsPanel'

let lastMode: 'icons' | 'illustrations' = 'icons'

/** Onglet « Icônes » : les icônes (une couleur) et les illustrations (dessins en couleurs), au choix. */
export function LibraryPanel(): React.JSX.Element {
  const t = useT()
  const [mode, setMode] = useState(lastMode)
  const choose = (m: typeof mode): void => {
    lastMode = m
    setMode(m)
  }
  return (
    <>
      <div className="seg" role="group" aria-label={t('sidebar.icons')}>
        {(['icons', 'illustrations'] as const).map((m) => (
          <button key={m} type="button" className={mode === m ? 'active' : ''} aria-pressed={mode === m} data-library={m} onClick={() => choose(m)}>
            {t(m === 'icons' ? 'library.icons' : 'library.illustrations')}
          </button>
        ))}
      </div>
      {mode === 'icons' ? <IconsPanel /> : <IllustrationsPanel />}
    </>
  )
}
