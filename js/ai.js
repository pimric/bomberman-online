// --- IA Bomberman améliorée --- //

let aiMode = false;
let aiPlayerId = 'playerAI';
let aiMoveInterval;
let aiLastMove = { dx: 0, dy: 0 };
let aiLastTargetUpdate = 0;
const AI_MOVE_DELAY = 300;

function startAI() {
    console.log("IA activée");
    if (aiMoveInterval) clearInterval(aiMoveInterval);

    setTimeout(() => {
        aiMoveInterval = setInterval(() => {
            if (!gameState.gameStarted || !aiMode) return;

            const aiPlayer = gameState.players[aiPlayerId];
            if (!aiPlayer || !aiPlayer.alive) {
                clearInterval(aiMoveInterval);
                return;
            }

            moveAI(aiPlayer);

            if (Math.random() < 0.2) {
                tryPlaceBomb(aiPlayer);
            }

        }, AI_MOVE_DELAY);
    }, 800);
}

function moveAI(aiPlayer) {
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);

    const directions = [
        { dx: 0, dy: -1, name: 'up' },
        { dx: 0, dy: 1, name: 'down' },
        { dx: -1, dy: 0, name: 'left' },
        { dx: 1, dy: 0, name: 'right' }
    ];

    // Filtre les directions valides (pas de mur ni de bombe)
    const validMoves = directions.filter(dir => {
        const newX = gridX + dir.dx;
        const newY = gridY + dir.dy;

        return (
            newX >= 0 && newX < GRID_SIZE &&
            newY >= 0 && newY < GRID_SIZE &&
            isTileWalkable(newX, newY)
        );
    });

    // Si bloqué : ne bouge pas
    if (validMoves.length === 0) return;

    // Évite les mouvements d’aller-retour
    const nonBacktrackingMoves = validMoves.filter(dir =>
        !(dir.dx === -aiLastMove.dx && dir.dy === -aiLastMove.dy)
    );

    const chosenMove = nonBacktrackingMoves.length > 0
        ? randomElement(nonBacktrackingMoves)
        : randomElement(validMoves);

    aiLastMove = { dx: chosenMove.dx, dy: chosenMove.dy };
    movePlayer(aiPlayerId, chosenMove.name);
}

function tryPlaceBomb(aiPlayer) {
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);

    const bombsHere = gameState.bombs.some(bomb => bomb.x === gridX && bomb.y === gridY);
    if (bombsHere) return;

    const canEscape = hasEscapeRoute(gridX, gridY);
    const nearDestructible = isNearDestructible(gridX, gridY);

    if (canEscape && nearDestructible) {
        placeBomb(aiPlayerId, gridX, gridY);
    }
}

function hasEscapeRoute(x, y) {
    const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 }
    ];

    return directions.some(dir => {
        const newX = x + dir.dx;
        const newY = y + dir.dy;
        return (
            newX >= 0 && newX < GRID_SIZE &&
            newY >= 0 && newY < GRID_SIZE &&
            isTileWalkable(newX, newY)
        );
    });
}

function isNearDestructible(x, y) {
    const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 }
    ];

    return directions.some(dir => {
        const newX = x + dir.dx;
        const newY = y + dir.dy;
        return (
            newX >= 0 && newX < GRID_SIZE &&
            newY >= 0 && newY < GRID_SIZE &&
            gameState.map[newY][newX] === TILE_TYPES.BREAKABLE
        );
    });
}

function isTileWalkable(x, y) {
    const tile = gameState.map[y][x];
    const isBomb = gameState.bombs.some(b => b.x === x && b.y === y);
    return (tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.POWERUP) && !isBomb;
}

function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}
