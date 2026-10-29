/**
 * pptxgenjs écrit le nom du fichier comme texte alternatif d'une image qui n'en a pas (`descr="preencoded.png"` pour une image en
 * data URL) : un lecteur d'écran lirait « preencoded point png ». On le vide ; un vrai texte alternatif (`altText`) n'est pas touché.
 */
export const stripPlaceholderAlt = (slideXml: string): string => slideXml.replace(/ descr="preencoded\.png"/g, ' descr=""')
