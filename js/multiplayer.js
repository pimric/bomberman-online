// Gestion du multijoueur et des parties

// Écouteurs pour les boutons de création/connexion
document.getElementById('createBtn').addEventListener('click', createGame);
document.getElementById('joinBtn').addEventListener('click', joinExistingGame);
document.getElementById('singlePlayerBtn').addEventListener('click', createSinglePlayerGame);

// Créer une nouvelle partie multijoueur
function createGame() {
    // Générer un code de salle si non spécifié
    const roomId = roomInput.value || generateId();
    roomInput.value = roomId;
    gameState.roomId = roomId;
    gameState.playerId = 'player1';
    aiMode = false;
    
    // Créer la partie dans Firebase
    const gameRef = database.ref(`games/${roomId}`);
    gameRef.set({
        map: generateMap(),
        players: {
            player1: createPlayer(0, 0, '#ff6b6b')
        },
        bombs: {},
        explosions: {},
        gameStarted: false
    });
    
    // Rejoindre la partie
    joinGame(roomId, 'player1');
    gameInfo.textContent = `Partie créée ! Code: ${roomId} - En attente d'un autre joueur...`;
}

// Rejoindre une partie existante
function joinExistingGame() {
    const roomId = roomInput.value;
    if (!roomId) {
        alert('Veuillez entrer un code de partie');
        return;
    }
    
    // Vérifier si la partie existe
    const gameRef = database.ref(`games/${roomId}`);
    gameRef.once('value', (snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) {
            alert('Partie non trouvée');
            return;
        }
        
        // Vérifier si la partie est complète
        if (gameData.players && gameData.players.player2) {
            alert('Partie déjà complète');
            return;
        }
        
        // Rejoindre en tant que joueur 2
        gameState.roomId = roomId;
        gameState.playerId = 'player2';
        aiMode = false;
        
        // Ajouter le joueur 2 à la partie
        gameRef.child('players/player2').set(createPlayer(GRID_SIZE - 1, GRID_SIZE - 1, '#4ecdc4'));
        gameRef.child('gameStarted').set(true);
        
        // Rejoindre la partie
        joinGame(roomId, 'player2');
    });
}

// Créer une partie solo contre l'IA
function createSinglePlayerGame() {
    // Générer un code de salle pour le mode solo
    const roomId = 'solo_' + generateId();
    roomInput.value = roomId;
    gameState.roomId = roomId;
    gameState.playerId = 'player1';
    aiMode = true;
    
    // Créer la partie dans Firebase avec le joueur humain et l'IA
    const gameRef = database.ref(`games/${roomId}`);
    gameRef.set({
        map: generateMap(),
        players: {
            player1: createPlayer(0, 0, '#ff6b6b'),
            [aiPlayerId]: createPlayer(GRID_SIZE - 1, GRID_SIZE - 1, '#4ecdc4')
        },
        bombs: {},
        explosions: {},
        gameStarted: true
    });
    
    // Rejoindre la partie
    joinGame(roomId, 'player1');
    gameInfo.textContent = `Mode solo contre l'IA - Vous êtes le joueur 1 (rouge)`;
    
    // Démarrer l'IA
    startAI();
}

// Rejoindre une partie et configurer les écouteurs
function joinGame(roomId, playerId) {
    const gameRef = database.ref(`games/${roomId}`);
    
    // Écouter les changements d'état du jeu
    gameRef.on('value', (snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) return;
        
        // Mettre à jour l'état du jeu local
        gameState.map = gameData.map;
        gameState.players = gameData.players || {};
        
        // Convertir les objets bombs et explosions en tableaux
        gameState.bombs = gameData.bombs ? Object.values(gameData.bombs) : [];
        gameState.explosions = gameData.explosions ? Object.values(gameData.explosions) : [];
        
        gameState.gameStarted = gameData.gameStarted;
        
        // Afficher un message quand le jeu commence
        if (gameState.gameStarted) {
            if (aiMode) {
                gameInfo.textContent = `Mode solo contre l'IA - Vous êtes le joueur 1 (rouge)`;
            } else if (gameData.players.player1 && gameData.players.player2) {
                gameInfo.textContent = `Partie en cours - Vous êtes le joueur ${playerId === 'player1' ? '1 (rouge)' : '2 (bleu)'}`;
            }
        }
    });
    
    // Configurer les déconnexions
    gameRef.child(`players/${playerId}`).onDisconnect().remove();
    database.ref(`.info/connected`).on('value', (snapshot) => {
        if (snapshot.val() === false) return;
        
        // Nettoyer la partie si tous les joueurs sont déconnectés
        gameRef.onDisconnect().remove();
    });
    
    // Cacher les contrôles de salle
    document.getElementById('roomControls').style.display = 'none';

       // Cacher les contrôles de salle et afficher les contrôles de jeu
    document.getElementById('roomControls').style.display = 'none';
    document.getElementById('gameControls').style.display = 'block';
    
}

// Fonction pour redémarrer la partie
function restartGame() {
    // Si on est en mode solo avec IA
    if (aiMode) {
        // Nettoyer l'intervalle de l'IA pour éviter les doublons
        if (aiMoveInterval) {
            clearInterval(aiMoveInterval);
        }
        
        // Régénérer une carte et réinitialiser les joueurs
        const roomId = 'solo_' + generateId();
        gameState.roomId = roomId;
        
        // Créer une nouvelle partie
        const gameRef = database.ref(`games/${roomId}`);
        gameRef.set({
            map: generateMap(),
            players: {
                player1: createPlayer(0, 0, '#ff6b6b'),
                [aiPlayerId]: createPlayer(GRID_SIZE - 1, GRID_SIZE - 1, '#4ecdc4')
            },
            bombs: {},
            explosions: {},
            gameStarted: true
        });
        
        // Rejoindre la partie
        joinGame(roomId, 'player1');
        gameInfo.textContent = `Mode solo contre l'IA - Vous êtes le joueur 1 (rouge)`;
        
        // Démarrer l'IA
        startAI();
    } else {
        // Pour les parties multijoueur, revenir à l'écran de création de partie
        document.getElementById('roomControls').style.display = 'block';
        document.getElementById('gameControls').style.display = 'none';
        
        // Déconnecter la partie actuelle
        if (gameState.roomId) {
            database.ref(`games/${gameState.roomId}`).off();
        }
        
        // Réinitialiser l'état
        gameState.roomId = null;
        gameState.playerId = null;
        gameState.map = [];
        gameState.players = {};
        gameState.bombs = [];
        gameState.explosions = [];
        gameState.gameStarted = false;
    }
}

// Fonction pour revenir au menu principal
function returnToHome() {
    // Rediriger vers la page d'accueil
    window.location.href = 'index.html';
}

// Ajout des écouteurs d'événements pour les nouveaux boutons
document.getElementById('restartBtn').addEventListener('click', restartGame);
document.getElementById('homeBtn').addEventListener('click', returnToHome);