// Configuration de PUBLICATION (signature Developer ID + notarisation), utilisée par `npm run release:mac`.
// Elle reprend la configuration de développement de package.json (champ `build`) et ne change que ce qui concerne
// la signature : le build quotidien (`npm run pack` / `npm run dist`) reste signé « ad hoc » et ne demande aucun compte.
const { build } = require('./package.json')

module.exports = {
  ...build,
  mac: {
    ...build.mac,
    // Le certificat est choisi par scripts/release-mac.mjs (variable CSC_NAME) : on retire l'identité « ad hoc » de la config de dev.
    identity: undefined,
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    // Les contrôles Gatekeeper sont faits par scripts/release-mac.mjs, après la notarisation
    gatekeeperAssess: false,
    // Notarisation + agrafage (« staple ») de l'app avant sa mise dans le DMG et le ZIP.
    // Les identifiants viennent de l'environnement (APPLE_KEYCHAIN / APPLE_KEYCHAIN_PROFILE, posés par le script) : rien dans le dépôt.
    notarize: true
  }
  // Le DMG n'est volontairement pas signé : electron-builder le déconseille avec la notarisation (l'app qu'il contient l'est).
}
