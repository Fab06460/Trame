import { useCallback, useRef, useState } from 'react'
import { useDismiss } from './useDismiss'

export interface DropItem {
  key: string
  label: string
  hint?: string
  disabled?: boolean
  onSelect: () => unknown
}

/** Bouton à menu déroulant (même présentation que « Exporter » et « Importer »). */
export function DropMenu({ label, title, items, name, align = 'left' }: { label: string; title: string; items: DropItem[]; name: string; align?: 'left' | 'right' }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, root, close)

  return (
    <div className="export-menu" ref={root} data-menu={name}>
      <button aria-haspopup="menu" aria-expanded={open} title={title} onClick={() => setOpen((o) => !o)}>
        {label} ▾
      </button>
      {open && (
        <div className={`export-popup${align === 'left' ? ' left' : ''}`} role="menu" aria-label={label}>
          {items.map((it) => (
            <button
              key={it.key}
              role="menuitem"
              data-menu-item={it.key}
              disabled={it.disabled}
              onClick={() => {
                setOpen(false)
                void it.onSelect()
              }}
            >
              <strong>{it.label}</strong>
              {it.hint && <span>{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
