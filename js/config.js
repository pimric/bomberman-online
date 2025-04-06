// Configuration du jeu
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

// Configuration Firebase (à remplacer par vos propres identifiants)
const firebaseConfig = {
  apiKey: "AIzaSyDEDfD0gETLAra2wu9e0V8YVECdshVWAEc",
  authDomain: "bomberman-10e44.firebaseapp.com",
  projectId: "bomberman-10e44",
  storageBucket: "bomberman-10e44.firebasestorage.app",
  messagingSenderId: "734188613745",
  appId: "1:734188613745:web:96b85d282821b3613d2bd0"
};

// Initialiser Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// État du jeu global
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

// Obtenir les références DOM
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameInfo = document.getElementById('gameInfo');
const roomInput = document.getElementById('roomInput');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const singlePlayerBtn = document.getElementById('singlePlayerBtn');