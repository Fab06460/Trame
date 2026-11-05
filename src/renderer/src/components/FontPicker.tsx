import { useEffect, useMemo, useRef, useState } from 'react'
import { fontGroups } from '@/fontPicker'
import { SYSTEM_FONT, type FontDef } from '@/fonts'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'

/**
 * Sélecteur de police : chaque nom s'affiche dans sa propre police (le menu natif de macOS ignore le style des options), avec
 * recherche et groupes ; les polices du kit de marque sont en tête. Le bouton garde `data-field="fontFamily"`.
 */
export function FontPicker({
  value = '',
  fonts,
  kitFamilies,
  onChange,
  onMore
}: {
  value?: string
  fonts: FontDef[]
  kitFamilies: string[]
  onChange: (family: string) => void
  onMore: () => void
}): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, maxHeight: 320 })
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => fontGroups(fonts, kitFamilies, query), [fonts, kitFamilies, query])
  const flat = useMemo(() => groups.flatMap((g) => g.fonts), [groups])
  const current = fonts.find((f) => f.family === value)
  const label = current
    ? current.name
    : value === SYSTEM_FONT
      ? t('prop.font.system')
      : t('prop.font.missing', { name: (value ?? '').split(',')[0].replace(/"/g, '') })

  const close = (): void => {
    setOpen(false)
    setQuery('')
    button.current?.focus()
  }
  const pick = (family: string): void => {
    onChange(family)
    close()
  }
  const show = (): void => {
    const r = button.current!.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    // sous le bouton s'il y a la place, sinon au-dessus
    const up = below < 240 && above > below
    const maxHeight = Math.min(360, up ? above : below)
    setBox({ left: r.left, top: up ? r.top - maxHeight - 4 : r.bottom + 4, width: r.width, maxHeight })
    setActive(Math.max(0, fonts.findIndex((f) => f.family === value)))
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent): void => {
      const target = e.target as Node
      if (!list.current?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  useEffect(() => {
    if (open) list.current?.querySelector('[data-font-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, active, query])

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.min(Math.max(a + (e.key === 'ArrowDown' ? 1 : -1), 0), flat.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flat[active]) pick(flat[active].family)
    }
  }

  let index = -1
  return (
    <>
      <button
        ref={button}
        type="button"
        className="font-picker"
        data-field="fontFamily"
        data-value={value}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ fontFamily: value }}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            show()
          }
        }}
      >
        <span>{label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div ref={list} className="font-list" data-font-list style={box} onKeyDown={onKey}>
          <input autoFocus type="search" data-field="fontQuery" placeholder={t('font.search.placeholder')} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0) }} />
          <div role="listbox" aria-label={t('prop.font')}>
            {groups.map((g) => (
              <div key={g.id} role="group" data-font-group={g.id} aria-label={t(`font.group.${g.id}` as MessageKey)}>
                <div className="font-group-label">{t(`font.group.${g.id}` as MessageKey)}</div>
                {g.fonts.map((f) => {
                  index++
                  const i = index
                  return (
                    <div
                      key={f.name}
                      role="option"
                      aria-selected={f.family === value}
                      className={`font-option${i === active ? ' active' : ''}${f.family === value ? ' selected' : ''}`}
                      data-font-option={f.family}
                      data-font-active={i === active}
                      style={{ fontFamily: f.family }}
                      onPointerEnter={() => setActive(i)}
                      onClick={() => pick(f.family)}
                    >
                      {f.name}
                    </div>
                  )
                })}
              </div>
            ))}
            {flat.length === 0 && <div className="font-none">{t('font.none')}</div>}
          </div>
          <button
            type="button"
            className="font-more"
            data-font-more
            onClick={() => {
              close()
              onMore()
            }}
          >
            {t('prop.font.more')}
          </button>
        </div>
      )}
    </>
  )
}
