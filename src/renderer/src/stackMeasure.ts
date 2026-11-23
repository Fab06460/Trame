import { createTextNode } from '@/exportPages'
import type { Measure } from '@/stackLayout'

/** Taille d'un élément telle que l'éditeur la dessine : un texte a la hauteur de son contenu (mesurée par le moteur de texte de Konva), les autres leur boîte. */
export const measureElement: Measure = (e) => (e.type === 'text' ? { width: e.width, height: createTextNode(e).height() } : { width: e.width, height: e.height })
