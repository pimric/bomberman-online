# Island Bomber — brief illustrateur

Bomberman en ligne sur île tropicale, vu de dessus, 13×13 cases, jusqu'à 4 joueurs.
Tout le jeu est refait graphiquement : **156 images au total**. Aucune ne doit rester de l'ancien style.

## Récapitulatif (à cocher)

| Lot | Contenu | Images |
|---|---|---|
| A | Personnages (7 × 13 poses) | 91 |
| B | Décor plage de base (sol, sol 2, mur, cassable, eau) | 5 |
| C | 6 cartes à thème (6 × 8 tuiles) | 48 |
| D | Bombe et flammes | 5 |
| E | Bonus et malus | 7 |
| | **Total** | **156** |

Conseil : livrer lot par lot (ordre D → E → B → C → A) pour valider le style sur peu d'images avant de produire les 91 personnages. **Étape 0 = planche de style, à faire valider avant le reste.**

---

## Étape 0 — Planche de style (validation)

Avant tout : 1 personnage (baigneuse, face), 1 sol, 1 mur, 1 cassable, 1 bombe, 1 flamme, 1 bonus, placés côte à côte sur une case de 13×13 simulée. On valide le style, la palette et la lisibilité, puis on lance la production.

## Règles de style communes (tous les lots)

- Style cartoon / chibi, contours épais bruns foncés, couleurs franches et plates, léger relief. Ambiance plage/île tropicale, joyeuse. Pas de rasta, surfeur ni pirate.
- **Lisibilité à très petite taille** : dans le jeu, une case fait 64 px (parfois 32 px pour les portraits). Formes simples, contrastes francs, aucun détail fin.
- Vue de dessus légèrement inclinée (3/4) pour les personnages et objets, vue de dessus pour les sols. Même angle partout.
- Lumière venant d'en haut à gauche, même ombre douce partout.
- **Lisibilité de jeu** (important) : un joueur doit distinguer d'un coup d'œil sol / mur indestructible / bloc cassable. Le mur est sombre et massif ; le cassable est plus petit, cerclé de clair, visiblement fragile. Ne pas les confondre avec le sol.
- Interdit : texte, chiffres, cadres, fond dégradé, couleur magenta/rose vif #FF00FF dans les éléments.

## Format de livraison (valable pour tout)

- **Un fichier PNG par image**, fond **transparent** (alpha propre, sans liseré blanc ni halo).
- Taille de travail : **256 × 256 px** par image (le jeu les réduit à 64 px). Tuiles : carré plein. Objets et personnages : centrés dans le carré, marge de 8 px.
- Nommage **exact** (minuscules, sans accent, `_` comme séparateur), tel que dans les listes ci-dessous. Le nom du fichier = le nom dans le jeu.
- Un dossier par lot, le tout dans un `.zip` : `A_personnages/`, `B_plage/`, `C_cartes/`, `D_bombe_flammes/`, `E_bonus/`.
- Fournir aussi les **fichiers sources** (PSD / Procreate / Affinity / AI) pour retouches futures.
- Livraison par WeTransfer, Drive ou GitHub, avec le lot concerné indiqué dans le nom du zip (ex. `islandbomber_D_bombe_flammes_v1.zip`).

---

## Lot A — Personnages (91 images)

**7 personnages × 13 poses.**

Personnages (nom de fichier = préfixe) :
1. `baigneuse` — jeune femme en maillot de bain une pièce (la mascotte)
2. `goeland` — corps de baigneuse, tête de goéland blanc, dessus gris clair, gros bec jaune à bout rouge, air malicieux
3. `poisson` — tête de poisson-clown orange, deux bandes blanches bordées de noir, petites nageoires sur les côtés, bouche souriante
4. `tortue` — tête de tortue de mer vert olive, écailles plus claires, bec arrondi, sourire tranquille
5. `crabe` — tête de crabe ronde rouge orangé, yeux ronds sur pédoncules, petite bouche souriante (mains humaines, pas de pinces)
6. `flamant` — tête de flamant rose, cou court stylisé, bec recourbé rose clair à bout noir
7. `dauphin` — tête de dauphin gris clair (pas bleu), menton blanc cassé, rostre court arrondi, grand sourire

Les 6 animaux ont le même corps, la même taille, les mêmes proportions que la baigneuse (seule la tête change). Tous portent des lunettes de soleil noires, lisibles de face et de profil.

**Maillot** : une pièce, **bleu vif uni #1E5BFF**, sans motif, identique sur toutes les images. Le jeu le recolore automatiquement en rouge / vert / jaune / etc. pour les joueurs. Donc : ce bleu exact n'apparaît **nulle part ailleurs** sur le personnage (pas de peau, plume, œil ou accessoire bleu vif) et le maillot est une zone uniforme, sans ombrage d'une autre teinte.

**Poses à fournir par personnage (13)** — nom : `<personnage>_<direction>_<n>.png`

| Direction | Fichiers | Description |
|---|---|---|
| Face (vers le bas) | `_down_0`, `_down_1`, `_down_2` | `down_0` = debout les pieds joints ; `down_1` = pas du pied gauche ; `down_2` = pas du pied droit |
| Dos (vers le haut) | `_up_0`, `_up_1`, `_up_2` | mêmes 3 poses vues de dos |
| Profil droit | `_right_0` … `_right_6` | `right_0` = debout ; `right_1` à `right_6` = cycle de marche en 6 étapes (contact, descente, passage, contact opposé, descente, passage) |

- **Ne pas fournir** les poses vers la gauche : le jeu les génère en miroir. Le personnage doit donc être symétrique en profil (pas de détail asymétrique indispensable : logo, cicatrice…).
- **Même position des pieds dans le carré sur les 13 images** (pieds au même niveau, centre du corps au même endroit), sinon le personnage « saute » pendant la marche.
- Même échelle sur les 13 images (la pose la plus haute tient dans le carré avec 8 px de marge).
- Exemple pour le goéland : `goeland_down_0.png` … `goeland_right_6.png` (13 fichiers).

Total lot A : 7 × 13 = **91**.

---

## Lot B — Décor plage de base (5 images)

C'est la carte par défaut. Toutes en carré 256 × 256.

| Fichier | Rôle |
|---|---|
| `sand.png` | sol, sable clair, tuile pleine |
| `sand2.png` | variante du sol (alternée en damier), même luminosité, motif différent |
| `palm.png` | obstacle **fixe** : palmier sur socle sombre, indestructible |
| `barrel.png` | obstacle **cassable** : tonneau/caisse, plus petit que la case, cerclé de clair |
| `water.png` | eau (bord de l'île et marée qui monte), tuile pleine |

Règles tuiles (`sand`, `sand2`, `water`) : carré plein sans bordure, **se répète sans raccord visible**, pas de liseré clair sur les bords.

---

## Lot C — 6 cartes à thème (48 images)

Pour chaque thème : **8 images**, nommées `<thème>_<emplacement>.png`.

Emplacements communs : `sol`, `sol2`, `mur`, `casse`, `bord`, `m1`, `m2`, `m3`.

- `sol` / `sol2` : tuiles de sol (carré plein, répétables sans raccord, variante sans contraste fort avec `sol`)
- `mur` : obstacle fixe indestructible
- `casse` : obstacle cassable (plus petit que la case, cerclé de clair)
- `bord` : tuile du pourtour de la carte, **liseré visible côté droit** (comme l'eau)
- `m1`, `m2`, `m3` : éléments de la mécanique propre au thème (voir tableau)

| Thème | Ambiance | `m1` | `m2` | `m3` | Type |
|---|---|---|---|---|---|
| `lagon` | eau turquoise, corail, sable blanc | courant d'eau vers la droite | courant vers la gauche | courant vers le haut / bas (2 variantes si possible) | tuiles pleines |
| `ponton` | planches de bois sur l'eau | planche fissurée (1 explosion = trou) | planche fissurée en rouge (prochaine = trou) | trou (eau visible sous le ponton) | `mur`/`casse` en objets, reste tuiles |
| `tempete` | ciel gris, vagues, pluie | ombre de noix de coco (rond sombre au sol) | noix de coco qui tombe | éclaboussure à l'impact | `casse`, `m2`, `m3` en objets |
| `grotte` | roche sombre, cristaux, lueurs | (tuile) | (tuile) | (tuile) | `mur`/`casse` en objets |
| `jungle` | végétation dense, lianes | terrier (entrée, téléporte) | herbes hautes (dessinées par-dessus les joueurs, semi-couvrantes) | terrier (sortie) | `mur`/`casse`/`m2` en objets |
| `volcan` | roche noire, lave | sable/roche fissurée (1re fissure) | fissure avec liseré rouge (la prochaine fait un trou) | trou de lave | `mur`/`casse` en objets |

Notes :
- « Objet » = proportions gardées, fond transparent, tient dans la case. « Tuile » = carré plein remplissant toute la case.
- Mur, cassable et bonus doivent rester lisibles sur le sol de leur thème (bon contraste, pas de couleur sol = couleur mur).
- Sur `grotte`, le jeu assombrit tout sauf autour des joueurs : prévoir une grotte déjà sombre mais lisible.

Total lot C : 6 × 8 = **48**.

---

## Lot D — Bombe et flammes (5 images)

| Fichier | Description |
|---|---|
| `bomb.png` | bombe posée, mèche allumée (version normale) |
| `bomb_remote.png` | bombe télécommandée (détonateur), distincte de la normale au premier coup d'œil (couleur ou antenne) |
| `flame_center.png` | centre de l'explosion (carré plein de flamme) |
| `flame_mid.png` | segment de flamme horizontal raccordable (se répète bout à bout, tourné par le jeu pour la verticale) |
| `flame_end.png` | extrémité de flamme arrondie, **pointe vers la droite** |

Les 3 flammes doivent se raccorder sans couture visible. La bombe doit être très lisible sur sable, eau, roche et lave.

---

## Lot E — Bonus et malus (7 images)

Chacun est un badge/icône ronde ou carrée avec contour épais, pictogramme simple, lisible à 40 px. Tous de la même famille graphique. Pas de texte.

| Fichier | Effet | Pictogramme suggéré | Couleur |
|---|---|---|---|
| `bonus_bomb.png` | +1 bombe | bombe | vert |
| `bonus_power.png` | portée des flammes +1 | flamme | rouge |
| `bonus_speed.png` | vitesse | aile / chaussure ailée | bleu clair |
| `bonus_kick.png` | coup de pied (pousse les bombes) | pied / chaussure | violet |
| `bonus_detonator.png` | détonateur | télécommande / bouton | orange |
| `bonus_pierce.png` | flamme perçante | flamme qui traverse | turquoise |
| `bonus_malus.png` | malus (noix de coco pourrie) | noix de coco abîmée, mine renfrognée | marron/gris, clairement « mauvais » |

Chaque bonus doit avoir une couleur dominante différente des autres pour être reconnu sans lire l'icône.

---

## Calendrier conseillé (étape par étape)

1. **Étape 0** — planche de style → validation de notre côté (1 aller-retour max).
2. **Étape 1** — Lot D (5) + Lot E (7) : 12 images, le plus court, valide le rendu en jeu.
3. **Étape 2** — Lot B (5) : le décor de base. Test en jeu.
4. **Étape 3** — Lot A, `baigneuse` seule (13) : valide l'animation de marche (pieds alignés, miroir correct) avant de décliner.
5. **Étape 4** — Lot A, les 6 animaux (78), un animal à la fois ou tous ensemble.
6. **Étape 5** — Lot C : 6 cartes (48), un thème à la fois.
7. **Étape 6** — retouches après intégration en jeu (prévoir 1 tour).

À chaque étape, on intègre les images dans le jeu et on renvoie des captures pour les retouches.

## Ce que fait le jeu ensuite (côté dev, pour info)

Les PNG sont assemblés automatiquement en une seule planche (`tools/build_sprites.py`), réduits à 64 px, et les maillots sont recolorés par le jeu. L'illustrateur n'a rien d'autre à fournir (pas de planche, pas de fond magenta, pas de découpage).
