import { extname } from 'node:path'

/**
 * Windows et Linux ne préviennent pas par `open-file` comme macOS : un double-clic sur un `.trame` lance `Trame fichier.trame`, et si
 * l'application tourne déjà, la seconde instance transmet sa ligne de commande. On y cherche les projets (les options `--…` d'Electron
 * et de Chromium sont ignorées).
 */
export function projectFilesFromArgv(argv: readonly string[]): string[] {
  return argv.filter((a) => typeof a === 'string' && !a.startsWith('-') && extname(a).toLowerCase() === '.trame')
}
