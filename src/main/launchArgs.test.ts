import { describe, expect, it } from 'vitest'
import { projectFilesFromArgv } from './launchArgs'

describe('projectFilesFromArgv', () => {
  it('trouve les projets .trame, quelle que soit la casse', () => {
    expect(projectFilesFromArgv(['C:\\Trame\\Trame.exe', 'C:\\Docs\\Menu.trame', 'photo.png', 'AUTRE.TRAME'])).toEqual(['C:\\Docs\\Menu.trame', 'AUTRE.TRAME'])
  })
  it('ignore les options et les autres fichiers', () => {
    expect(projectFilesFromArgv(['/opt/Trame/trame', '--no-sandbox', '--flag=a.trame', '/tmp/x.json'])).toEqual([])
  })
  it('rien à ouvrir', () => {
    expect(projectFilesFromArgv([])).toEqual([])
  })
})
