/** Une icône de la bibliothèque (Phosphor, licence MIT) : deux variantes, contour et plein, en chemins SVG d'un viewBox 100 × 100. */
export interface IconEntry {
  name: string
  /** numéros dans `IconLibrary.categories` */
  categories: number[]
  /** mots-clés anglais */
  tags: string[]
  regular: string
  fill: string
}

export interface IconLibrary {
  /** noms anglais des catégories (voir `iconCategoryKey`) */
  categories: string[]
  icons: IconEntry[]
}

export type IconWeight = 'regular' | 'fill'

/** Forme du fichier `iconData.json` (écrit par `scripts/build-icons.mjs`) : un tableau par icône, plus compact qu'un objet. */
export interface RawIconData {
  categories: string[]
  icons: Array<[name: string, categories: number[], tags: string[], regular: string, fill: string]>
}

export const fromRaw = (raw: RawIconData): IconLibrary => ({
  categories: raw.categories,
  icons: raw.icons.map(([name, categories, tags, regular, fill]) => ({ name, categories, tags, regular, fill }))
})

/** Nom d'une catégorie de la bibliothèque → fin de la clé de traduction `icons.cat.<fin>`. */
export const CATEGORY_KEYS: Record<string, string> = {
  arrows: 'arrows',
  commerce: 'commerce',
  communications: 'communication',
  design: 'design',
  editor: 'editor',
  finances: 'finance',
  games: 'games',
  'health & wellness': 'health',
  'maps & travel': 'travel',
  media: 'media',
  nature: 'nature',
  objects: 'objects',
  office: 'office',
  people: 'people',
  system: 'system',
  'technology & development': 'tech',
  weather: 'weather'
}

/** Minuscules sans accents : « Écran » et « ecran » se valent. */
export const normalize = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Mots français courants → mots-clés de la bibliothèque (qui est en anglais). Sans accents, au singulier.
 * Le mot saisi reste toujours cherché tel quel : « cloud » trouve « nuage » comme « cloud ».
 */
export const FR_WORDS: Record<string, string[]> = {
  maison: ['house', 'home'], foyer: ['home'], immeuble: ['buildings'], batiment: ['buildings', 'building'], usine: ['factory'], entrepot: ['warehouse'], banque: ['bank'], eglise: ['church'], chateau: ['castle'],
  coeur: ['heart'], etoile: ['star'], soleil: ['sun'], lune: ['moon'], nuage: ['cloud'], pluie: ['rain'], neige: ['snowflake', 'snow'], orage: ['lightning', 'storm'], vent: ['wind'], eclair: ['lightning'], parapluie: ['umbrella'], temperature: ['thermometer'],
  arbre: ['tree'], fleur: ['flower'], feuille: ['leaf'], plante: ['plant'], montagne: ['mountains'], vague: ['waves'], plage: ['beach'], feu: ['fire'], flamme: ['flame', 'fire'], eau: ['drop', 'water'], goutte: ['drop'], terre: ['globe', 'earth'], monde: ['globe'], planete: ['planet'], fusee: ['rocket'], tente: ['tent'], camping: ['tent'],
  chien: ['dog'], oiseau: ['bird'], poisson: ['fish'], cheval: ['horse'], vache: ['cow'], papillon: ['butterfly'], abeille: ['bee'], insecte: ['bug'], souris: ['mouse'], lapin: ['rabbit'],
  voiture: ['car'], auto: ['car'], velo: ['bicycle'], moto: ['motorcycle'], bus: ['bus'], camion: ['truck'], avion: ['airplane'], train: ['train'], bateau: ['boat'], voilier: ['sailboat'], metro: ['subway'], taxi: ['taxi'], ambulance: ['ambulance'],
  telephone: ['phone'], portable: ['device-mobile', 'mobile'], smartphone: ['device-mobile'], tablette: ['tablet'], ordinateur: ['computer', 'laptop'], ecran: ['monitor', 'screen'], clavier: ['keyboard'], imprimante: ['printer'], imprimer: ['printer'], serveur: ['hard-drives'], batterie: ['battery'], prise: ['plug'], wifi: ['wifi'], reseau: ['network'],
  courrier: ['envelope', 'mail'], enveloppe: ['envelope'], message: ['chat', 'envelope'], discussion: ['chat'], bulle: ['chat', 'bubble'], commentaire: ['chat', 'comment'], cloche: ['bell'], notification: ['bell'], alarme: ['alarm', 'bell'], reveil: ['alarm'], megaphone: ['megaphone'],
  livre: ['book'], cahier: ['notebook'], stylo: ['pen'], crayon: ['pencil'], ecole: ['student', 'school'], eleve: ['student'], enseignant: ['chalkboard-teacher', 'teacher'], professeur: ['chalkboard-teacher'], diplome: ['graduation-cap'], tableau: ['chalkboard', 'table'], regle: ['ruler'], ciseaux: ['scissors'], compas: ['compass'],
  calendrier: ['calendar'], horloge: ['clock'], heure: ['clock'], montre: ['watch'], chronometre: ['timer', 'stopwatch'], sablier: ['hourglass'], temps: ['clock', 'timer'],
  argent: ['money', 'coins'], monnaie: ['coins'], euro: ['currency-eur'], dollar: ['currency-dollar'], panier: ['basket', 'shopping-cart'], caddie: ['shopping-cart'], sac: ['bag', 'handbag'], boutique: ['storefront'], magasin: ['storefront'], cadeau: ['gift'], etiquette: ['tag'], prix: ['tag'], carte: ['map', 'credit-card'], facture: ['receipt'],
  musique: ['music'], note: ['music-note', 'note'], video: ['video'], camera: ['camera', 'video-camera'], photo: ['camera', 'image'], image: ['image'], appareil: ['camera'], micro: ['microphone'], casque: ['headphones'], haut: ['up'], bas: ['down'], gauche: ['left'], droite: ['right'], son: ['speaker'], volume: ['speaker'], muet: ['speaker-slash'], lecture: ['play'], pause: ['pause'], avance: ['fast-forward'], film: ['film'],
  verrou: ['lock'], cadenas: ['lock'], cle: ['key'], bouclier: ['shield'], securite: ['shield', 'lock'], empreinte: ['fingerprint'], engrenage: ['gear'], reglage: ['gear', 'sliders'], parametre: ['gear', 'sliders'], outil: ['wrench', 'tool'], marteau: ['hammer'], tournevis: ['screwdriver'], clef: ['wrench'],
  loupe: ['magnifying-glass'], recherche: ['magnifying-glass'], poubelle: ['trash'], corbeille: ['trash'], telecharger: ['download'], envoyer: ['paper-plane', 'send'], partager: ['share'], lien: ['link'], copier: ['copy'], coller: ['clipboard'], enregistrer: ['floppy-disk'], disquette: ['floppy-disk'],
  personne: ['user', 'person'], utilisateur: ['user'], groupe: ['users', 'users-three'], equipe: ['users-three'], famille: ['users-three'], enfant: ['baby', 'child'], bebe: ['baby'], main: ['hand'], pouce: ['thumbs-up'], oeil: ['eye'], oreille: ['ear'], bouche: ['mouth', 'smiley'], cerveau: ['brain'], dent: ['tooth'], os: ['bone'], visage: ['smiley', 'face'], sourire: ['smiley'], triste: ['smiley-sad'], colere: ['smiley-angry'],
  sante: ['heartbeat', 'first-aid'], medical: ['first-aid-kit', 'stethoscope'], hopital: ['hospital'], pilule: ['pill'], medicament: ['pill'], seringue: ['syringe'], pharmacie: ['pill', 'first-aid-kit'], croix: ['x', 'cross'],
  drapeau: ['flag'], trophee: ['trophy'], coupe: ['trophy'], medaille: ['medal'], couronne: ['crown'], diamant: ['diamond'], bijou: ['diamond'], idee: ['lightbulb'], ampoule: ['lightbulb'], cible: ['target'], objectif: ['target'], puzzle: ['puzzle-piece'], bombe: ['bomb'],
  attention: ['warning'], alerte: ['warning', 'bell'], danger: ['warning', 'skull'], interdit: ['prohibit'], valider: ['check'], coche: ['check'], fermer: ['x'], ajouter: ['plus'], supprimer: ['trash', 'minus'], moins: ['minus'], question: ['question'], aide: ['question', 'lifebuoy'], info: ['info'], erreur: ['x-circle', 'warning'],
  fleche: ['arrow'], retour: ['arrow-u-up-left', 'arrow-left'], actualiser: ['arrows-clockwise'], rafraichir: ['arrows-clockwise'], boucle: ['repeat'], aleatoire: ['shuffle'], echange: ['arrows-left-right'], recycler: ['recycle'],
  document: ['file'], fichier: ['file'], dossier: ['folder'], graphique: ['chart'], diagramme: ['chart', 'tree-structure'], liste: ['list'], texte: ['text'], paragraphe: ['paragraph'], code: ['code'], robot: ['robot'], base: ['database'], donnee: ['database'], pinceau: ['paint-brush'], peinture: ['paint-brush', 'paint-bucket'], palette: ['palette'], couleur: ['palette', 'drop'],
  lunettes: ['eyeglasses'], chapeau: ['hat', 'cowboy-hat'], chaussure: ['sneaker'], chemise: ['shirt-folded'], vetement: ['t-shirt', 'shirt-folded'], pantalon: ['pants'], robe: ['dress'],
  cafe: ['coffee'], biere: ['beer-bottle', 'beer-stein'], vin: ['wine'], pizza: ['pizza'], gateau: ['cake'], pomme: ['apple'], fruit: ['orange', 'apple'], legume: ['carrot'], repas: ['fork-knife'], cuisine: ['cooking-pot', 'chef-hat'], restaurant: ['fork-knife'], glace: ['ice-cream'], hamburger: ['hamburger'],
  fete: ['confetti', 'balloon'], ballon: ['balloon', 'soccer-ball'], football: ['soccer-ball'], basket: ['basketball'], tennis: ['tennis-ball'], sport: ['soccer-ball', 'barbell', 'person-simple-run'], musculation: ['barbell'], course: ['person-simple-run'], marche: ['person-simple-walk'], natation: ['swimming-pool'], jeu: ['game-controller'],
  lit: ['bed'], hotel: ['bed'], valise: ['suitcase'], bagage: ['suitcase-rolling'], passeport: ['identification-card'], boussole: ['compass'], lieu: ['map-pin'], position: ['map-pin'], epingle: ['push-pin', 'map-pin'], plan: ['map-trifold'], route: ['road-horizon'], pont: ['bridge'], escalier: ['stairs']
}

/** Mot saisi → candidats à chercher dans la bibliothèque : le mot lui-même, sa traduction française, et le singulier. */
function candidates(term: string): string[] {
  const out = new Set<string>([term])
  const singular = /[sx]$/.test(term) && term.length > 3 ? term.slice(0, -1) : null
  for (const w of [term, singular]) if (w) for (const e of FR_WORDS[w] ?? []) out.add(e)
  if (singular) out.add(singular)
  return [...out]
}

/** Note d'un mot candidat pour une icône : nom exact > début de nom > partie du nom > mot-clé exact > partie d'un mot-clé > catégorie. */
function scoreOne(icon: IconEntry, labels: string[], word: string): number {
  const parts = icon.name.split('-')
  let best = 0
  if (icon.name === word || parts.includes(word)) best = 3
  else if (icon.name.startsWith(word) || parts.some((p) => p.startsWith(word))) best = 2.2
  else if (icon.name.includes(word)) best = 1.6
  if (best >= 2.2) return best
  for (const tag of icon.tags) {
    if (tag === word) best = Math.max(best, 1.2)
    else if (tag.includes(word)) best = Math.max(best, 0.6)
  }
  if (best === 0 && word.length >= 3 && labels.some((l) => l.includes(word))) best = 0.3
  return best
}

/**
 * Icônes qui répondent à la saisie : chaque mot saisi doit correspondre (nom, mots-clés, catégorie, ou traduction française), les
 * meilleures notes d'abord. Sans saisie, toutes les icônes (de la catégorie choisie), par ordre alphabétique.
 * `categoryLabels` : libellés (dans la langue de l'interface) des catégories de la bibliothèque, dans le même ordre ; ils sont cherchés aussi.
 */
export function searchIcons(lib: IconLibrary, query: string, category: number | null = null, categoryLabels: string[] = []): IconEntry[] {
  const pool = category === null ? lib.icons : lib.icons.filter((i) => i.categories.includes(category))
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return pool
  const labelsOf = (i: IconEntry): string[] => i.categories.map((c) => normalize(categoryLabels[c] ?? ''))
  const scored: Array<{ icon: IconEntry; score: number }> = []
  for (const icon of pool) {
    const labels = labelsOf(icon)
    let total = 0
    for (const term of terms) {
      const best = Math.max(...candidates(term).map((w, i) => scoreOne(icon, labels, w) * (i === 0 ? 1 : 0.95)))
      if (best <= 0) {
        total = 0
        break
      }
      total += best
    }
    if (total > 0) scored.push({ icon, score: total })
  }
  return scored.sort((a, b) => b.score - a.score || a.icon.name.length - b.icon.name.length || (a.icon.name < b.icon.name ? -1 : 1)).map((s) => s.icon)
}
