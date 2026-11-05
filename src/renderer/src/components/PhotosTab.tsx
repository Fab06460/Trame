import { useState } from 'react'
import { useT } from '@/i18n'
import { MediaPanel } from '@/components/MediaPanel'
import { PhotosPanel } from '@/components/PhotosPanel'

let lastMode: 'online' | 'library' = 'online'

/** Onglet « Photos » : la recherche en ligne (sur demande) ou la bibliothèque locale (un dossier d'images). */
export function PhotosTab(): React.JSX.Element {
  const t = useT()
  const [mode, setMode] = useState(lastMode)
  const choose = (m: typeof mode): void => {
    lastMode = m
    setMode(m)
  }
  return (
    <>
      <div className="seg" role="group" aria-label={t('sidebar.photos')}>
        {(['online', 'library'] as const).map((m) => (
          <button key={m} type="button" className={mode === m ? 'active' : ''} aria-pressed={mode === m} data-photos-mode={m} onClick={() => choose(m)}>
            {t(m === 'online' ? 'media.mode.online' : 'media.mode.library')}
          </button>
        ))}
      </div>
      {mode === 'online' ? <PhotosPanel /> : <MediaPanel />}
    </>
  )
}
