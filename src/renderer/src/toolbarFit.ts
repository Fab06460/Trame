/**
 * Barre d'outils sur une seule ligne : quand la place manque, les boutons se replient par paliers (« tiers ») dans des menus.
 * Palier 0 : tout est visible ; 1 : les formes passent dans « Ajouter ▾ » ; 2 : fichier (Nouveau, Ouvrir, Importer, Enregistrer sous)
 * dans « Fichier ▾ » ; 3 : le nom du document disparaît ; 4 : « ▶ » seul, sans le nom de l'application.
 */
export const MAX_TIER = 4

export interface FitState {
  tier: number
  /** largeur naturelle du contenu à chaque palier où il a débordé (sert à savoir quand on peut redescendre sans osciller) */
  natural: number[]
}

/**
 * Un pas d'ajustement. `clientWidth` : largeur disponible ; `scrollWidth` : largeur du contenu (supérieure si ça déborde).
 * Monte d'un palier si ça déborde ; redescend quand la place est au moins celle qu'occupait le palier inférieur.
 */
export function fitStep(state: FitState, clientWidth: number, scrollWidth: number): FitState {
  const { tier, natural } = state
  if (scrollWidth > clientWidth + 0.5 && tier < MAX_TIER) {
    const next = natural.slice()
    next[tier] = scrollWidth
    return { tier: tier + 1, natural: next }
  }
  if (tier > 0 && natural[tier - 1] !== undefined && clientWidth >= natural[tier - 1]) return { tier: tier - 1, natural }
  return state
}
