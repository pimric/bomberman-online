// Logique d'intelligence artificielle améliorée

// Variables de l'IA
let aiMode = false;
let aiPlayerId = 'playerAI';
let aiMoveInterval;
let aiLastMove = { dx: 0, dy: 0 }; // Mémorise le dernier mouvement pour éviter les aller-retours
let aiTarget = null; // Cible actuelle de l'IA
let aiLastTargetUpdate = 0;

// Démarrer l'IA
function startAI() {
    console.log("Démarrage de l'IA");
    if (aiMoveInterval) clearInterval(aiMoveInterval);
    
    // Donner un délai initial avant que l'IA ne commence à bouger
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
            
            // Considérer de placer une bombe (avec une probabilité modérée)
            if (Math.random() < 0.15) { // 15% de chance à chaque mise à jour
                tryPlaceBomb(aiPlayer);
            }
            
        }, AI_MOVE_DELAY);
    }, 800); // Attendre 800ms avant le premier mouvement
}

// Essayer de placer une bombe intelligemment
function tryPlaceBomb(aiPlayer) {
    // Obtenir la position actuelle sur la grille
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // Vérifier si une bombe est déjà présente à cet endroit
    const bombsAtPosition = gameState.bombs.filter(bomb => 
        bomb.x === gridX && bomb.y === gridY
    );
    
    // Si une bombe est déjà là, ne pas en placer une autre
    if (bombsAtPosition.length > 0) return;
    
    // Compte le nombre de bombes actives de l'IA
    const activeBombs = gameState.bombs.filter(bomb => 
        bomb.playerId === aiPlayerId
    );
    
    // Si l'IA a déjà atteint sa limite de bombes, ne pas en placer d'autres
    if (activeBombs.length >= aiPlayer.maxBombs) return;
    
    // Vérifier s'il y a des briques ou le joueur à proximité
    let shouldPlaceBomb = false;
    const player = gameState.players['player1'];
    
    // Vérifier les 4 directions + la case actuelle
    const directions = [
        { dx: 0, dy: 0 },  // case actuelle
        { dx: 0, dy: -1 }, // haut
        { dx: 1, dy: 0 },  // droite
        { dx: 0, dy: 1 },  // bas
        { dx: -1, dy: 0 }  // gauche
    ];
    
    for (const dir of directions) {
        const checkX = gridX + dir.dx;
        const checkY = gridY + dir.dy;
        
        // Vérifier si la case est dans les limites
        if (checkX < 0 || checkX >= GRID_SIZE || checkY < 0 || checkY >= GRID_SIZE) {
            continue;
        }
        
        // Si c'est une brique, on peut vouloir la détruire
        if (gameState.map[checkY][checkX] === TILE_TYPES.BRICK) {
            shouldPlaceBomb = true;
        }
        
        // Si le joueur est là, on veut certainement le viser
        if (player && player.alive) {
            const playerGridX = Math.floor(player.x / TILE_SIZE);
            const playerGridY = Math.floor(player.y / TILE_SIZE);
            
            if (checkX === playerGridX && checkY === playerGridY) {
                shouldPlaceBomb = true;
                break; // Priorité maximale si on peut toucher le joueur
            }
        }
    }
    
    if (shouldPlaceBomb) {
        // Vérifier s'il y a une issue pour ne pas se bloquer
        // (Une seule direction libre suffit)
        let hasEscape = false;
        
        for (let i = 1; i < directions.length; i++) { // ignorer la case actuelle
            const escapeX = gridX + directions[i].dx;
            const escapeY = gridY + directions[i].dy;
            
            if (escapeX >= 0 && escapeX < GRID_SIZE && escapeY >= 0 && escapeY < GRID_SIZE) {
                if (gameState.map[escapeY][escapeX] === TILE_TYPES.EMPTY) {
                    hasEscape = true;
                    break;
                }
            }
        }
        
        if (hasEscape) {
            // Placer la bombe
            const newBomb = {
                id: generateId(),
                playerId: aiPlayerId,
                x: gridX,
                y: gridY,
                range: aiPlayer.bombRange,
                timer: Date.now() + BOMB_TIMER
            };
            
            database.ref(`games/${gameState.roomId}/bombs`).push(newBomb);
            
            // Mémoriser qu'il faut fuir
            aiTarget = {
                type: 'escape',
                timestamp: Date.now()
            };
        }
    }
}

// Fonction pour trouver une direction d'échappement
function findEscapeDirection(aiPlayer) {
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // Liste des directions possibles
    const directions = [
        { dx: 0, dy: -1, priority: 0 }, // haut
        { dx: 1, dy: 0, priority: 0 },  // droite
        { dx: 0, dy: 1, priority: 0 },  // bas
        { dx: -1, dy: 0, priority: 0 }  // gauche
    ];
    
    // Évaluer chaque direction
    for (const dir of directions) {
        const newX = gridX + dir.dx;
        const newY = gridY + dir.dy;
        
        // Vérifier si cette direction est valide
        if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) {
            dir.priority = -1000; // Direction invalide
            continue;
        }
        
        // Si c'est un mur ou une brique, on ne peut pas aller par là
        if (gameState.map[newY][newX] !== TILE_TYPES.EMPTY) {
            dir.priority = -1000;
            continue;
        }
        
        // Vérifier s'il y a une bombe ici
        const bombHere = gameState.bombs.some(bomb => bomb.x === newX && bomb.y === newY);
        if (bombHere) {
            dir.priority = -500;
            continue;
        }
        
        // Calculer la distance aux bombes (plus c'est loin, mieux c'est)
        let minBombDistance = 1000;
        for (const bomb of gameState.bombs) {
            // Manhattan distance
            const distance = Math.abs(bomb.x - newX) + Math.abs(bomb.y - newY);
            minBombDistance = Math.min(minBombDistance, distance);
        }
        
        // Ajouter la distance aux bombes à la priorité
        dir.priority += minBombDistance * 10;
        
        // Vérifier si on est sur la même ligne ou colonne qu'une bombe (dangereux)
        for (const bomb of gameState.bombs) {
            const bombRange = bomb.range || 1;
            
            // Même ligne
            if (newY === bomb.y && Math.abs(newX - bomb.x) <= bombRange) {
                // Vérifier s'il y a un obstacle entre nous et la bombe
                let blocked = false;
                const start = Math.min(newX, bomb.x);
                const end = Math.max(newX, bomb.x);
                
                for (let x = start + 1; x < end; x++) {
                    if (gameState.map[newY][x] !== TILE_TYPES.EMPTY) {
                        blocked = true;
                        break;
                    }
                }
                
                if (!blocked) {
                    dir.priority -= 300; // Direction dangereuse
                }
            }
            
            // Même colonne
            if (newX === bomb.x && Math.abs(newY - bomb.y) <= bombRange) {
                // Vérifier s'il y a un obstacle entre nous et la bombe
                let blocked = false;
                const start = Math.min(newY, bomb.y);
                const end = Math.max(newY, bomb.y);
                
                for (let y = start + 1; y < end; y++) {
                    if (gameState.map[y][newX] !== TILE_TYPES.EMPTY) {
                        blocked = true;
                        break;
                    }
                }
                
                if (!blocked) {
                    dir.priority -= 300; // Direction dangereuse
                }
            }
        }
    }
    
    // Trier les directions par priorité
    directions.sort((a, b) => b.priority - a.priority);
    
    // Retourner la meilleure direction si elle est valide
    if (directions[0].priority > -100) {
        return directions[0];
    }
    
    // Si aucune direction n'est bonne, retourner null
    return null;
}

// Fonction pour vérifier si l'IA est en danger
function isInDanger(aiPlayer) {
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // Vérifier s'il y a une bombe à la position actuelle
    const bombHere = gameState.bombs.some(bomb => bomb.x === gridX && bomb.y === gridY);
    if (bombHere) return true;
    
    // Vérifier si on est dans la zone d'explosion d'une bombe
    for (const bomb of gameState.bombs) {
        const bombRange = bomb.range || 1;
        
        // Même ligne
        if (gridY === bomb.y && Math.abs(gridX - bomb.x) <= bombRange) {
            // Vérifier s'il y a un obstacle entre nous et la bombe
            let blocked = false;
            const start = Math.min(gridX, bomb.x);
            const end = Math.max(gridX, bomb.x);
            
            for (let x = start + 1; x < end; x++) {
                if (gameState.map[gridY][x] !== TILE_TYPES.EMPTY) {
                    blocked = true;
                    break;
                }
            }
            
            if (!blocked) return true;
        }
        
        // Même colonne
        if (gridX === bomb.x && Math.abs(gridY - bomb.y) <= bombRange) {
            // Vérifier s'il y a un obstacle entre nous et la bombe
            let blocked = false;
            const start = Math.min(gridY, bomb.y);
            const end = Math.max(gridY, bomb.y);
            
            for (let y = start + 1; y < end; y++) {
                if (gameState.map[y][gridX] !== TILE_TYPES.EMPTY) {
                    blocked = true;
                    break;
                }
            }
            
            if (!blocked) return true;
        }
    }
    
    return false;
}

// Fonction pour trouver une cible (joueur ou brique)
function findTarget(aiPlayer) {
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // Probabilité de cibler le joueur (75%) ou une brique (25%)
    const targetPlayer = Math.random() < 0.75;
    
    if (targetPlayer) {
        // Essayer de cibler le joueur
        const player = gameState.players['player1'];
        if (player && player.alive) {
            const playerGridX = Math.floor(player.x / TILE_SIZE);
            const playerGridY = Math.floor(player.y / TILE_SIZE);
            
            return {
                type: 'player',
                x: playerGridX,
                y: playerGridY,
                timestamp: Date.now()
            };
        }
    }
    
    // Sinon, chercher une brique proche
    const bricks = [];
    
    // Chercher des briques dans un rayon de 5 cases
    const searchRadius = 5;
    
    for (let y = Math.max(0, gridY - searchRadius); y <= Math.min(GRID_SIZE - 1, gridY + searchRadius); y++) {
        for (let x = Math.max(0, gridX - searchRadius); x <= Math.min(GRID_SIZE - 1, gridX + searchRadius); x++) {
            if (gameState.map[y][x] === TILE_TYPES.BRICK) {
                // Calculer la distance
                const distance = Math.abs(gridX - x) + Math.abs(gridY - y);
                bricks.push({ x, y, distance });
            }
        }
    }
    
    // Trier par distance croissante
    bricks.sort((a, b) => a.distance - b.distance);
    
    if (bricks.length > 0) {
        // Prendre une brique aléatoire parmi les 3 plus proches
        const targetIndex = Math.min(Math.floor(Math.random() * 3), bricks.length - 1);
        const target = bricks[targetIndex];
        
        return {
            type: 'brick',
            x: target.x,
            y: target.y,
            timestamp: Date.now()
        };
    }
    
    // Si on n'a trouvé ni joueur ni brique, cibler une position aléatoire
    return {
        type: 'random',
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
        timestamp: Date.now()
    };
}

// Fonction pour trouver un chemin vers une cible
function findPathToTarget(startX, startY, targetX, targetY) {
    // Directions possibles
    const directions = [
        { dx: 0, dy: -1 }, // haut
        { dx: 1, dy: 0 },  // droite
        { dx: 0, dy: 1 },  // bas
        { dx: -1, dy: 0 }  // gauche
    ];
    
    // Si la cible est un mur ou une brique, trouver une case adjacente
    if (gameState.map[targetY][targetX] !== TILE_TYPES.EMPTY) {
        for (const dir of directions) {
            const adjX = targetX + dir.dx;
            const adjY = targetY + dir.dy;
            
            if (adjX >= 0 && adjX < GRID_SIZE && adjY >= 0 && adjY < GRID_SIZE) {
                if (gameState.map[adjY][adjX] === TILE_TYPES.EMPTY) {
                    targetX = adjX;
                    targetY = adjY;
                    break;
                }
            }
        }
    }
    
    // Utiliser un algorithme simple de recherche de chemin (BFS)
    const queue = [];
    const visited = {};
    const parents = {};
    
    // Ajouter la position de départ
    queue.push({ x: startX, y: startY });
    visited[`${startX},${startY}`] = true;
    
    while (queue.length > 0) {
        const current = queue.shift();
        
        // Si on est arrivé à la cible (ou à une case adjacente pour le joueur)
        if (current.x === targetX && current.y === targetY) {
            // Reconstruire le chemin
            const path = [];
            let pos = { x: current.x, y: current.y };
            
            while (parents[`${pos.x},${pos.y}`]) {
                path.unshift(pos);
                pos = parents[`${pos.x},${pos.y}`];
            }
            
            return path;
        }
        
        // Explorer les voisins
        for (const dir of directions) {
            const newX = current.x + dir.dx;
            const newY = current.y + dir.dy;
            
            // Vérifier si cette position est valide
            if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) {
                continue;
            }
            
            // Vérifier si cette position est un obstacle
            if (gameState.map[newY][newX] !== TILE_TYPES.EMPTY) {
                continue;
            }
            
            // Vérifier si on n'a pas déjà visité cette position
            if (visited[`${newX},${newY}`]) {
                continue;
            }
            
            // Ajouter cette position à la file d'attente
            queue.push({ x: newX, y: newY });
            visited[`${newX},${newY}`] = true;
            parents[`${newX},${newY}`] = { x: current.x, y: current.y };
        }
    }
    
    // Si on n'a pas trouvé de chemin
    return null;
}

// Déplacer l'IA - version améliorée et plus agressive
function moveAI(aiPlayer) {
    // Obtenir la position actuelle de l'IA sur la grille
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // S'assurer que l'IA est bien centrée sur sa case
    const centerX = gridX * TILE_SIZE + TILE_SIZE / 2;
    const centerY = gridY * TILE_SIZE + TILE_SIZE / 2;
    
    // Vérifier si l'IA est en danger (priorité maximale)
    const danger = isInDanger(aiPlayer);
    
    if (danger) {
        // On est en danger, il faut fuir!
        const escapeDir = findEscapeDirection(aiPlayer);
        
        if (escapeDir) {
            // On a trouvé une direction pour s'échapper
            const newX = aiPlayer.x + escapeDir.dx * PLAYER_SPEED;
            const newY = aiPlayer.y + escapeDir.dy * PLAYER_SPEED;
            
            if (isValidPosition(newX, newY)) {
                aiPlayer.x = newX;
                aiPlayer.y = newY;
                
                // Synchroniser avec Firebase
                database.ref(`games/${gameState.roomId}/players/${aiPlayerId}`).update({
                    x: aiPlayer.x,
                    y: aiPlayer.y
                });
                
                return;
            }
        }
    }
    
    // Si on n'est pas centré (et pas en danger), se centrer d'abord
    if (Math.abs(aiPlayer.x - centerX) > 2 || Math.abs(aiPlayer.y - centerY) > 2) {
        const dx = Math.sign(centerX - aiPlayer.x) * Math.min(PLAYER_SPEED, Math.abs(centerX - aiPlayer.x));
        const dy = Math.sign(centerY - aiPlayer.y) * Math.min(PLAYER_SPEED, Math.abs(centerY - aiPlayer.y));
        
        aiPlayer.x += dx;
        aiPlayer.y += dy;
        
        // Synchroniser avec Firebase
        database.ref(`games/${gameState.roomId}/players/${aiPlayerId}`).update({
            x: aiPlayer.x,
            y: aiPlayer.y
        });
        
        return;
    }
    
    // Mettre à jour la cible si nécessaire (toutes les 3 secondes)
    const currentTime = Date.now();
    if (!aiTarget || currentTime - aiTarget.timestamp > 3000) {
        aiTarget = findTarget(aiPlayer);
    }
    
    // Si on a une cible, essayer de s'y rendre
    if (aiTarget) {
        if (aiTarget.type === 'escape') {
            // Si on doit s'échapper, on l'a déjà fait ci-dessus
            // Après 1 seconde, on peut arrêter de fuir
            if (currentTime - aiTarget.timestamp > 1000) {
                aiTarget = null;
            }
            return;
        }
        
        // Trouver un chemin vers la cible
        const path = findPathToTarget(gridX, gridY, aiTarget.x, aiTarget.y);
        
        if (path && path.length > 0) {
            // Prendre la première étape du chemin
            const nextStep = path[0];
            
            // Calculer la direction de mouvement
            const dx = (nextStep.x * TILE_SIZE + TILE_SIZE / 2) - aiPlayer.x;
            const dy = (nextStep.y * TILE_SIZE + TILE_SIZE / 2) - aiPlayer.y;
            
            // Normaliser et appliquer la vitesse
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length > 0) {
                const normalizedDx = dx / length * PLAYER_SPEED;
                const normalizedDy = dy / length * PLAYER_SPEED;
                
                // Vérifier si le mouvement est valide
                const newX = aiPlayer.x + normalizedDx;
                const newY = aiPlayer.y + normalizedDy;
                
                if (isValidPosition(newX, newY)) {
                    aiPlayer.x = newX;
                    aiPlayer.y = newY;
                    
                    // Synchroniser avec Firebase
                    database.ref(`games/${gameState.roomId}/players/${aiPlayerId}`).update({
                        x: aiPlayer.x,
                        y: aiPlayer.y
                    });
                    
                    // Si on est arrivé à destination
                    if (Math.abs(aiPlayer.x - (nextStep.x * TILE_SIZE + TILE_SIZE / 2)) < 2 &&
                        Math.abs(aiPlayer.y - (nextStep.y * TILE_SIZE + TILE_SIZE / 2)) < 2) {
                        
                        // Si on est proche de la cible finale
                        if (nextStep.x === aiTarget.x && nextStep.y === aiTarget.y) {
                            // Considérer de poser une bombe avec une probabilité élevée
                            if (Math.random() < 0.7) {
                                tryPlaceBomb(aiPlayer);
                            }
                            
                            // Réinitialiser la cible
                            aiTarget = null;
                        }
                    }
                    
                    return;
                }
            }
        }
    }
    
    // Si on n'a pas pu suivre un chemin, faire un mouvement aléatoire
    // Directions possibles
    const directions = [
        { dx: 0, dy: -PLAYER_SPEED }, // haut
        { dx: PLAYER_SPEED, dy: 0 },  // droite
        { dx: 0, dy: PLAYER_SPEED },  // bas
        { dx: -PLAYER_SPEED, dy: 0 }  // gauche
    ];
    
    // Filtrer les directions valides
    const validDirections = directions.filter(dir => {
        const newX = aiPlayer.x + dir.dx;
        const newY = aiPlayer.y + dir.dy;
        return isValidPosition(newX, newY);
    });
    
    // Favoriser la direction actuelle pour éviter les zigzags
    const continueStraight = validDirections.find(dir => 
        Math.abs(dir.dx - aiLastMove.dx) < 0.1 && Math.abs(dir.dy - aiLastMove.dy) < 0.1
    );
    
    if (continueStraight && Math.random() < 0.7 && aiLastMove.dx !== 0 && aiLastMove.dy !== 0) {
        // 70% de chance de continuer dans la même direction
        const newX = aiPlayer.x + continueStraight.dx;
        const newY = aiPlayer.y + continueStraight.dy;
        
        aiPlayer.x = newX;
        aiPlayer.y = newY;
        aiLastMove = continueStraight;
    } else if (validDirections.length > 0) {
        // Sinon prendre une direction aléatoire
        const randomDir = validDirections[Math.floor(Math.random() * validDirections.length)];
        
        const newX = aiPlayer.x + randomDir.dx;
        const newY = aiPlayer.y + randomDir.dy;
        
        aiPlayer.x = newX;
        aiPlayer.y = newY;
        aiLastMove = randomDir;
    }
    
    // Synchroniser avec Firebase
    database.ref(`games/${gameState.roomId}/players/${aiPlayerId}`).update({
        x: aiPlayer.x,
        y: aiPlayer.y
    });
}