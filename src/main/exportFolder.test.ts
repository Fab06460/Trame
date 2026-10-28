import { describe, expect, it } from 'vitest'
import { safeExportName } from './exportFolder'

describe('safeExportName', () => {
  it('accepte un nom de fichier image ordinaire', () => {
    for (const n of ['Affiche-page-1.png', 'Mon design-page-02.jpg', 'été 2026 (v2).svg', 'A.SVG']) expect(safeExportName(n)).toBe(n)
  })
  it('refuse les chemins et les remontées de dossier', () => {
    for (const n of ['../x.png', 'a/b.png', '/etc/x.png', 'a\\b.png', '..', '.png', '.hidden.png']) expect(safeExportName(n)).toBeNull()
  })
  it('refuse les extensions non images et les noms invalides', () => {
    for (const n of ['x.exe', 'x.sh', 'x', 'x.', '', 'a:b.png', 'a|b.png', 'a\u0000b.png', 'x'.repeat(200) + '.png', 12, null, undefined]) expect(safeExportName(n)).toBeNull()
  })
})
