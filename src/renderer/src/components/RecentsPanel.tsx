import { useEffect, useState } from 'react'
import type { RecentProject } from '../../../preload'
import { formatRelative } from '@/formatDate'
import { openRecent } from '@/fileActions'
import { useEditor } from '@/store/editor'
import { useT } from '@/i18n'

export function RecentsPanel({ items, refresh }: { items: RecentProject[]; refresh: () => void }): React.JSX.Element {
  const t = useT()
  const currentPath = useEditor((s) => s.filePath)
  const [busy, setBusy] = useState(false)

  useEffect(() => refresh(), [refresh])

  if (items.length === 0) {
    return <p className="empty">{t('recents.empty')}</p>
  }

  const open = async (path: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await openRecent(path)
    } finally {
      setBusy(false)
      refresh()
    }
  }

  return (
    <>
      <ul className="recents">
        {items.map((r) => (
          <li key={r.path} className={r.modified === null ? 'missing' : r.path === currentPath ? 'current' : ''}>
            <button className="recent-open" onClick={() => open(r.path)} title={r.path}>
              <span className="recent-name">{r.name}</span>
              <span className="recent-meta">
                {r.modified === null ? t('recents.missing') : formatRelative(r.modified)} · {r.dir}
              </span>
            </button>
            <button
              className="recent-remove"
              title={t('recents.remove')}
              onClick={() => window.trame.removeRecent(r.path).then(refresh)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button className="link" onClick={() => window.trame.clearRecents().then(refresh)}>
        {t('recents.clear')}
      </button>
    </>
  )
}
