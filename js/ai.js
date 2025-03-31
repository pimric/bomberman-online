// Logique d'intelligence artificielle améliorée

// Variables de l'IA
let aiMode = false;
let aiPlayerId = 'playerAI';
let aiMoveInterval;

// Démarrer l'IA
function startAI() {
    if (aiMoveInterval) clearInterval(aiMoveInterval);
    
    aiMoveInterval = setInterval(() => {
        if (!gameState.gameStarted || !aiMode) return;
        
        const aiPlayer = gameState.players[aiPlayerId];
        if (!aiPlayer || !aiPlayer.alive) {
            clearInterval(aiMoveInterval);
            return;
        }
        
        // Logique de mouvement de l'IA
        moveAI(aiPlayer);
        
        // Possibilité de placer une bombe (aléatoirement)
        if (Math.random() < 0.1) { // 10% de chance à chaque mise à jour
            placeAIBomb(aiPlayer);
        }
    }, AI_MOVE_DELAY);
}

// Déplacer l'IA - version améliorée
function moveAI(aiPlayer) {
    // Obtenir la position actuelle de l'IA sur la grille
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // S'assurer que l'IA est bien centrée sur sa case actuelle
    // pour éviter de se bloquer contre les murs
    const centerX = gridX * TILE_SIZE + TILE_SIZE / 2;
    const centerY = gridY * TILE_SIZE + TILE_SIZE / 2;
    
    // Si l'IA n'est pas bien centrée, la recentrer d'abord
    if (Math.abs(aiPlayer.x - centerX) > 2 || Math.abs(aiPlayer.y - centerY) > 2) {
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
    
    // Directions possibles: haut, bas, gauche, droite
    const directions = [
        { dx: 0, dy: -PLAYER_SPEED, name: 'haut' },
        { dx: 0, dy: PLAYER_SPEED, name: 'bas' },
        { dx: -PLAYER_SPEED, dy: 0, name: 'gauche' },
        { dx: PLAYER_SPEED, dy: 0, name: 'droite' }
    ];
    
    // Filtrer les directions valides (sans obstacle)
    const validDirections = directions.filter(dir => {
        // Vérifier la position après le mouvement complet (pas juste un pixel)
        // pour s'assurer que l'IA peut réellement se déplacer dans cette direction
        const newGridX = Math.floor((aiPlayer.x + dir.dx * 4) / TILE_SIZE);
        const newGridY = Math.floor((aiPlayer.y + dir.dy * 4) / TILE_SIZE);
        
        if (newGridX !== gridX || newGridY !== gridY) {
            // On vérifie si la nouvelle case est accessible
            return newGridX >= 0 && newGridX < GRID_SIZE && 
                   newGridY >= 0 && newGridY < GRID_SIZE && 
                   gameState.map[newGridY][newGridX] === TILE_TYPES.EMPTY;
        }
        
        // Si on reste sur la même case, c'est valide
        return true;
    });
    
    // Si aucune direction valide, rester immobile
    if (validDirections.length === 0) {
        // Si l'IA est bloquée, essayer de poser une bombe pour se frayer un chemin
        if (Math.random() < 0.5) {
            placeAIBomb(aiPlayer);
        }
        return;
    }
    
    // Vérifier s'il y a des bombes à proximité
    const nearbyBomb = gameState.bombs.some(bomb => {
        const bombDistance = Math.sqrt(
            Math.pow((bomb.x * TILE_SIZE + TILE_SIZE / 2 - aiPlayer.x) / TILE_SIZE, 2) + 
            Math.pow((bomb.y * TILE_SIZE + TILE_SIZE / 2 - aiPlayer.y) / TILE_SIZE, 2)
        );
        return bombDistance < 2;
    });
    
    let chosenDirection;
    
    // Si une bombe est à proximité, fuir
    if (nearbyBomb) {
        // Trier les directions valides par distance aux bombes (privilégier celle qui s'éloigne le plus)
        const safeDirections = validDirections.map(dir => {
            const newPos = {
                x: aiPlayer.x + dir.dx * 3,
                y: aiPlayer.y + dir.dy * 3
            };
            
            // Calculer la distance minimale à toutes les bombes depuis cette nouvelle position
            let minBombDistance = Infinity;
            gameState.bombs.forEach(bomb => {
                const bombPos = {
                    x: bomb.x * TILE_SIZE + TILE_SIZE / 2,
                    y: bomb.y * TILE_SIZE + TILE_SIZE / 2
                };
                const distance = Math.sqrt(
                    Math.pow((bombPos.x - newPos.x) / TILE_SIZE, 2) + 
                    Math.pow((bombPos.y - newPos.y) / TILE_SIZE, 2)
                );
                minBombDistance = Math.min(minBombDistance, distance);
            });
            
            return {
                direction: dir,
                safety: minBombDistance
            };
        }).sort((a, b) => b.safety - a.safety);
        
        // Prendre la direction la plus sûre
        chosenDirection = safeDirections.length > 0 ? safeDirections[0].direction : validDirections[0];
    } else {
        // Comportement normal: se diriger vers le joueur humain
        const player = gameState.players['player1'];
        
        if (player && player.alive) {
            // Intelligence simple: chercher à s'approcher du joueur humain
            const distanceToPlayer = Math.sqrt(
                Math.pow((player.x - aiPlayer.x) / TILE_SIZE, 2) + 
                Math.pow((player.y - aiPlayer.y) / TILE_SIZE, 2)
            );
            
            if (distanceToPlayer < 3 && Math.random() < 0.7) {
                // Échapper au joueur (aller dans la direction opposée)
                const playerDirX = player.x > aiPlayer.x ? 1 : -1;
                const playerDirY = player.y > aiPlayer.y ? 1 : -1;
                
                // Chercher une direction qui s'éloigne du joueur
                const escapeDirs = validDirections.filter(dir => {
                    return (dir.dx * playerDirX <= 0) || (dir.dy * playerDirY <= 0);
                });
                
                chosenDirection = escapeDirs.length > 0 
                    ? escapeDirs[Math.floor(Math.random() * escapeDirs.length)]
                    : validDirections[Math.floor(Math.random() * validDirections.length)];
                    
                // Forte chance de poser une bombe
                if (Math.random() < 0.3) {
                    placeAIBomb(aiPlayer);
                }
            } else {
                // Se déplacer vers le joueur
                validDirections.sort((a, b) => {
                    const distA = Math.abs((aiPlayer.x + a.dx * 4 - player.x) / TILE_SIZE) + 
                                 Math.abs((aiPlayer.y + a.dy * 4 - player.y) / TILE_SIZE);
                    const distB = Math.abs((aiPlayer.x + b.dx * 4 - player.x) / TILE_SIZE) + 
                                 Math.abs((aiPlayer.y + b.dy * 4 - player.y) / TILE_SIZE);
                    return distA - distB;
                });
                
                // Ajouter du hasard pour que l'IA ne soit pas trop prévisible
                chosenDirection = Math.random() < 0.7 
                    ? validDirections[0] // 70% de chance de prendre la meilleure direction
                    : validDirections[Math.floor(Math.random() * validDirections.length)];
            }
        } else {
            // Si pas de joueur, déplacement aléatoire
            chosenDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
        }
    }
    
    // Appliquer le mouvement
    const newX = aiPlayer.x + chosenDirection.dx;
    const newY = aiPlayer.y + chosenDirection.dy;
    
    // Vérifier une dernière fois si la position est valide
    if (isValidPosition(newX, newY)) {
        // Mettre à jour la position de l'IA
        aiPlayer.x = newX;
        aiPlayer.y = newY;
        
        // Synchroniser avec Firebase
        database.ref(`games/${gameState.roomId}/players/${aiPlayerId}`).update({
            x: aiPlayer.x,
            y: aiPlayer.y
        });
    }
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
        const directions = [
            { dx: 0, dy: -1 }, // haut
            { dx: 0, dy: 1 },  // bas
            { dx: -1, dy: 0 }, // gauche
            { dx: 1, dy: 0 }   // droite
        ];
        
        let hasEscape = false;
        for (const dir of directions) {
            const newX = (gridX + dir.dx);
            const newY = (gridY + dir.dy);
            
            if (newX >= 0 && newX < GRID_SIZE && newY >= 0 && newY < GRID_SIZE &&
                gameState.map[newY][newX] === TILE_TYPES.EMPTY) {
                hasEscape = true;
                break;
            }
        }
        
        // Seulement placer la bombe si l'IA peut s'échapper
        if (hasEscape) {
            // Ajouter la bombe au jeu
            database.ref(`games/${gameState.roomId}/bombs`).push(newBomb);
        }
    }
}