# Prompts Gemini — cartes à thème

Référence à joindre : `assets/src/decor.png`
(https://raw.githubusercontent.com/pimric/bomberman-online/main/assets/src/decor.png).
Fichiers attendus : `assets/src/carte_<nom>.png` (lagon, volcan, jungle, ponton, grotte, tempete).

Mise en page imposée (découpage automatique, `tools/build_sprites.py`) :
- Ligne 1 : (1) sol, (2) variante du sol, (3) obstacle fixe, (4) obstacle cassable.
- Ligne 2 : (5) tuile de bord (liseré côté DROIT, comme l'eau de la référence), (6) (7) (8) éléments de la mécanique.
- Fond magenta pur #FF00FF, éléments bien séparés, aucune couleur magenta/rose vif dans les éléments.

Le texte complet de chaque prompt est dans le message de session du 24/09 ; le bloc commun :

> Planche de tuiles pour un jeu vidéo 2D en vue de dessus, exactement dans le même style que l'image jointe (cartoon, contours sombres, couleurs vives et plates, léger relief). 8 éléments de même taille, disposés en 2 lignes de 4, bien séparés, sur un fond uni magenta pur #FF00FF (aucun dégradé, aucun texte, aucun numéro, aucune ombre qui déborde). Les tuiles de sol et de bord sont des carrés pleins, sans bordure, qui se répètent sans raccord visible. Les obstacles sont vus de dessus et tiennent dans un carré. N'utilise aucun rose ou magenta dans les éléments.
