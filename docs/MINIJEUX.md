# Mini-jeux (Mario Party / WarioWare) — idées à reprendre après Bomberman

Projet futur : mini-jeux 2 à 4 joueurs (humains ou IA), thème île, Canvas + Firebase, clavier (flèches + 1 touche) et tactile. Catalogue issu d'une recherche Perplexity (~58 idées, sources à revérifier).

## Décisions d'architecture (à garder)
- Nouveau fichier `minijeux.html` (ou dossier `minijeux/`) avec un moteur commun : salle d'attente, personnages/maillots (déjà faits), compte à rebours, classement, points, tactile. Chaque jeu = `init`, `update`, `render`, `score`.
- Netcode : garder le modèle Bomberman (chaque onglet simule son joueur, l'hôte gère chrono, graine aléatoire, classement). Pas d'hôte autoritaire sur les inputs.
- Jeux sans physique partagée d'abord (même graine, chacun joue sa propre épreuve, on compare les scores). Jeux de poussée/collision entre joueurs ensuite.
- Plateau « Tour du Lagon » en dernier ; version simple d'abord : enchaîner ~5 mini-jeux avec classement cumulé (1er 10 pièces, 2e 6, 3e 3, 4e 1).
- Finale possible : « La Grande Marée » (course + eau qui monte).

## 12 premiers jeux
1. Coco Smash (appui rapide) 2. Vague ! (timing) 3. Course de Serviettes 4. Île qui Rétrécit 5. Boules de Plage (pousser) 6. Lancer de Coco (visée) 7. Pêche Turbo 8. Coquillages Jumeaux (paires) 9. Danse des Tiki (séquence) 10. Sauvetage des Baigneurs (coop) 11. Marée Montante 12. Coco Bombe (bluff)

Ordre conseillé : 1, 2, 6, 7, 8, 9 (sans physique partagée) puis 3, 4, 11, 5, 12, 10.

## Autres idées (catégories)
- Réflexes : Soleil Couchant, Crabe Pressé, Bouteille à la Mer, Maillot Sec, Palmier Timide, Surf Express
- Courses : Kayak Cascades, Escalade Coco, Sprint des Flamants, Tunnel de Bambous, Radeau Rapide, Relais des Îles, Chasse au Trésor Express
- Arène : Piège à Crabes, Tuiles de Sable, Parasol Bumper, Palmes Folles, requin poursuivant, cerceaux tournants
- Adresse : Tir au Ballon, Frisbee Plage, Cerf-volant, Arrosoir, Cocktail Cascade, Château de Sable
- Mémoire : Sable Mystère, Code du Coffre, Carte au Trésor, Compte les Mouettes
- Coop / 2c2 : Bar à Cocktails, Volley Géant, Radeau à Deux, Feu de Camp, Pêche en Duo
- 1 contre 3 : Le Grand Requin, Chasseur de Coco, Gardien du Trésor, Barman Chaos, Crabe Géant
- Entre manches : Marché Tropical, Roue du Lagon, Duel de Serviettes, Météo Tropicale

## Première étape quand on reprend
Moteur commun + 2 jeux simples (Coco Smash, Course de Serviettes) pour valider la boucle complète (salle d'attente, manche, classement, rejouer) et un test auto.
