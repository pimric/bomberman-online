# Island Bomber — contexte projet

Bomberman sur île tropicale, en ligne. Déployé sur GitHub Pages : **chaque push sur `main` = mise en ligne**. Toujours demander avant de push.

## Stack et fichiers
- HTML/Canvas/JS vanilla, aucun build. Tout le code du jeu est inline dans `game.html` ; `index.html` = accueil.
- Firebase Realtime Database (projet `bomberman-10e44`, région **europe-west1**) pour le multijoueur et le solo contre IA. Pas de backend.
- `assets/ile.css` : style commun (palette, polices Pacifico + Baloo 2, océan CSS).
- `assets/sprites.png` + `assets/sprites.js` (`window.SPRITE_ATLAS`, en .js pour marcher en `file://`) générés par `tools/build_sprites.py` (Pillow) depuis les planches `assets/src/*.png` (fond magenta #FF00FF, générées avec Gemini).
- `tests/multijoueur.test.js` : test auto (puppeteer-core + Chrome local, jusqu'à 3 navigateurs headless, salle `mptest_*` sur la vraie base, supprimée à la fin). `cd tests && npm install && npm test`. **Relancer après toute modif de `game.html`.**
  - Sans accès à Firebase (conteneur cloud : Firebase et cdnjs bloqués par le proxy) : `CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:local`. La base est alors simulée en mémoire (`tests/mock/hub.js` côté Node + `tests/mock/firebase-client.js` servi à la place du SDK) : écritures locales immédiates + ordre unique via le hub, tableaux à clés entières, `transaction`, `onDisconnect`. Si le jeu utilise une nouvelle API Firebase, l'ajouter au faux SDK.
- `.git-auto-push.sh` / `bomberman-watch.sh` : ancien auto-push (commit+push à chaque sauvegarde). Ne pas relancer.

## Vérifier la syntaxe
Extraire le bloc `<script>` de `game.html` vers un .js temporaire puis `node --check`. Insuffisant seul : une erreur TDZ (code qui utilise un `let` déclaré plus bas) passe `node --check` et casse tout le script ; seuls les tests navigateur la voient.

## Architecture de game.html
- `gameState` : état global (map, players, bombs, explosions, bonuses, match, roomId, playerId…).
- Déplacement **grille** : `stepEntityOnGrid()` lance un pas d'une case, `advanceEntityMovement()` interpole chaque frame (`MOVE_DURATION` 200 ms/case × `speedMultiplier`).
- Sync réseau throttlée (`POSITION_SYNC_INTERVAL` 100 ms), fin de pas toujours synchronisée.
- Listener `gameRef.on('value')` : ne jamais écraser position/mouvement des entités locales (`LOCAL_MOVEMENT_KEYS`, fusion `Object.assign` dans l'objet existant). Contrepartie : `cleanupCurrentGame()` et chaque nouvelle manche remettent `gameState.players = {}`, sinon l'ancienne position locale est réappliquée.
- **Autorité par onglet** : `localEntityIds()` = joueur local (+ IA en solo). Chaque onglet ne gère que la mort/les bonus de ses entités. Les bombes sont explosées par l'onglet du propriétaire, sauf retard > `BOMB_OWNER_GRACE`.
- Joueurs distants lissés à l'affichage (`getDisplayPosition`, `remoteDisplay`), purement visuel.
- **4 places** `PLAYER_SLOTS` (player1..4 : coin de départ seulement). player1 = l'hôte, toujours humain ; player2 au coin opposé (duel équitable). Une IA est un joueur ordinaire avec `ai: true` (`isAi()`, `aiIds()`), simulée par l'onglet de l'hôte : `localEntityIds()` = joueur local + IA si hôte.
- Multi : salle d'attente (`renderLobby`) tant que `gameStarted` est faux. Les amis prennent la première place libre (`transaction`, anti-collision), l'hôte ajoute/retire des IA puis `launchGame()` (2 joueurs min). Partie commencée = plus d'arrivée.
- Départ en cours de match : `presentIds()` (joueurs du match encore présents). Le match continue sans lui (il n'est pas replacé à la manche suivante) sauf si l'hôte part ou s'il reste < 2 joueurs.
- Déconnexion : `applyDisconnectPolicy()` (seul humain → la partie est supprimée, sinon seulement son joueur).
- IA (`moveAI(id, ai)`, `startAI` = une boucle pour toutes les IA, `stopAI`) : état par entité dans `aiBrains` (`lastMove`, `history`). Chasse l'ennemi vivant le plus proche (`nearestEnemy`, humains et autres IA). Décision toutes les `AI_MOVE_DELAY` ms, niveaux `AI_LEVELS` (localStorage `islandBomber.aiLevel`, celui de l'hôte en multi), nombre d'IA en solo `aiCount` (`islandBomber.aiCount`). Fuite par BFS (`getBestEscapeDirection`, `hasEscapeRoute` qui simule la bombe avant de la poser, profondeur `aiEscapeMaxSteps()`). Distinguer « je suis en danger » (case actuelle → fuite) et « je vais vers le danger » (case cible → interdit, filtre `safeDirections`).
- `update()` continue quand le joueur local est mort (spectateur) : ses bombes et les IA de l'hôte doivent continuer à tourner.
- Manches/marée : `gameState.match`, l'hôte (player1) fait `finishRound()` / `startRound()`. Marée calculée sur l'heure serveur (`serverNow()`), aucune écriture. URL de test : `?manches=N&maree=secondes`.
- Bonus : BONUS_TYPES (bombe, puissance, vitesse, coup de pied, détonateur, flamme perçante, noix de coco pourrie = malus). Effets : `sfx()` WebAudio, `detectEvents()`, `fx.particles` / `fx.deaths`, textes flottants locaux.
- Réglages de partie (menu, `gameSettings`, localStorage `islandBomber.settings`) : manches, marée, quantité (`BONUS_RATES`) et types de bonus. Recopiés dans le match à la création (`bonusRate`, `bonusTypes` en chaîne « 0,1,3 » car un tableau vide disparaît de Firebase) : le créateur décide pour tous ; `allowedBonusTypes()` / `bonusRate()` les lisent. Menu sans partie = `body.in-menu` (île masquée).
- Animation de marche : l'image suit la distance parcourue (`WALK_CYCLE_TILES`), pas l'horloge. Sprites personnage : échelle commune et tête centrée (`fit_character`).
- Personnages : `player.character` (`CHARACTERS` : 6 animaux + baigneuse), choisi dans le menu (localStorage `islandBomber.character`), IA = animal au hasard (`pickAiCharacter`, distincts si possible) + étiquette « IA » au-dessus de la tête. Maillot = `player.suit` (`SUIT_COLORS`, 8 couleurs, choisi dans le menu, localStorage `islandBomber.suit`) ; chacun pour soi : couleurs uniques (`freeSuit`, ordre `SUIT_AUTO_ORDER`), équipes : couleur d'équipe (`suitForSlot`). Noms par couleur (`nameOf` : « Joueur vert », numéro de place si homonymes). Atlas : baigneuse en maillot ROUGE (`red_<dir>_<i>`), animaux en maillot BLEU (`<animal>_<dir>_<i>`), recolorés à la volée (`frameSource` + `tintedFrame`, cache canvas ; en `file://` canvas contaminé → couleur d'origine).
- Mode équipes 2 contre 2 (réglage « Mode », `match.mode = 'equipes'`, `match.teamColors` = maillot du créateur contre bleu/rouge) : `TEAM_OF` places 1+3 (haut) contre 2+4 (bas), 4 joueurs obligatoires (solo : vous + 1 IA contre 2 IA). `roundDecided`, `finishRound` (les 2 membres marquent, `lastWinner`/`matchWinner` = 'A'/'B'), `iWon`, `isEnemy` (IA : ne vise pas et ne piège pas un coéquipier). Tirs amis actifs. Dessin via `drawCharacter(lookOf(id), …)`, portraits via `portraitCss`. Planches `assets/src/perso_<animal>.jpg` (prompts : `assets/src/PROMPTS_PERSONNAGES.md`), maillot bleu vif pour ne pas recolorer les têtes rouges/roses.
- Cartes à thème (`THEMES` : plage, lagon, volcan, jungle, ponton, grotte, tempête ; réglage « Carte », `aleatoire` = tirée à chaque manche) : `match.mapChoice` + `match.theme` (manche en cours), sprites `<thème>_sol/sol2/mur/casse/bord/m1/m2/m3` (planches `assets/src/carte_<thème>.jpg`, `map_sheet()` dans `build_sprites.py`), `themeSprite(slot)`. Éléments dans `games/<salle>/features` (clé `x_y`, `generateFeatures`, écrits avec la carte par `roundSetup`) : courant (lagon, `applyTileEffects` entraîne l'entité arrêtée), fissure → trou (volcan 2 explosions, ponton 1 ; `crackCells` par l'onglet qui explose la bombe ; trou = infranchissable et mortel), terrier (jungle, téléporte, verrou `_burrowLock`), herbes (jungle, dessinées par-dessus les joueurs), lumière (grotte, `renderDarkness`). Tempête : l'hôte écrit `storm` (`updateStorm`), chaque onglet juge ses entités (`coconutHits`) ; l'IA évite ombres (`coconutThreat`) et trous. URL de test : `?carte=<thème>`.
- Repères debug : `aiBrains[id].history` (15 dernières décisions par IA, `logAiHistory()` à chaque mort), logs `MORT de …` et `IA fuite: aucune case sure…` (compteurs bombes/explosions).

## Leçons (pièges déjà payés)
- Toute entité créée par `push()` Firebase DOIT stocker `ref.key` comme `id` (créer la ref avant l'objet). Sinon `.remove()` vise un chemin inexistant → entité immortelle (bombes en boucle, explosions accumulées qui rendaient toute la carte « dangereuse » pour l'IA). Le helper `toArray()` conserve les clés.
- `databaseURL` doit rester explicite dans `firebaseConfig` (base hors US) ; sinon le SDK échoue silencieusement.
- La latency compensation Firebase déclenche le listener en synchrone au milieu de `explodeBomb` : à garder en tête en cas d'explosion en chaîne bizarre.
- Bonus nés d'une explosion : spawn différé (`pendingBonusSpawns`) après `checkBonusesInExplosion`.
- Les 4 coins de départ sont des cases paires/paires, donc des palmiers par défaut : `generateMap()` doit les dégager explicitement.
- `.btn` impose son `display` : l'attribut `hidden` ne cache pas un bouton, passer par `style.display`.
- En `file://`, le warning Chrome « Unsafe attempt to load URL » est bénin ; sinon servir via `python -m http.server`.

## Style et direction
- Thème plage/île uniquement (pas de rasta/surfeur/pirate dans les textes). Libellés : « joueur rouge / bleu / vert / jaune », « l'IA » quand elle est seule, sinon « IA bleue / verte / jaune », « Défaite » plutôt que « Game Over ».
- Code et commentaires en français.

## État et prochaine étape
Lot 4 validé en jeu et en ligne. Ensuite : animation fluide, menu épuré, réglages de partie (69/69).
Personnages à tête d'animal intégrés (71/71). Cartes à thème + mécaniques intégrées (92/92). Maillot au choix, mode équipes, menu à plat (réglages visibles, boutons en bas), rivières du lagon (98/98) : pas encore validés en jeu. Autres jeux : après Bomberman complet.

Lots 1 (sons, animations, niveaux IA), 2 (nouveaux bonus/malus), 3 (manches, score, marée) et 4 (jusqu'à 4 joueurs : solo contre 1 à 3 IA, multi avec salle d'attente et IA bouche-trou) faits et testés automatiquement (98/98 en `test:local`), pas encore validés en jeu à la main ni avec `npm test` sur la vraie base : demander un retour de test d'abord.

Limite connue : les IA sont simulées par l'onglet de l'hôte ; si cet onglet passe en arrière-plan, le navigateur ralentit ses timers et les IA avec.

Non retenu : commandes tactiles.
