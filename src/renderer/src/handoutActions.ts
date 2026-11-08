import { createTextNode } from '@/exportPages'
import type { Measure } from '@/handout'
import type { TrameElement } from '@/types'

/** Hauteur d'un texte de notes mesurée comme à l'écran et dans l'export PDF (même nœud Konva, même police). */
export const measureNotes: Measure = (text, fontSize, width) =>
  createTextNode({ text, width, fontSize, fontFamily: '"Inter", sans-serif', fontStyle: 'normal', align: 'left', lineHeight: 1.35 } as TrameElement).height()
