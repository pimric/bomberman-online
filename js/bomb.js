// Logique des bombes et explosions

// Placer une bombe
function placeBomb() {
    if (!gameState.roomId || !gameState.playerId || !gameState.gameStarted) return;
    
    const player = gameState.players[gameState.playerId];
    if (!player || !player.alive) return;
    
    // Obtenir la position de la grille
    const gridX = Math.floor(player.x / TILE_SIZE);
    const gridY = Math.floor(player.y / TILE_SIZE);
    
    // Vérifier si une bombe est déjà présente à cet endroit
    const bombsAtPosition = gameState.bombs.filter(bomb => 
        bomb.x === gridX && bomb.y === gridY
    );
    
    // Compte le nombre de bombes actives de ce joueur
    const activeBombs = gameState.bombs.filter(bomb => 
        bomb.playerId === gameState.playerId
    );
    
    // Placer la bombe si possible
    if (bombsAtPosition.length === 0 && activeBombs.length < player.maxBombs) {
        const newBomb = {
            id: generateId(),
            playerId: gameState.playerId,
            x: gridX,
            y: gridY,
            range: player.bombRange,
            timer: Date.now() + BOMB_TIMER // Timestamp pour l'explosion
        };
        
        // Ajouter la bombe au jeu
        database.ref(`games/${gameState.roomId}/bombs`).push(newBomb);
    }
}

// Déclencher l'explosion d'une bombe
function explodeBomb(bomb) {
    if (!gameState.map || !bomb) return;
    
    const explosionCells = [];
    const { x, y, range } = bomb;
    
    // Ajouter la cellule centrale
    explosionCells.push({ x, y });
    
    // Explorer les 4 directions (haut, droite, bas, gauche)
    const directions = [
        { dx: 0, dy: -1 }, // haut
        { dx: 1, dy: 0 },  // droite
        { dx: 0, dy: 1 },  // bas
        { dx: -1, dy: 0 }  // gauche
    ];
    
    // Pour chaque direction, étendre jusqu'à rencontrer un obstacle ou atteindre la portée
    directions.forEach(dir => {
        for (let i = 1; i <= range; i++) {
            const newX = x + dir.dx * i;
            const newY = y + dir.dy * i;
            
            // Vérifier si on est toujours dans les limites de la carte
            if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) {
                break;
            }
            
            // Si on rencontre un mur, arrêter dans cette direction
            if (gameState.map[newY][newX] === TILE_TYPES.WALL) {
                break;
            }
            
            // Ajouter cette cellule à l'explosion
            explosionCells.push({ x: newX, y: newY });
            
            // Si on rencontre une brique, la détruire et arrêter dans cette direction
            if (gameState.map[newY][newX] === TILE_TYPES.BRICK) {
                // Mettre à jour la carte dans Firebase
                database.ref(`games/${gameState.roomId}/map/${newY}/${newX}`).set(TILE_TYPES.EMPTY);
                break;
            }
        }
    });
    
    // Créer l'explosion dans Firebase
    const explosion = {
        cells: explosionCells,
        timestamp: Date.now(),
        duration: EXPLOSION_DURATION
    };
    
    // Ajouter l'explosion à Firebase
    database.ref(`games/${gameState.roomId}/explosions`).push(explosion);
    
    // Supprimer la bombe de Firebase
    database.ref(`games/${gameState.roomId}/bombs/${bomb.id}`).remove();
    
    // Vérifier si des joueurs sont touchés par l'explosion
    checkPlayersInExplosion(explosionCells);
    
    // Vérifier si d'autres bombes sont touchées par l'explosion (réaction en chaîne)
    checkBombsInExplosion(explosionCells, bomb.id);
}

// Vérifier si des joueurs sont touchés par l'explosion
function checkPlayersInExplosion(explosionCells) {
    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        if (!player || !player.alive) continue;
        
        // Obtenir la position du joueur sur la grille
        const playerGridX = Math.floor(player.x / TILE_SIZE);
        const playerGridY = Math.floor(player.y / TILE_SIZE);
        
        // Vérifier si le joueur est dans une cellule touchée par l'explosion
        const isHit = explosionCells.some(cell => cell.x === playerGridX && cell.y === playerGridY);
        
        if (isHit) {
            // Marquer le joueur comme mort
            database.ref(`games/${gameState.roomId}/players/${playerId}/alive`).set(false);
        }
    }
}

// Vérifier si d'autres bombes sont touchées par l'explosion
function checkBombsInExplosion(explosionCells, excludeBombId) {
    for (const bomb of gameState.bombs) {
        if (bomb.id === excludeBombId) continue;
        
        // Vérifier si la bombe est dans une cellule touchée par l'explosion
        const isHit = explosionCells.some(cell => cell.x === bomb.x && cell.y === bomb.y);
        
        if (isHit) {
            // Exploser cette bombe immédiatement (réaction en chaîne)
            explodeBomb(bomb);
        }
    }
}

// Mettre à jour les explosions
function updateExplosions() {
    const currentTime = Date.now();
    
    // Vérifier si des bombes doivent exploser
    for (const bomb of gameState.bombs) {
        if (bomb.timer && bomb.timer <= currentTime) {
            explodeBomb(bomb);
        }
    }
    
    // Supprimer les explosions terminées
    for (const explosion of gameState.explosions) {
        if (explosion.timestamp + explosion.duration <= currentTime) {
            database.ref(`games/${gameState.roomId}/explosions/${explosion.id}`).remove();
        }
    }
}

// Dessiner les bombes
function renderBombs() {
    if (!gameState.bombs) return;
    
    for (const bomb of gameState.bombs) {
        // Calculer l'animation de la bombe (pulsation)
        const timeLeft = bomb.timer - Date.now();
        const scale = 1 + 0.2 * Math.sin(timeLeft / 200);
        
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(
            bomb.x * TILE_SIZE + TILE_SIZE/2, 
            bomb.y * TILE_SIZE + TILE_SIZE/2, 
            TILE_SIZE/3 * scale, 
            0, 
            Math.PI * 2
        );
        ctx.fill();
        
        // Dessiner la mèche
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(
            bomb.x * TILE_SIZE + TILE_SIZE/2, 
            bomb.y * TILE_SIZE + TILE_SIZE/2 - TILE_SIZE/3
        );
        ctx.lineTo(
            bomb.x * TILE_SIZE + TILE_SIZE/2, 
            bomb.y * TILE_SIZE + TILE_SIZE/2 - TILE_SIZE/2
        );
        ctx.stroke();
    }
}

// Dessiner les explosions
function renderExplosions() {
    if (!gameState.explosions) return;
    
    const currentTime = Date.now();
    
    for (const explosion of gameState.explosions) {
        // Calculer l'opacité en fonction du temps écoulé
        const timeElapsed = currentTime - explosion.timestamp;
        const opacity = 1 - (timeElapsed / explosion.duration);
        
        if (opacity <= 0) continue;
        
        // Dessiner chaque cellule de l'explosion
        for (const cell of explosion.cells) {
            // Utiliser un dégradé pour l'effet d'explosion
            const gradient = ctx.createRadialGradient(
                cell.x * TILE_SIZE + TILE_SIZE/2,
                cell.y * TILE_SIZE + TILE_SIZE/2,
                0,
                cell.x * TILE_SIZE + TILE_SIZE/2,
                cell.y * TILE_SIZE + TILE_SIZE/2,
                TILE_SIZE/2
            );
            
            gradient.addColorStop(0, `rgba(255, 255, 0, ${opacity})`);
            gradient.addColorStop(0.7, `rgba(255, 165, 0, ${opacity})`);
            gradient.addColorStop(1, `rgba(255, 0, 0, ${opacity})`);
            
            ctx.fillStyle = gradient;
            ctx.fillRect(
                cell.x * TILE_SIZE, 
                cell.y * TILE_SIZE, 
                TILE_SIZE, 
                TILE_SIZE
            );
        }
    }
}