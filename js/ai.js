// Logique d'intelligence artificielle améliorée

// Variables de l'IA
let aiMode = false;
let aiPlayerId = 'playerAI';
let aiMoveInterval;
let aiLastMove = { dx: 0, dy: 0 }; // Mémorise le dernier mouvement pour éviter les aller-retours
let aiPathfinding = {
    targetX: null,
    targetY: null,
    path: [],
    lastPathUpdate: 0
};

// Démarrer l'IA
function startAI() {
    console.log("Démarrage de l'IA");
    if (aiMoveInterval) clearInterval(aiMoveInterval);
    
    // Donner un délai initial avant que l'IA ne commence à bouger
    // pour éviter qu'elle ne meure immédiatement
    setTimeout(() => {
        aiMoveInterval = setInterval(() => {
            if (!gameState.gameStarted || !aiMode) return;
            
            const aiPlayer = gameState.players[aiPlayerId];
            if (!aiPlayer || !aiPlayer.alive) {
                clearInterval(aiMoveInterval);
                return;
            }
            
            // Logique de mouvement de l'IA
            moveAI(aiPlayer);
            
            // Possibilité de placer une bombe (contrôlée par la stratégie)
            considerPlacingBomb(aiPlayer);
            
        }, AI_MOVE_DELAY);
    }, 1000); // Attendre 1 seconde avant le premier mouvement
}

// Fonction pour considérer intelligemment le placement d'une bombe
function considerPlacingBomb(aiPlayer) {
    // Obtenir la position actuelle sur la grille
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // Si le joueur est proche, haute probabilité de poser une bombe
    const player = gameState.players['player1'];
    if (player && player.alive) {
        const playerGridX = Math.floor(player.x / TILE_SIZE);
        const playerGridY = Math.floor(player.y / TILE_SIZE);
        
        const distance = Math.abs(gridX - playerGridX) + Math.abs(gridY - playerGridY);
        
        // Si le joueur est à 1-2 cases de distance et sur la même ligne/colonne
        if (distance <= 2 && (gridX === playerGridX || gridY === playerGridY)) {
            // Haute chance de placer une bombe (80%)
            if (Math.random() < 0.8) {
                if (hasEscapeRoute(gridX, gridY)) {
                    placeAIBomb(aiPlayer);
                    // Fuir immédiatement
                    aiPathfinding.targetX = null;
                    return;
                }
            }
        }
    }
    
    // Si on est à côté d'une brique, probabilité de poser une bombe pour la détruire
    // Vérifier les 4 directions
    const directions = [
        { dx: 0, dy: -1 }, // haut
        { dx: 1, dy: 0 },  // droite
        { dx: 0, dy: 1 },  // bas
        { dx: -1, dy: 0 }  // gauche
    ];
    
    let bricksNearby = false;
    
    for (const dir of directions) {
        const newX = gridX + dir.dx;
        const newY = gridY + dir.dy;
        
        // Vérifier si c'est dans la carte
        if (newX >= 0 && newX < GRID_SIZE && newY >= 0 && newY < GRID_SIZE) {
            // Si c'est une brique
            if (gameState.map[newY][newX] === TILE_TYPES.BRICK) {
                bricksNearby = true;
                break;
            }
        }
    }
    
    // S'il y a des briques à proximité et aucune bombe n'est déjà en place
    if (bricksNearby && !isBombNearby(gridX, gridY, 1)) {
        // Vérifier qu'on a une route d'échappement
        if (hasEscapeRoute(gridX, gridY)) {
            // 30% de chance de poser une bombe
            if (Math.random() < 0.3) {
                placeAIBomb(aiPlayer);
                // Réinitialiser le pathfinding pour s'échapper
                aiPathfinding.targetX = null;
            }
        }
    }
}

// Vérifier si l'IA a une route d'échappement avant de poser une bombe
function hasEscapeRoute(x, y) {
    // Vérifier les 4 directions
    const directions = [
        { dx: 0, dy: -1 }, // haut
        { dx: 1, dy: 0 },  // droite
        { dx: 0, dy: 1 },  // bas
        { dx: -1, dy: 0 }  // gauche
    ];
    
    // Check si au moins une direction est libre
    for (const dir of directions) {
        const newX = x + dir.dx;
        const newY = y + dir.dy;
        
        // Si cette case est accessible
        if (newX >= 0 && newX < GRID_SIZE && newY >= 0 && newY < GRID_SIZE) {
            if (gameState.map[newY][newX] === TILE_TYPES.EMPTY && !isBombAt(newX, newY)) {
                // Et qu'il y a encore une échappatoire depuis cette case
                const furtherDirections = directions.filter(d => 
                    !(d.dx === -dir.dx && d.dy === -dir.dy) // Toutes les directions sauf celle d'où on vient
                );
                
                for (const fDir of furtherDirections) {
                    const furtherX = newX + fDir.dx;
                    const furtherY = newY + fDir.dy;
                    
                    if (furtherX >= 0 && furtherX < GRID_SIZE && furtherY >= 0 && furtherY < GRID_SIZE) {
                        if (gameState.map[furtherY][furtherX] === TILE_TYPES.EMPTY && !isBombAt(furtherX, furtherY)) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    
    return false;
}

// Vérifier si une bombe est à une position spécifique
function isBombAt(x, y) {
    return gameState.bombs.some(bomb => bomb.x === x && bomb.y === y);
}

// Vérifier si une bombe est dans un rayon autour d'une position
function isBombNearby(x, y, radius) {
    return gameState.bombs.some(bomb => {
        const distance = Math.abs(bomb.x - x) + Math.abs(bomb.y - y);
        return distance <= radius;
    });
}

// Vérifier si une position est menacée par l'explosion d'une bombe
function isPositionThreatened(x, y) {
    // Pour chaque bombe dans le jeu
    for (const bomb of gameState.bombs) {
        const bombRange = bomb.range || 1;
        
        // Si on est sur la même ligne ou colonne que la bombe
        if (bomb.x === x || bomb.y === y) {
            // Calculer la distance
            const distance = Math.abs(bomb.x - x) + Math.abs(bomb.y - y);
            
            // Si on est dans la portée de la bombe
            if (distance <= bombRange) {
                // Vérifier s'il y a un mur/brique entre nous et la bombe
                let blocked = false;
                
                // Si même ligne
                if (bomb.y === y) {
                    const start = Math.min(bomb.x, x);
                    const end = Math.max(bomb.x, x);
                    
                    for (let i = start + 1; i < end; i++) {
                        if (gameState.map[y][i] !== TILE_TYPES.EMPTY) {
                            blocked = true;
                            break;
                        }
                    }
                }
                // Si même colonne
                else if (bomb.x === x) {
                    const start = Math.min(bomb.y, y);
                    const end = Math.max(bomb.y, y);
                    
                    for (let i = start + 1; i < end; i++) {
                        if (gameState.map[i][x] !== TILE_TYPES.EMPTY) {
                            blocked = true;
                            break;
                        }
                    }
                }
                
                // Si rien ne bloque l'explosion, cette position est menacée
                if (!blocked) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

// Trouver une position sûre (loin des bombes)
function findSafePosition(currentX, currentY) {
    // Construire une grille de sécurité
    const safetyGrid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(0));
    
    // Marquer les positions dangereuses
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            // Si c'est un mur ou une brique, ce n'est pas sûr
            if (gameState.map[y][x] !== TILE_TYPES.EMPTY) {
                safetyGrid[y][x] = -1;
                continue;
            }
            
            // Si une bombe est ici, ce n'est pas sûr
            if (isBombAt(x, y)) {
                safetyGrid[y][x] = -1;
                continue;
            }
            
            // Si cette position est menacée par une explosion
            if (isPositionThreatened(x, y)) {
                safetyGrid[y][x] = -1;
                continue;
            }
            
            // Sinon, la sécurité est proportionnelle à la distance avec les bombes
            // Plus on est loin des bombes, plus c'est sûr
            let minBombDistance = Infinity;
            for (const bomb of gameState.bombs) {
                const distance = Math.abs(bomb.x - x) + Math.abs(bomb.y - y);
                minBombDistance = Math.min(minBombDistance, distance);
            }
            
            // La valeur de sécurité est la distance minimale aux bombes
            // (si pas de bombes, c'est très sûr)
            safetyGrid[y][x] = minBombDistance === Infinity ? 100 : minBombDistance;
        }
    }
    
    // Trouver la position accessible la plus sûre
    // (accessible = atteignable depuis la position actuelle)
    const queue = [];
    const visited = new Set();
    const currentGridX = Math.floor(currentX / TILE_SIZE);
    const currentGridY = Math.floor(currentY / TILE_SIZE);
    
    // Si la position actuelle est sûre, on peut y rester
    if (safetyGrid[currentGridY][currentGridX] > 0) {
        return { x: currentGridX, y: currentGridY, safety: safetyGrid[currentGridY][currentGridX] };
    }
    
    // Commencer la recherche depuis la position actuelle
    queue.push({ x: currentGridX, y: currentGridY, path: [] });
    visited.add(`${currentGridX},${currentGridY}`);
    
    while (queue.length > 0) {
        const { x, y, path } = queue.shift();
        
        // Directions possibles
        const directions = [
            { dx: 0, dy: -1 }, // haut
            { dx: 1, dy: 0 },  // droite
            { dx: 0, dy: 1 },  // bas
            { dx: -1, dy: 0 }  // gauche
        ];
        
        for (const dir of directions) {
            const newX = x + dir.dx;
            const newY = y + dir.dy;
            const key = `${newX},${newY}`;
            
            // Vérifier si cette case est dans les limites et n'a pas été visitée
            if (newX >= 0 && newX < GRID_SIZE && newY >= 0 && newY < GRID_SIZE && !visited.has(key)) {
                visited.add(key);
                
                // Si cette case est sûre
                if (safetyGrid[newY][newX] > 0) {
                    // Construire le chemin pour y arriver
                    const newPath = [...path, { x: newX, y: newY }];
                    
                    return { 
                        x: newX, 
                        y: newY, 
                        safety: safetyGrid[newY][newX],
                        path: newPath
                    };
                }
                
                // Si cette case est accessible (mais pas sûre), continuer la recherche
                if (safetyGrid[newY][newX] !== -1) {
                    const newPath = [...path, { x: newX, y: newY }];
                    queue.push({ x: newX, y: newY, path: newPath });
                }
            }
        }
    }
    
    // Si aucune position sûre n'est trouvée, retourner la position actuelle
    return { x: currentGridX, y: currentGridY, safety: -1, path: [] };
}

// Déplacer l'IA - version améliorée
function moveAI(aiPlayer) {
    // Obtenir la position actuelle de l'IA sur la grille
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // Vérifier si l'IA est en danger (une bombe est à proximité)
    let inDanger = false;
    
    // Vérifier si la position actuelle est menacée par une explosion
    if (isPositionThreatened(gridX, gridY) || isBombAt(gridX, gridY)) {
        inDanger = true;
    }
    
    // S'assurer que l'IA est bien centrée sur sa case actuelle
    // pour éviter de se bloquer contre les murs
    const centerX = gridX * TILE_SIZE + TILE_SIZE / 2;
    const centerY = gridY * TILE_SIZE + TILE_SIZE / 2;
    
    // Si l'IA n'est pas bien centrée, la recentrer d'abord
    // (sauf si elle est en danger, auquel cas elle doit fuir immédiatement)
    if (!inDanger && (Math.abs(aiPlayer.x - centerX) > 2 || Math.abs(aiPlayer.y - centerY) > 2)) {
        const dx = Math.sign(centerX - aiPlayer.x) * Math.min(PLAYER_SPEED, Math.abs(centerX - aiPlayer.x));
        const dy = Math.sign(centerY - aiPlayer.y) * Math.min(PLAYER_SPEED, Math.abs(centerY - aiPlayer.y));
        
        if (dx !== 0) aiPlayer.x += dx;
        if (dy !== 0) aiPlayer.y += dy;
        
        // Synchroniser avec Firebase
        database.ref(`games/${gameState.roomId}/players/${aiPlayerId}`).update({
            x: aiPlayer.x,
            y: aiPlayer.y
        });
        
        return; // Ne pas faire d'autre mouvement pour ce tour
    }
    
    // Si on est en danger, trouver une position sûre
    if (inDanger) {
        // Réinitialiser le pathfinding pour trouver une nouvelle route sûre
        aiPathfinding.targetX = null;
        aiPathfinding.targetY = null;
        
        const safePosition = findSafePosition(aiPlayer.x, aiPlayer.y);
        
        // Si on a trouvé une position sûre avec un chemin
        if (safePosition.safety > 0 && safePosition.path && safePosition.path.length > 0) {
            // Prendre la première étape du chemin
            const nextStep = safePosition.path[0];
            
            // Calculer la direction vers cette étape
            const dx = (nextStep.x * TILE_SIZE + TILE_SIZE / 2) - aiPlayer.x;
            const dy = (nextStep.y * TILE_SIZE + TILE_SIZE / 2) - aiPlayer.y;
            
            // Normaliser le mouvement pour maintenir la vitesse constante
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length > 0) {
                const normalizedDx = dx / length * PLAYER_SPEED;
                const normalizedDy = dy / length * PLAYER_SPEED;
                
                // Appliquer le mouvement
                aiPlayer.x += normalizedDx;
                aiPlayer.y += normalizedDy;
                
                // Mémoriser le dernier mouvement
                aiLastMove = { dx: normalizedDx, dy: normalizedDy };
                
                // Synchroniser avec Firebase
                database.ref(`games/${gameState.roomId}/players/${aiPlayerId}`).update({
                    x: aiPlayer.x,
                    y: aiPlayer.y
                });
            }
            
            return;
        }
    }
    
    // Si on n'est pas en danger ou qu'on n'a pas trouvé de position sûre,
    // on peut soit chercher à casser des briques, soit attaquer le joueur
    
    // Mettre à jour le pathfinding si nécessaire (toutes les X secondes)
    const currentTime = Date.now();
    if (!aiPathfinding.targetX || currentTime - aiPathfinding.lastPathUpdate > 2000) {
        // Reset le pathfinding
        aiPathfinding.path = [];
        
        const player = gameState.players['player1'];
        if (player && player.alive) {
            const playerGridX = Math.floor(player.x / TILE_SIZE);
            const playerGridY = Math.floor(player.y / TILE_SIZE);
            
            // Déterminer si on va vers le joueur ou vers une brique
            const distanceToPlayer = Math.abs(gridX - playerGridX) + Math.abs(gridY - playerGridY);
            
            // Si le joueur est proche (moins de 5 cases), 70% de chances de le cibler
            // sinon, 30% de chances de le cibler
            const targetPlayer = Math.random() < (distanceToPlayer < 5 ? 0.7 : 0.3);
            
            if (targetPlayer) {
                // Cibler le joueur, mais s'arrêter à une distance de 1 case pour poser une bombe
                const path = findPath(gridX, gridY, playerGridX, playerGridY, true);
                
                if (path && path.length > 0) {
                    aiPathfinding.path = path;
                    aiPathfinding.targetX = playerGridX;
                    aiPathfinding.targetY = playerGridY;
                }
            } else {
                // Cibler une brique aléatoire
                const bricks = [];
                
                for (let y = 0; y < GRID_SIZE; y++) {
                    for (let x = 0; x < GRID_SIZE; x++) {
                        if (gameState.map[y][x] === TILE_TYPES.BRICK) {
                            // Calculer la distance
                            const distance = Math.abs(gridX - x) + Math.abs(gridY - y);
                            
                            // Préférer les briques plus proches
                            if (distance < 10) {
                                bricks.push({ x, y, distance });
                            }
                        }
                    }
                }
                
                // Trier par distance
                bricks.sort((a, b) => a.distance - b.distance);
                
                // Prendre une brique aléatoire parmi les 5 plus proches
                if (bricks.length > 0) {
                    const targetBrick = bricks[Math.min(Math.floor(Math.random() * 5), bricks.length - 1)];
                    
                    // Trouver un chemin vers une case adjacente à la brique
                    const directions = [
                        { dx: 0, dy: -1 }, // haut
                        { dx: 1, dy: 0 },  // droite
                        { dx: 0, dy: 1 },  // bas
                        { dx: -1, dy: 0 }  // gauche
                    ];
                    
                    // Essayer chaque direction
                    for (const dir of directions) {
                        const adjacentX = targetBrick.x + dir.dx;
                        const adjacentY = targetBrick.y + dir.dy;
                        
                        // Vérifier si cette case adjacente est accessible
                        if (adjacentX >= 0 && adjacentX < GRID_SIZE && 
                            adjacentY >= 0 && adjacentY < GRID_SIZE && 
                            gameState.map[adjacentY][adjacentX] === TILE_TYPES.EMPTY) {
                            
                            const path = findPath(gridX, gridY, adjacentX, adjacentY, false);
                            
                            if (path && path.length > 0) {
                                aiPathfinding.path = path;
                                aiPathfinding.targetX = adjacentX;
                                aiPathfinding.targetY = adjacentY;
                                break;
                            }
                        }
                    }
                }
            }
            
            aiPathfinding.lastPathUpdate = currentTime;
        }
    }
    
    // Si on a un chemin, le suivre
    if (aiPathfinding.path && aiPathfinding.path.length > 0) {
        const nextStep = aiPathfinding.path[0];
        
        // Si on est arrivé à la destination
        const currentGridX = Math.floor(aiPlayer.x / TILE_SIZE);
        const currentGridY = Math.floor(aiPlayer.y / TILE_SIZE);
        
        if (currentGridX === nextStep.x && currentGridY === nextStep.y) {
            // Passer à l'étape suivante
            aiPathfinding.path.shift();
            
            // Si c'était la dernière étape
            if (aiPathfinding.path.length === 0) {
                // Si on est arrivé à la destination finale
                if (currentGridX === aiPathfinding.targetX && currentGridY === aiPathfinding.targetY) {
                    // On est arrivé, poser une bombe si approprié
                    considerPlacingBomb(aiPlayer);
                }
                
                // Réinitialiser le pathfinding
                aiPathfinding.targetX = null;
                aiPathfinding.targetY = null;
                return;
            }
        }
        
        // Continuer à suivre le chemin
        const nextPoint = aiPathfinding.path[0];
        
        // Calculer la direction vers la prochaine étape
        const targetX = nextPoint.x * TILE_SIZE + TILE_SIZE / 2;
        const targetY = nextPoint.y * TILE_SIZE + TILE_SIZE / 2;
        
        const dx = targetX - aiPlayer.x;
        const dy = targetY - aiPlayer.y;
        
        // Normaliser le mouvement pour maintenir la vitesse constante
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 0) {
            const normalizedDx = dx / length * PLAYER_SPEED;
            const normalizedDy = dy / length * PLAYER_SPEED;
            
            // Vérifier si le mouvement est valide
            const newX = aiPlayer.x + normalizedDx;
            const newY = aiPlayer.y + normalizedDy;
            
            if (isValidPosition(newX, newY)) {
                // Appliquer le mouvement
                aiPlayer.x = newX;
                aiPlayer.y = newY;
                
                // Mémoriser le dernier mouvement
                aiLastMove = { dx: normalizedDx, dy: normalizedDy };
                
                // Synchroniser avec Firebase
                database.ref(`games/${gameState.roomId}/players/${aiPlayerId}`).update({
                    x: aiPlayer.x,
                    y: aiPlayer.y
                });
            } else {
                // Si le mouvement est bloqué, réinitialiser le pathfinding
                aiPathfinding.targetX = null;
                aiPathfinding.targetY = null;
                aiPathfinding.path = [];
            }
        }
    } else {
        // Si on n'a pas de chemin, faire un mouvement aléatoire
        // Directions possibles: haut, bas, gauche, droite
        const directions = [
            { dx: 0, dy: -PLAYER_SPEED, name: 'haut' },
            { dx: 0, dy: PLAYER_SPEED, name: 'bas' },
            { dx: -PLAYER_SPEED, dy: 0, name: 'gauche' },
            { dx: PLAYER_SPEED, dy: 0, name: 'droite' }
        ];
        
        // Filtrer les directions valides (sans obstacle)
        const validDirections = directions.filter(dir => {
            // Vérifier la position après le mouvement
            const newX = aiPlayer.x + dir.dx;
            const newY = aiPlayer.y + dir.dy;
            
            return isValidPosition(newX, newY);
        });
        
        // Favoriser la direction actuelle pour éviter les zigzags
        const continueStraight = validDirections.find(dir => 
            (dir.dx === aiLastMove.dx && dir.dy === aiLastMove.dy) && 
            (dir.dx !== 0 || dir.dy !== 0)
        );
        
        let chosenDirection;
        
        if (continueStraight && Math.random() < 0.7) {
            // 70% de chance de continuer tout droit
            chosenDirection = continueStraight;
        } else if (validDirections.length > 0) {
            // Sinon, direction aléatoire
            chosenDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
            
            // Mémoriser la nouvelle direction
            aiLastMove = { dx: chosenDirection.dx, dy: chosenDirection.dy };
        } else {
            // Pas de direction valide, rester sur place
            return;
        }
        
        // Appliquer le mouvement
        aiPlayer.x += chosenDirection.dx;
        aiPlayer.y += chosenDirection.dy;
        
        // Synchroniser avec Firebase
        database.ref(`games/${gameState.roomId}/players/${aiPlayerId}`).update({
            x: aiPlayer.x,
            y: aiPlayer.y
        });
    }
}

// Trouver un chemin entre deux points (algorithme A*)
function findPath(startX, startY, endX, endY, stopNextTo) {
    // Si les points sont identiques, retourner un chemin vide
    if (startX === endX && startY === endY) {
        return [];
    }
    
    // Classe pour représenter un nœud dans l'algorithme A*
    class Node {
        constructor(x, y, g, h, parent) {
            this.x = x;
            this.y = y;
            this.g = g; // Coût depuis le départ
            this.h = h; // Heuristique (distance à vol d'oiseau jusqu'à l'arrivée)
            this.f = g + h; // Coût total
            this.parent = parent; // Nœud parent
        }
    }
    
    // Fonction pour calculer l'heuristique (distance de Manhattan)
    const heuristic = (x, y) => Math.abs(x - endX) + Math.abs(y - endY);
    
    // Listes ouverte et fermée
    const openList = [];
    const closedList = new Set();
    
    // Ajouter le nœud de départ à la liste ouverte
    openList.push(new Node(startX, startY, 0, heuristic(startX, startY), null));
    
    // Tant que la liste ouverte n'est pas vide
    while (openList.length > 0) {
        // Trier la liste ouverte par coût total (f)
        openList.sort((a, b) => a.f - b.f);
        
        // Prendre le nœud avec le coût le plus faible
        const current = openList.shift();
        
        // Ajouter ce nœud à la liste fermée
        closedList.add(`${current.x},${current.y}`);
        
        // Si on est arrivé à destination (ou à côté si stopNextTo est true)
        if (current.x === endX && current.y === endY ||
            (stopNextTo && Math.abs(current.x - endX) + Math.abs(current.y - endY) === 1)) {
            // Reconstruire le chemin
            const path = [];
            let node = current;
            
            while (node.parent) {
                path.unshift({ x: node.x, y: node.y });
                node = node.parent;
            }
            
            return path;
        }
        
        // Directions possibles
        const directions = [
            { dx: 0, dy: -1 }, // haut
            { dx: 1, dy: 0 },  // droite
            { dx: 0, dy: 1 },  // bas
            { dx: -1, dy: 0 }  // gauche
        ];
        
        // Explorer les voisins
        for (const dir of directions) {
            const newX = current.x + dir.dx;
            const newY = current.y + dir.dy;
            
            // Vérifier si ce voisin est dans les limites
            if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) {
                continue;
            }
            
            // Vérifier si ce voisin est un obstacle (mur ou brique)
            if (gameState.map[newY][newX] !== TILE_TYPES.EMPTY) {
                continue;
            }
            
            // Vérifier si ce voisin est dans la liste fermée
            if (closedList.has(`${newX},${newY}`)) {
                continue;
            }
            
            // Calculer le nouveau coût g
            const newG = current.g + 1;
            
            // Vérifier si ce voisin est déjà dans la liste ouverte
            const existingNode = openList.find(node => node.x === newX && node.y === newY);
            
            if (existingNode) {
                // Si on a trouvé un meilleur chemin, mettre à jour le nœud
                if (newG < existingNode.g) {
                    existingNode.g = newG;
                    existingNode.f = newG + existingNode.h;
                    existingNode.parent = current;
                }
            } else {
                // Ajouter ce voisin à la liste ouverte
                openList.push(new Node(newX, newY, newG, heuristic(newX, newY), current));
            }
        }
    }
    
    // Si on arrive ici, c'est qu'on n'a pas trouvé de chemin
    return null;
}

// L'IA place une bombe
function placeAIBomb(aiPlayer) {
    // Obtenir la position de la grille
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // Vérifier si une bombe est déjà présente à cet endroit
    const bombsAtPosition = gameState.bombs.filter(bomb => 
        bomb.x === gridX && bomb.y === gridY
    );
    
    // Compte le nombre de bombes actives de l'IA
    const activeBombs = gameState.bombs.filter(bomb => 
        bomb.playerId === aiPlayerId
    );
    
    // Placer la bombe si possible
    if (bombsAtPosition.length === 0 && activeBombs.length < aiPlayer.maxBombs) {
        const newBomb = {
            id: generateId(),
            playerId: aiPlayerId,
            x: gridX,
            y: gridY,
            range: aiPlayer.bombRange,
            timer: Date.now() + BOMB_TIMER
        };
        
        // Vérifier si placer une bombe est sécuritaire
        // (l'IA a au moins une direction pour s'échapper)
        if (hasEscapeRoute(gridX, gridY)) {
            // Ajouter la bombe au jeu
            database.ref(`games/${gameState.roomId}/bombs`).push(newBomb);
        }
    }
}