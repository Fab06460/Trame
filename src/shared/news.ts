/**
 * Les nouveautés de chaque version, montrées après une mise à jour (et à la demande : Fichier → Nouveautés…).
 *
 * **À chaque version** : ajouter une entrée en tête de `NEWS` (un test refuse une version de `package.json` sans entrée). Quelques lignes,
 * ce qu'une personne verra ou pourra faire de nouveau, sans jargon. Le français est la référence ; une langue sans texte retombe sur l'anglais,
 * puis sur le français.
 */
export interface NewsEntry {
  version: string
  fr: string[]
  en: string[]
  de?: string[]
  es?: string[]
}

export const NEWS: readonly NewsEntry[] = [
  {
    version: '0.17.1',
    fr: [
      'Éléments hors de la page : ils restent visibles (estompés), sélectionnables et déplaçables, au lieu de disparaître.',
      'Enregistrement d\'écran : la vidéo se termine bien quand on enregistre aussi le son de l\'ordinateur.',
      'Tutoriel automatique : le suivi des clics fonctionne sous Windows ; sous Linux Wayland, une explication remplace l\'option absente.'
    ],
    en: [
      'Elements outside the page: they stay visible (dimmed), selectable and movable instead of disappearing.',
      'Screen recording: the video now finishes properly when the computer\'s sound is recorded too.',
      'Automatic tutorial: click tracking works on Windows; on Linux Wayland, an explanation replaces the missing option.'
    ],
    de: [
      'Elemente außerhalb der Seite: Sie bleiben sichtbar (abgedunkelt), auswählbar und verschiebbar, statt zu verschwinden.',
      'Bildschirmaufnahme: Das Video wird jetzt richtig abgeschlossen, wenn auch der Ton des Computers aufgenommen wird.',
      'Automatisches Tutorial: Die Klickverfolgung funktioniert unter Windows; unter Linux Wayland ersetzt ein Hinweis die fehlende Option.'
    ],
    es: [
      'Elementos fuera de la página: siguen visibles (atenuados), seleccionables y movibles en lugar de desaparecer.',
      'Grabación de pantalla: el vídeo ahora termina correctamente cuando también se graba el sonido del ordenador.',
      'Tutorial automático: el seguimiento de clics funciona en Windows; en Linux Wayland, una explicación sustituye a la opción ausente.'
    ]
  },
  {
    version: '0.17.0',
    fr: [
      'Piles : rangez plusieurs éléments l\'un après l\'autre (espacement, alignement, fond facultatif) ; ils se replacent tout seuls quand un texte s\'allonge, y compris dans le publipostage.',
      'Magic Resize : réglez par élément comment il suit un changement de format (collé à un bord, centré, étiré entre les marges, proportionnel).',
      'Contour en forme : le trait d\'une forme, d\'une ligne ou d\'une flèche devient une surface pleine, modifiable point par point.'
    ],
    en: [
      'Stacks: arrange several elements one after another (spacing, alignment, optional background); they rearrange themselves when a text grows, including in mail merge.',
      'Magic Resize: set per element how it follows a format change (pinned to an edge, centered, stretched between margins, proportional).',
      'Outline to shape: the stroke of a shape, line or arrow becomes a filled shape, editable point by point.'
    ],
    de: [
      'Stapel: Mehrere Elemente nacheinander anordnen (Abstand, Ausrichtung, optionaler Hintergrund); sie ordnen sich selbst neu, wenn ein Text länger wird, auch im Serienbrief.',
      'Magic Resize: Pro Element festlegen, wie es einem Formatwechsel folgt (am Rand fixiert, zentriert, zwischen den Rändern gestreckt, proportional).',
      'Kontur in Form: Die Kontur einer Form, Linie oder eines Pfeils wird zu einer gefüllten Fläche, Punkt für Punkt bearbeitbar.'
    ],
    es: [
      'Pilas: coloque varios elementos uno tras otro (espaciado, alineación, fondo opcional); se recolocan solos cuando un texto crece, también en la combinación de correspondencia.',
      'Magic Resize: indique por elemento cómo sigue un cambio de formato (fijado a un borde, centrado, estirado entre los márgenes, proporcional).',
      'Contorno en forma: el trazo de una forma, línea o flecha se convierte en una forma rellena, editable punto a punto.'
    ]
  },
  {
    version: '0.16.0',
    fr: [
      'Formes : unir, soustraire, intersecter ou exclure des formes (sélectionnez-en deux ou plus) pour dessiner logos et icônes sur mesure.',
      'Texte : « Convertir en tracé » transforme les lettres en formes, à combiner avec d\'autres formes.',
      'Fusion : seize modes de fusion (Produit, Superposition, Incrustation…) pour mélanger un élément avec ce qui est dessous.',
      'Masques d\'écrêtage : une forme découpe les autres éléments de son groupe (une photo dans des lettres, par exemple).'
    ],
    en: [
      'Shapes: unite, subtract, intersect or exclude shapes (select two or more) to draw custom logos and icons.',
      'Text: "Convert to outlines" turns letters into shapes, to combine with other shapes.',
      'Blending: sixteen blend modes (Multiply, Screen, Overlay…) to mix an element with what is underneath.',
      'Clipping masks: a shape clips the other elements of its group (a photo inside letters, for example).'
    ],
    de: [
      'Formen: Formen vereinigen, subtrahieren, schneiden oder ausschließen (zwei oder mehr auswählen), um eigene Logos und Icons zu zeichnen.',
      'Text: „In Pfade umwandeln“ verwandelt Buchstaben in Formen, die sich mit anderen Formen kombinieren lassen.',
      'Überblendung: sechzehn Füllmethoden (Multiplizieren, Negativ multiplizieren, Ineinanderkopieren…), um ein Element mit dem Darunterliegenden zu mischen.',
      'Schnittmasken: Eine Form beschneidet die anderen Elemente ihrer Gruppe (zum Beispiel ein Foto in Buchstaben).'
    ],
    es: [
      'Formas: unir, restar, intersectar o excluir formas (seleccione dos o más) para dibujar logotipos e iconos a medida.',
      'Texto: «Convertir en trazo» transforma las letras en formas, para combinarlas con otras formas.',
      'Fusión: dieciséis modos de fusión (Multiplicar, Trama, Superponer…) para mezclar un elemento con lo que hay debajo.',
      'Máscaras de recorte: una forma recorta los demás elementos de su grupo (una foto dentro de letras, por ejemplo).'
    ]
  },
  {
    version: '0.15.0',
    fr: [
      'Tutoriel automatique : en enregistrant un écran entier, cochez « Créer un tutoriel à partir de mes clics ». Chaque clic devient une page (numéro, titre lu près du clic, image, cercle sur l\'endroit cliqué). Sur Mac, autorisez Trame dans Accessibilité.'
    ],
    en: [
      'Automatic tutorial: when recording a whole screen, tick "Create a tutorial from my clicks". Each click becomes a page (number, title read near the click, image, circle on the clicked spot). On Mac, allow Trame under Accessibility.'
    ],
    de: [
      'Automatische Anleitung: Wenn Sie einen ganzen Bildschirm aufnehmen, aktivieren Sie „Anleitung aus meinen Klicks erstellen“. Jeder Klick wird zu einer Seite (Nummer, neben dem Klick gelesener Titel, Bild, Kreis auf der angeklickten Stelle). Am Mac erlauben Sie Trame unter Bedienungshilfen.'
    ],
    es: [
      'Tutorial automático: al grabar una pantalla completa, marque «Crear un tutorial a partir de mis clics». Cada clic se convierte en una página (número, título leído junto al clic, imagen, círculo en el lugar pulsado). En Mac, autorice Trame en Accesibilidad.'
    ]
  },
  {
    version: '0.14.0',
    fr: [
      'Export PowerPoint : les lignes, flèches et tracés du dessin (crayon, surligneur, plume) restent des objets modifiables dans PowerPoint, au lieu d\'images.',
      'Éléments : l\'enregistrement et la capture d\'écran ont leur propre section « Écran ».'
    ],
    en: [
      'PowerPoint export: lines, arrows and drawings (pencil, highlighter, pen) stay editable objects in PowerPoint instead of images.',
      'Elements: screen recording and screen capture now have their own "Screen" section.'
    ],
    de: [
      'PowerPoint-Export: Linien, Pfeile und Zeichnungen (Stift, Marker, Zeichenfeder) bleiben in PowerPoint bearbeitbare Objekte statt Bilder.',
      'Elemente: Bildschirmaufnahme und Bildschirmfoto haben jetzt einen eigenen Bereich „Bildschirm“.'
    ],
    es: [
      'Exportación a PowerPoint: las líneas, flechas y trazos del dibujo (lápiz, resaltador, pluma) siguen siendo objetos editables en PowerPoint, en vez de imágenes.',
      'Elementos: la grabación y la captura de pantalla tienen ahora su propia sección «Pantalla».'
    ]
  },
  {
    version: '0.13.0',
    fr: [
      'Enregistrement d\'écran : le son de l\'ordinateur en option (Windows et macOS 14.2 ou plus), mélangé au micro.',
      'Nouveautés : cette fenêtre vous montre ce qui change après chaque mise à jour (Fichier → Nouveautés… pour la rouvrir).'
    ],
    en: [
      'Screen recording: the computer\'s sound as an option (Windows and macOS 14.2 or later), mixed with the microphone.',
      'What\'s new: this window shows what changes after each update (File → What\'s new… to open it again).'
    ],
    de: [
      'Bildschirmaufnahme: der Ton des Computers als Option (Windows und macOS ab 14.2), mit dem Mikrofon gemischt.',
      'Neuigkeiten: Dieses Fenster zeigt nach jeder Aktualisierung, was sich ändert (Datei → Neuigkeiten… zum erneuten Öffnen).'
    ],
    es: [
      'Grabación de pantalla: el sonido del ordenador como opción (Windows y macOS 14.2 o posterior), mezclado con el micrófono.',
      'Novedades: esta ventana muestra lo que cambia tras cada actualización (Archivo → Novedades… para abrirla de nuevo).'
    ]
  },
  {
    version: '0.12.0',
    fr: [
      'Dessin : crayon à main libre lissé, surligneur, ligne et flèche (pointe ou rond à chaque bout).',
      'La plume : des courbes de Bézier (points, poignées, fermeture, forme remplie), puis la modification point par point d\'un tracé.',
      'La barre de dessin se déplace, se met en colonne près d\'un côté et se souvient de sa place.',
      'Clips : frise visuelle (vignettes, poignées de début et de fin) et fondu enchaîné entre les morceaux d\'une séquence.',
      'Import PDF : reconnaissance du texte des pages scannées, avec un texte modifiable posé à sa place.'
    ],
    en: [
      'Drawing: smoothed freehand pencil, highlighter, line and arrow (point or dot at each end).',
      'The pen: Bézier curves (points, handles, closing, filled shape), then point-by-point editing of a path.',
      'The drawing bar can be moved, turns into a column near a side and remembers its place.',
      'Clips: visual timeline (thumbnails, start and end handles) and crossfade between the pieces of a sequence.',
      'PDF import: text recognition on scanned pages, with editable text placed where it belongs.'
    ],
    de: [
      'Zeichnen: geglätteter Freihandstift, Textmarker, Linie und Pfeil (Spitze oder Punkt an jedem Ende).',
      'Der Zeichenstift: Bézier-Kurven (Punkte, Griffe, Schließen, gefüllte Form) und anschließend Bearbeiten eines Pfads Punkt für Punkt.',
      'Die Zeichenleiste lässt sich verschieben, wird an einem Rand zur Spalte und merkt sich ihren Platz.',
      'Clips: visuelle Zeitleiste (Vorschaubilder, Anfangs- und Endgriffe) und Überblendung zwischen den Teilen einer Sequenz.',
      'PDF-Import: Texterkennung auf gescannten Seiten, mit bearbeitbarem Text an der richtigen Stelle.'
    ],
    es: [
      'Dibujo: lápiz a mano alzada suavizado, resaltador, línea y flecha (punta o círculo en cada extremo).',
      'La pluma: curvas de Bézier (puntos, tiradores, cierre, forma rellena) y edición de un trazo punto por punto.',
      'La barra de dibujo se mueve, pasa a columna junto a un lado y recuerda su sitio.',
      'Clips: línea de tiempo visual (miniaturas, tiradores de inicio y fin) y fundido encadenado entre los fragmentos de una secuencia.',
      'Importación de PDF: reconocimiento de texto en páginas escaneadas, con texto editable colocado en su sitio.'
    ]
  },
  {
    version: '0.11.0',
    fr: [
      'Clips : « Assembler les clips » met plusieurs clips bout à bout en une séquence ; « Couper ici » scinde un clip en deux.',
      'Fondu au noir facultatif entre les morceaux d\'une séquence.',
      'Texte : dégradé de couleur, avec contrôle du contraste.',
      'Import : les documents LibreOffice (.odt) se lisent comme ceux de Word.'
    ],
    en: [
      'Clips: “Join clips” puts several clips end to end in a sequence; “Split here” cuts a clip in two.',
      'Optional fade to black between the pieces of a sequence.',
      'Text: colour gradient, with a contrast check.',
      'Import: LibreOffice documents (.odt) open like Word ones.'
    ],
    de: [
      'Clips: „Clips zusammenfügen“ reiht mehrere Clips zu einer Sequenz; „Hier teilen“ schneidet einen Clip in zwei.',
      'Optionale Abblendung auf Schwarz zwischen den Teilen einer Sequenz.',
      'Text: Farbverlauf, mit Kontrastprüfung.',
      'Import: LibreOffice-Dokumente (.odt) werden wie Word-Dokumente gelesen.'
    ],
    es: [
      'Clips: «Unir clips» pone varios clips uno tras otro en una secuencia; «Cortar aquí» divide un clip en dos.',
      'Fundido a negro opcional entre los fragmentos de una secuencia.',
      'Texto: degradado de color, con comprobación del contraste.',
      'Importación: los documentos de LibreOffice (.odt) se leen como los de Word.'
    ]
  },
  {
    version: '0.10.0',
    fr: [
      'Dégradé de fond de page (linéaire ou radial), applicable à toutes les pages.',
      'Kit de marque : plusieurs kits, échange par fichier .tramekit, couleurs du kit sous les sélecteurs de couleur.',
      'Linux : capture d\'écran sous Wayland et voix du système pour la lecture à voix haute.'
    ],
    en: [
      'Page background gradient (linear or radial), applicable to all pages.',
      'Brand kit: several kits, exchange through a .tramekit file, kit colours under the colour pickers.',
      'Linux: screen capture under Wayland and system voices for reading aloud.'
    ],
    de: [
      'Farbverlauf als Seitenhintergrund (linear oder radial), auf alle Seiten anwendbar.',
      'Markenkit: mehrere Kits, Austausch per .tramekit-Datei, Kitfarben unter den Farbwählern.',
      'Linux: Bildschirmaufnahme unter Wayland und Systemstimmen zum Vorlesen.'
    ],
    es: [
      'Degradado de fondo de página (lineal o radial), aplicable a todas las páginas.',
      'Kit de marca: varios kits, intercambio mediante archivo .tramekit, colores del kit bajo los selectores de color.',
      'Linux: captura de pantalla en Wayland y voces del sistema para la lectura en voz alta.'
    ]
  }
]

/** Les nombres d'une version « 1.2.3 » (ce qui suit un tiret, comme « -beta », est ignoré) ; `null` si elle n'en a pas la forme. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Négatif si `a` est plus ancienne que `b`, positif si plus récente, 0 si égales ou illisibles. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return 0
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/** Les entrées après `last` (exclue) et jusqu'à `current` (incluse), de la plus récente à la plus ancienne. */
export function newsBetween(last: string, current: string, news: readonly NewsEntry[] = NEWS): NewsEntry[] {
  return news.filter((n) => compareVersions(n.version, last) > 0 && compareVersions(n.version, current) <= 0).sort((a, b) => compareVersions(b.version, a.version))
}

/** Les lignes d'une entrée dans la langue demandée (repli : anglais, puis français). */
export function newsLines(entry: NewsEntry, locale: string): string[] {
  const own = locale === 'fr' || locale === 'en' || locale === 'de' || locale === 'es' ? entry[locale] : undefined
  return own?.length ? own : entry.en.length ? entry.en : entry.fr
}
