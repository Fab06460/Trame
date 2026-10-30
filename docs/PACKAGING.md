# Packaging et distribution (macOS, Windows, Linux)

Trame est empaquetée avec **electron-builder** (configuration dans `package.json`, champ `build`).

## Commandes

| Commande        | Résultat                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| `npm run pack`  | `dist/mac-arm64/Trame.app` : app non compressée, pour tester rapidement          |
| `npm run pack:win` / `pack:linux` | `dist/win-unpacked/` (Windows) ou `dist/linux-unpacked/` (Linux) : application non compressée |
| `npm run dist:win` | `dist/Trame Setup <version>.exe` (installeur NSIS x64, multilingue, au choix du dossier et sans droits administrateur) et `dist/Trame-<version>-win.zip` (version portable) |
| `npm run dist:linux` | `dist/Trame-<version>.AppImage` (un seul fichier exécutable) et `dist/trame-<version>.tar.gz` (x64) |
| `npm run dist`  | Build complet + `dist/Trame-<version>-arm64.dmg` et `dist/Trame-<version>-arm64-mac.zip` |

`dist/` est ignoré par git. Le premier build télécharge (et met en cache) l'archive Electron et les outils DMG : **il faut du réseau une fois**, ensuite plus rien (l'application, elle, n'a jamais besoin de réseau).

Pour changer la version de l'application : modifier `version` dans `package.json` (elle apparaît dans les noms de fichiers et dans « À propos »).

## Windows et Linux

Les trois systèmes se construisent **depuis un Mac** (les installeurs ci-dessus ont été produits ainsi, le premier build télécharge Electron et les outils NSIS / AppImage), mais **seul le build macOS a été lancé et essayé en vrai**. Les exécutables Windows et Linux ont été construits et leur format vérifié (`PE32+ x86-64`, `ELF x86-64`), **pas exécutés** : à essayer sur une vraie machine avant de les diffuser.

Pour un résultat de référence, le workflow `.github/workflows/build.yml` construit chaque plateforme sur son propre système (Windows, Ubuntu, macOS) après `typecheck` et les tests, et joint les installeurs à l'exécution. Il se déclenche sur une étiquette `v*` ou à la main (*Run workflow*) et suppose un dépôt GitHub (il n'y en a pas encore). Aucune signature n'y est faite.

**Non signés.** Windows affichera l'avertissement SmartScreen (« Windows a protégé votre ordinateur » → *Informations complémentaires* → *Exécuter quand même*) tant qu'un certificat de signature de code n'est pas configuré (variables `CSC_LINK` / `CSC_KEY_PASSWORD` d'electron-builder). Sous Linux, l'AppImage se lance après `chmod +x`.

**Ce qui est adapté à la plateforme** :
- raccourcis : les textes notent `⌘N`, `⇧⌘S`… à la façon de macOS ; hors macOS ils sont affichés `Ctrl+N`, `Ctrl+Shift+S`, `Ctrl+Alt+3` (`Strg` en allemand), voir `src/shared/shortcuts.ts`. Les raccourcis eux-mêmes acceptent déjà `Ctrl` comme `⌘` ;
- barre d'outils : la réserve de 84 px pour les boutons de fenêtre ne vaut que sous macOS (`[data-platform="mac"]`) ; ailleurs la fenêtre garde son cadre et la barre de menus d'Electron est masquée (Alt l'affiche) ;
- fichiers `.trame` : un double-clic lance `Trame fichier.trame` (Windows, Linux). Une seule instance tourne (`requestSingleInstanceLock`) : un second double-clic ouvre le projet dans la fenêtre existante (`second-instance`, `src/main/launchArgs.ts`). macOS garde son événement `open-file` ;
- identifiants des services d'IA : chiffrés par DPAPI (Windows). Sous Linux, sans trousseau (gnome-libsecret, kwallet), Electron se rabattrait sur une clé en clair : on refuse alors d'écrire quoi que ce soit, les identifiants restent en mémoire jusqu'à la fermeture ;
- architectures : x64 seulement. Pour Windows ou Linux arm64, ajouter `arm64` dans `build.win.target[].arch` ou `build.linux.target[].arch`.

Le paquet `.deb` n'est pas produit : electron-builder exige une adresse de page d'accueil du projet (`homepage` dans `package.json`), à ajouter quand elle existera, puis `deb` dans `build.linux.target`.

## Contenu et taille

L'app fait environ 260 Mo (Electron/Chromium), le DMG environ 116 Mo. Le code applicatif empaqueté (`app.asar`) ne pèse que ~5 Mo (dont les polices utilisées par l'export PDF, chargées à la demande sous forme de petits modules JS) : **toutes les bibliothèques (React, Konva, polices…) sont compilées dans le bundle du renderer par Vite**, elles sont donc déclarées en `devDependencies` et electron-builder ne les recopie pas. Règle : une dépendance importée par le renderer reste en `devDependencies` ; une dépendance **chargée à l'exécution par le process principal** sans être bundlée (module natif, par exemple) doit aller en `dependencies`.

`files` ne contient que `out/**/*` et `package.json` : ne jamais y ajouter de ressource qui doit être lue au runtime sans vérifier qu'elle est bien dans l'asar.

## Architecture ciblée

Seulement **Apple Silicon (arm64)**. Pour un Mac Intel ou un binaire universel, ajouter `x64` (ou utiliser la cible `universal`) dans `build.mac.target[].arch` ; la taille des fichiers double environ. Non testé.

## Signature et notarisation

Il existe **deux modes**, volontairement séparés :

| | Développement (`npm run pack` / `dist`) | Publication (`npm run release:mac`) |
| --- | --- | --- |
| Signature | « ad hoc » (`identity: "-"`), sans compte Apple | Certificat **Developer ID Application** |
| Runtime durci | non | oui, avec `build/entitlements.mac.plist` |
| Notarisation | non | oui, ticket agrafé à l'app |
| Autre Mac | avertissement Gatekeeper, clic droit → Ouvrir | s'ouvre normalement |
| Configuration | champ `build` de `package.json` | `electron-builder.release.cjs` (reprend `build` et ne change que la signature) |

### Mode développement (signature ad hoc)

`identity: "-"` + `hardenedRuntime: false`. Pourquoi pas `null` : electron-builder laisserait la signature d'origine d'Electron, devenue incohérente après modification du bundle (`codesign --verify` échoue, et sur Apple Silicon l'app peut être refusée). Pourquoi `hardenedRuntime: false` : avec une signature ad hoc, le runtime durci empêche le chargement des bibliothèques d'Electron ; il n'a d'intérêt que pour la notarisation. Sur un autre Mac, une app téléchargée est bloquée au double-clic : clic droit → *Ouvrir*, ou *Réglages Système → Confidentialité et sécurité → Ouvrir quand même*, ou `xattr -cr /Applications/Trame.app`.

### Mode publication : mise en place (une seule fois)

Ces deux étapes demandent **votre compte Apple** : personne d'autre (ni un script) ne peut les faire à votre place.

**1. Le certificat « Developer ID Application »** (compte Apple Developer payant, rôle Titulaire ou Admin). Les certificats « Apple Development » et « Apple Distribution » (Mac App Store) ne conviennent **pas** à une distribution directe. Dans Xcode : *Réglages → Comptes →* votre équipe *→ Gérer les certificats… → « + » → Developer ID Application*. La clé privée est créée sur ce Mac et reste dans le trousseau « Connexion » : **sauvegardez-la** (Trousseaux → clic droit sur le certificat → Exporter en `.p12`, protégé par mot de passe, à ranger hors du dépôt), sans quoi il faudra révoquer et recréer le certificat si ce Mac est perdu.

**2. Les identifiants de notarisation**, enregistrés dans le trousseau (rien dans le dépôt, rien dans l'environnement) :

1. sur [appleid.apple.com](https://appleid.apple.com) → *Connexion et sécurité → Mots de passe d'application* : créer un mot de passe nommé par ex. « Trame notarisation » ;
2. dans un terminal :
   ```bash
   xcrun notarytool store-credentials "trame-notary" --apple-id "votre-identifiant@apple" --team-id "VOTRE_ID_D_EQUIPE"
   ```
   (l'identifiant d'équipe se lit sur developer.apple.com → *Compte → Appartenance*, ou dans le nom du certificat : `Developer ID Application: Nom (ID_D_EQUIPE)`). Le mot de passe est demandé sans écho puis stocké dans le trousseau.

*Alternative recommandée par electron-builder (sans mot de passe personnel) :* une **clé d'API App Store Connect** (rôle « Developer »). Fournir alors les variables `APPLE_API_KEY` (chemin du `.p8`), `APPLE_API_KEY_ID` et `APPLE_API_ISSUER` à la place du profil ; ne jamais commiter le `.p8`.

Vérification des prérequis, **sans rien construire ni envoyer** :

```bash
npm run release:check
```

### Mode publication : à chaque version

```bash
# 1. incrémenter "version" dans package.json, commiter
npm run release:mac
```

Le script (`scripts/release-mac.mjs`) enchaîne : vérification des prérequis → build → signature de **tous** les binaires avec le runtime durci → envoi à Apple et attente du verdict (en général 2 à 10 minutes) → agrafage du ticket à l'app → création du `.dmg` et du `.zip` → vérifications : signature profonde stricte, runtime durci, signataire Developer ID, ticket agrafé, et acceptation par Gatekeeper (`spctl`, source « Notarized Developer ID »), y compris pour l'app **dans** le DMG. Il affiche enfin les empreintes SHA-256. S'il termine par ✓, les fichiers de `dist/` sont distribuables ; sinon ne rien distribuer.

Variables facultatives : `TRAME_NOTARY_PROFILE` (nom du profil, défaut `trame-notary`), `TRAME_SIGN_IDENTITY` (sous-chaîne du certificat à utiliser s'il y en a plusieurs), `TRAME_KEYCHAIN` (chemin d'un trousseau à imposer ; **par défaut aucun** : `notarytool` retrouve seul le trousseau où le profil a été enregistré).

### Entitlements (`build/entitlements.mac.plist`)

Le runtime durci, obligatoire pour la notarisation, interdit par défaut ce dont le moteur JavaScript a besoin ; on ne rend que le strict nécessaire : `allow-jit` et `allow-unsigned-executable-memory`. Vérifié : l'appli signée avec le runtime durci et **ces deux seuls droits** démarre et exporte un PDF vectoriel. `disable-library-validation` n'est **pas** nécessaire tant que tous les binaires (frameworks, bibliothèques `.dylib`, helpers) sont signés par la même équipe, ce que fait electron-builder : ne pas l'ajouter par précaution, il affaiblit la protection. Symptôme d'un binaire oublié : `Library not loaded: … libffmpeg.dylib` au lancement.

### Erreur « No Keychain password item found for profile »

Le profil existe mais n'est pas cherché au bon endroit. `notarytool store-credentials` range le profil dans le trousseau que macOS choisit — **souvent le trousseau iCloud, pas « Connexion »** — et `notarytool` ne le retrouve que si on ne lui impose pas de trousseau. Ne pas définir `TRAME_KEYCHAIN` (ni `APPLE_KEYCHAIN`) sauf si le profil a été enregistré avec `--keychain <chemin>`. Contrôle : `xcrun notarytool history --keychain-profile trame-notary` doit répondre (même vide : « No submission history »).

### En cas de refus de la notarisation

`electron-builder` affiche l'identifiant de la soumission ; le détail des motifs (binaire non signé, droit manquant, horodatage absent…) s'obtient avec :

```bash
xcrun notarytool log <identifiant-de-soumission> --keychain-profile trame-notary
xcrun notarytool history --keychain-profile trame-notary   # liste des envois récents
```

### État de cette chaîne

**Vérifiée de bout en bout le 25/10/2026** (version 0.1.0, Apple Silicon) : signature Developer ID, runtime durci, soumission à Apple (statut *Accepted*), agrafage, DMG et ZIP. Contrôles indépendants du script : `spctl` répond « accepted — source=Notarized Developer ID » pour l'app, y compris extraite du ZIP avec l'attribut de quarantaine d'un téléchargement ; `stapler validate` réussit ; l'app signée démarre et exporte un PDF vectoriel. **Non couvert** : l'ouverture sur un *autre* Mac (réellement téléchargé), les Mac Intel (build arm64 uniquement), et une machine **hors ligne** à la première ouverture (le ticket est agrafé, donc elle devrait réussir sans réseau ; non testé).

## Icône

`build/icon.icns` (et `build/icon.png`) sont générées par `python3 scripts/make-icon.py` (Pillow requis, `iconutil` de macOS pour l'`.icns`). C'est une icône provisoire dessinée par script ; pour la remplacer, fournir un nouvel `icon.icns` dans `build/` (ou modifier le script). Les deux fichiers sont versionnés.

## Identité de l'application

- `appId` : `app.trame.editor` : **identifiant provisoire**. À remplacer par un identifiant en notation DNS inversée dont vous êtes propriétaire (par ex. `fr.votredomaine.trame`) *avant* la première distribution réelle ; le changer ensuite fait considérer l'app comme une autre application par macOS (préférences, droits).
- `productName` : `Trame` (nom du `.app`).

## Association de fichiers `.trame`

Déclarée dans `build.fileAssociations` (extension `trame`, rôle Éditeur, icône de l'app) : electron-builder écrit `CFBundleDocumentTypes` dans l'`Info.plist`. Une fois **Trame installée** (par ex. dans `/Applications`), macOS l'utilise pour double-clic, « Ouvrir avec » et glisser-déposer d'un `.trame` sur son icône ; les projets ouverts alimentent aussi le menu « Ouvrir récent » du Dock. Côté code : événement `open-file` géré dans `main/index.ts` (voir [ARCHITECTURE.md](ARCHITECTURE.md)).

Points à connaître :

- Le **mode développement** (`npm run dev`, Electron générique) n'est pas associé aux fichiers : seul le `.app` empaqueté l'est. Pour tester sans installer : `npm run pack`, puis `open -n -a dist/mac-arm64/Trame.app un-projet.trame`.
- macOS retient les applications qu'il a **vues** : lancer un build de `dist/` l'enregistre auprès de LaunchServices. Si plusieurs copies de Trame existent (dist, Applications, DMG monté), le Finder peut en choisir une inattendue. Pour désenregistrer une copie : `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u chemin/vers/Trame.app`.
- L'icône des fichiers `.trame` est celle de l'application (pas d'icône de document dédiée).
- Tant que l'app n'est pas signée et notarisée, le premier double-clic sur un autre Mac passe d'abord par l'avertissement Gatekeeper (voir plus haut).
- Windows / Linux : gérés par `process.argv` et `second-instance` (voir « Windows et Linux » plus haut) ; l'association de l'extension est faite par l'installeur NSIS (Windows). Non essayé sur une vraie machine.

## Pièges connus

- **`ELECTRON_RUN_AS_NODE`** : si cette variable d'environnement est définie dans votre shell (certains outils et environnements de développement le font), Electron démarre comme un simple Node : l'app quitte aussitôt sans rien afficher, ou `require('electron')` renvoie un chemin au lieu de l'API (`Cannot read properties of undefined (reading 'handle')`). Lancer avec `env -u ELECTRON_RUN_AS_NODE …`. Attention : sur les macOS récents, `open` **transmet l'environnement du shell** à l'application qu'il lance : la variable est donc héritée aussi par `open -a Trame.app` (symptôme : `bad option: --remote-debugging-port`).
- Les `.woff` et `.woff2` des polices sont tous deux copiés dans le bundle ; seuls les `.woff2` sont utilisés par Chromium. Gain possible : quelques Mo.
- Pas de **mise à jour automatique**.
