// SYNC_MARKER: game_constants
// Configuration du jeu
console.log("Chargement de la configuration du jeu...");

// Constantes du jeu
const GRID_SIZE = 15;
const TILE_SIZE = 32;
const PLAYER_SPEED = 3;

// Définir les types de cases
const TILE_TYPES = {
    EMPTY: 0,  // Sable
    WALL: 1,   // Palmiers
    BRICK: 2   // Tonneaux
};

// Configuration des bombes
const BOMB_TIMER = 3000; // Délai avant explosion (ms)
const EXPLOSION_DURATION = 1000; // Durée d'affichage de l'explosion (ms)

// Configuration de l'IA
const AI_MOVE_DELAY = 500; // Délai entre les mouvements de l'IA (ms)
// END_SYNC_MARKER: game_constants

// SYNC_MARKER: firebase_config
// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDEDfD0gETLAra2wu9e0V8YVECdshVWAEc",
  authDomain: "bomberman-10e44.firebaseapp.com",
  projectId: "bomberman-10e44",
  storageBucket: "bomberman-10e44.firebasestorage.app",
  messagingSenderId: "734188613745",
  appId: "1:734188613745:web:96b85d282821b3613d2bd0"
};

// Initialiser Firebase avec gestion d'erreur
let database = null;
try {
    console.log("Initialisation de Firebase...");
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log("Firebase initialisé avec succès");
} catch (error) {
    console.error("Erreur lors de l'initialisation de Firebase:", error);
    alert("Erreur de connexion à la base de données. Le jeu pourrait ne pas fonctionner correctement.");
}
// END_SYNC_MARKER: firebase_config

// SYNC_MARKER: game_state
// État du jeu global
console.log("Initialisation de l'état du jeu");
const gameState = {
    roomId: null,
    playerId: null,
    map: [],
    players: {},
    bombs: [],
    explosions: [],
    gameStarted: false,
    keys: {}
};
// END_SYNC_MARKER: game_state

// SYNC_MARKER: dom_refs
// Obtenir les références DOM quand le DOM est chargé
let canvas = null;
let ctx = null;
let gameInfo = null;
let roomInput = null;

// Fonction pour initialiser les références DOM
function initDOMReferences() {
    console.log("Initialisation des références DOM");
    
    canvas = document.getElementById('gameCanvas');
    ctx = canvas && canvas.getContext('2d');
    gameInfo = document.getElementById('gameInfo');
    roomInput = document.getElementById('roomInput');
    
    if (!canvas) console.error("Canvas non trouvé");
    if (!ctx) console.error("Contexte de dessin non disponible");
    if (!gameInfo) console.error("gameInfo non trouvé");
    if (!roomInput) console.error("roomInput non trouvé");
}

// Attendre que le DOM soit chargé pour initialiser les références
document.addEventListener('DOMContentLoaded', initDOMReferences);
// END_SYNC_MARKER: dom_refs

// Signaler que le script a été chargé avec succès
console.log("Configuration du jeu chargée avec succès");
if (typeof logScriptLoaded === 'function') {
    logScriptLoaded('config.js');
}