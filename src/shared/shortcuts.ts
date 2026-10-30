/**
 * Les textes de l'interface notent les raccourcis à la façon de macOS (⌘N, ⇧⌘S, ⌘⌥3). Sous Windows et Linux, la même touche s'appelle
 * Ctrl (Strg en allemand) et les symboles ne se lisent pas : on les remplace à l'affichage (« Ctrl+Shift+S »), sans toucher aux catalogues.
 */
export function shortcutText(text: string, mac: boolean, ctrlName = 'Ctrl'): string {
  if (mac || !/[⇧⌥⌘]/.test(text)) return text
  return text.replace(/[⇧⌥⌘]+/g, (mods, offset: number, whole: string) => {
    const names = [mods.includes('⌘') ? ctrlName : '', mods.includes('⌥') ? 'Alt' : '', mods.includes('⇧') ? 'Shift' : ''].filter(Boolean)
    const next = whole[offset + mods.length]
    // « maintenir ⌘ pour » → « maintenir Ctrl pour » ; « (⌘N) » → « (Ctrl+N) »
    return names.join('+') + (next && !/[\s),.;:]/.test(next) ? '+' : '')
  })
}

/** Nom de la touche de commande selon la langue de l'interface. */
export const ctrlNameFor = (locale: string): string => (locale === 'de' ? 'Strg' : 'Ctrl')
