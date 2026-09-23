// Test multijoueur automatique : deux Chrome headless (un par joueur) jouent
// une partie réelle sur la base Firebase, dans une salle de test supprimée à la fin.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const GAME_DIR = path.join(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8765;
const ROOM = 'mptest_' + Date.now();
const TILE = 32; // TILE_SIZE du jeu

const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
    const file = path.join(GAME_DIR, decodeURIComponent(req.url.split('?')[0]) || '/');
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
    });
});

async function openPlayer(label, query = '') {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    const logs = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    page.on('console', m => {
        const t = m.text();
        if (m.type() === 'error' && !t.includes('404')) errors.push(t);
        if (t.includes('MORT') || t.includes('IA fuite')) logs.push(t);
    });
    await page.goto(`http://localhost:${PORT}/game.html${query}`, { waitUntil: 'networkidle2' });
    return { label, browser, page, errors, logs };
}

const gridOf = (page, id) => page.evaluate(id => {
    const p = gameState.players[id];
    return p ? { x: Math.floor(p.x / TILE_SIZE), y: Math.floor(p.y / TILE_SIZE), alive: p.alive } : null;
}, id);

(async () => {
    await new Promise(r => server.listen(PORT, r));
    const A = await openPlayer('A(player1)', '?manches=2&maree=600');
    const B = await openPlayer('B(player2)');

    try {
        // --- Création / connexion --------------------------------------
        await A.page.type('#roomInput', ROOM);
        await A.page.click('#createBtn');
        await A.page.waitForFunction(() => gameState.players.player1, { timeout: 10000 });

        await B.page.type('#roomInput', ROOM);
        await B.page.click('#joinBtn');
        await Promise.all([A, B].map(P => P.page.waitForFunction(
            () => gameState.gameStarted === true && gameState.players.player1 && gameState.players.player2,
            { timeout: 10000 })));
        check('Les deux onglets voient la partie démarrée avec 2 joueurs', true);
        // Décompte 3-2-1 : personne ne bouge avant la fin
        const blocked = await A.page.evaluate(() => countdownActive());
        check('Décompte actif au démarrage', blocked);
        await Promise.all([A, B].map(P => P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 })));

        const a1 = await gridOf(A.page, 'player1'), a2 = await gridOf(A.page, 'player2');
        const b1 = await gridOf(B.page, 'player1'), b2 = await gridOf(B.page, 'player2');
        check('Spawns corrects des deux côtés', a1.x === 0 && a1.y === 0 && a2.x === 14 && a2.y === 14 &&
            b1.x === 0 && b1.y === 0 && b2.x === 14 && b2.y === 14,
            `A voit p1=(${a1.x},${a1.y}) p2=(${a2.x},${a2.y}) / B voit p1=(${b1.x},${b1.y}) p2=(${b2.x},${b2.y})`);

        // Compteurs d'écritures Firebase (vus depuis A) : 1 explosion par bombe attendue
        await A.page.evaluate(room => {
            window.__expl = 0;
            database.ref(`games/${room}/explosions`).on('child_added', () => window.__expl++);
        }, ROOM);

        // --- Déplacement de player1 visible chez B ------------------------
        const dirKey = await A.page.evaluate(() =>
            isGridAccessible(1, 0) ? 'ArrowRight' : (isGridAccessible(0, 1) ? 'ArrowDown' : null));
        if (dirKey) {
            await A.page.keyboard.down(dirKey);
            await sleep(150);
            await A.page.keyboard.up(dirKey);
            await sleep(1000);
            const aLocal = await gridOf(A.page, 'player1');
            const bView = await gridOf(B.page, 'player1');
            check('Déplacement de player1 synchronisé chez B',
                (aLocal.x !== 0 || aLocal.y !== 0) && aLocal.x === bView.x && aLocal.y === bView.y,
                `A=(${aLocal.x},${aLocal.y}) B voit (${bView.x},${bView.y})`);
        } else {
            check('Déplacement de player1 synchronisé chez B', false, 'aucune case libre à côté du spawn');
        }

        // --- Affichage lissé de player2 chez A pendant que B marche ---------
        const bKey = await B.page.evaluate(() =>
            isGridAccessible(13, 14) ? 'ArrowLeft' : (isGridAccessible(14, 13) ? 'ArrowUp' : null));
        if (bKey) {
            const samplesPromise = A.page.evaluate(() => new Promise(resolve => {
                const pts = [];
                const start = performance.now();
                (function frame() {
                    const p = gameState.players.player2;
                    pts.push(getDisplayPosition('player2', p));
                    if (performance.now() - start < 1500) requestAnimationFrame(frame);
                    else resolve({ pts, final: { x: p.x, y: p.y } });
                })();
            }));
            await sleep(250); // laisser l'échantillonnage démarrer avant que B bouge
            await B.page.keyboard.down(bKey);
            await sleep(450); // ~2 cases
            await B.page.keyboard.up(bKey);
            const { pts, final } = await samplesPromise;
            let maxJump = 0;
            for (let i = 1; i < pts.length; i++) {
                maxJump = Math.max(maxJump, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
            }
            const last = pts[pts.length - 1];
            const moved = Math.hypot(last.x - pts[0].x, last.y - pts[0].y);
            // Sans lissage : sauts de ~16px (une demi-case par sync de 100ms)
            check('Adversaire affiché sans sauts chez A', moved >= 32 && maxJump <= 8,
                `déplacement affiché=${moved.toFixed(0)}px, plus grand saut=${maxJump.toFixed(1)}px sur ${pts.length} images`);
            check('Affichage lissé rejoint la vraie position',
                Math.hypot(last.x - final.x, last.y - final.y) < 1,
                `affiché=(${last.x.toFixed(0)},${last.y.toFixed(0)}) réel=(${final.x},${final.y})`);
            check('Position finale de player2 reçue au centre d’une case',
                (final.x - TILE / 2) % TILE === 0 && (final.y - TILE / 2) % TILE === 0,
                `réel=(${final.x},${final.y})`);
        } else {
            check('Adversaire affiché sans sauts chez A', false, 'aucune case libre à côté du spawn de B');
        }

        // --- Bombe de A : visible chez B, explose UNE fois, tue B dans la flamme
        const bombCell = await gridOf(A.page, 'player1');
        await A.page.keyboard.press(' ');
        await B.page.waitForFunction(() => gameState.bombs.length === 1, { timeout: 2000 })
            .then(() => check('Bombe de A visible chez B', true))
            .catch(() => check('Bombe de A visible chez B', false));

        // A s'éloigne (téléport de test) sur une case vide hors ligne/colonne de la bombe
        const safe = await A.page.evaluate(({ bx, by }) => {
            for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
                if (gameState.map[y][x] === TILE_TYPES.EMPTY && Math.abs(x - bx) > 3 && Math.abs(y - by) > 3) {
                    const p = gameState.players.player1;
                    const px = x * TILE_SIZE + TILE_SIZE / 2, py = y * TILE_SIZE + TILE_SIZE / 2;
                    Object.assign(p, { x: px, y: py, fromX: px, fromY: py, toX: px, toY: py, moving: false });
                    return { x, y };
                }
            }
            return null;
        }, { bx: bombCell.x, by: bombCell.y });

        await B.page.waitForFunction(() => gameState.explosions.length > 0, { timeout: 5000 });
        check('Explosion de A visible chez B', true);

        // B entre dans la flamme active (téléport de test sur la case de la bombe)
        await B.page.evaluate(({ bx, by }) => {
            const p = gameState.players.player2;
            const px = bx * TILE_SIZE + TILE_SIZE / 2, py = by * TILE_SIZE + TILE_SIZE / 2;
            Object.assign(p, { x: px, y: py, fromX: px, fromY: py, toX: px, toY: py, moving: false });
        }, { bx: bombCell.x, by: bombCell.y });
        await sleep(1500);

        const expl = await A.page.evaluate(() => window.__expl);
        check('Une seule explosion créée pour une bombe', expl === 1, `explosions écrites=${expl}`);

        const b2dead = await gridOf(B.page, 'player2');
        const a2dead = await gridOf(A.page, 'player2');
        check('player2 meurt dans la flamme (vu par B et par A)', b2dead.alive === false && a2dead.alive === false,
            `B voit alive=${b2dead.alive}, A voit alive=${a2dead.alive}`);
        const a1alive = await gridOf(A.page, 'player1');
        check('player1 (réfugié en ' + (safe ? `${safe.x},${safe.y}` : '?') + ') survit', a1alive.alive === true);

        // --- Manche 1 terminée (match en 2 manches gagnantes) -------------
        await A.page.waitForFunction(() => gameState.match && gameState.match.roundOver, { timeout: 5000 });
        let infoA = await A.page.$eval('#gameInfo', e => e.textContent);
        let infoB = await B.page.$eval('#gameInfo', e => e.textContent);
        check('Fin de manche affichée des deux côtés', infoA.includes('Manche gagnée') && infoB.includes('Manche perdue'),
            `A="${infoA}" / B="${infoB}"`);
        const endHidden = await A.page.$eval('#gameControls', e => e.style.display === 'none');
        check('Pas d’écran de fin de match après une seule manche', endHidden);

        // --- Manche 2 : nouvelle carte, joueurs replacés, score 1-0 ---------
        await Promise.all([A, B].map(P => P.page.waitForFunction(
            () => gameState.match && gameState.match.round === 2 && !gameState.match.roundOver, { timeout: 8000 })));
        const r2 = await Promise.all([A, B].map(P => P.page.evaluate(() => ({
            scores: gameState.match.scores,
            p1: [Math.floor(gameState.players.player1.x / TILE_SIZE), Math.floor(gameState.players.player1.y / TILE_SIZE), gameState.players.player1.alive],
            p2: [Math.floor(gameState.players.player2.x / TILE_SIZE), Math.floor(gameState.players.player2.y / TILE_SIZE), gameState.players.player2.alive],
            countdown: countdownActive()
        }))));
        check('Manche 2 : score 1-0 des deux côtés',
            r2.every(r => r.scores.player1 === 1 && r.scores.player2 === 0), JSON.stringify(r2.map(r => r.scores)));
        check('Manche 2 : joueurs revenus vivants à leur coin',
            r2.every(r => r.p1.join() === '0,0,true' && r.p2.join() === '14,14,true'),
            JSON.stringify(r2.map(r => [r.p1, r.p2])));
        check('Manche 2 : nouveau décompte', r2.every(r => r.countdown));

        // --- player2 meurt encore : fin du match ----------------------------
        await Promise.all([A, B].map(P => P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 })));
        await B.page.evaluate(() => database.ref(`games/${gameState.roomId}/players/player2/alive`).set(false));
        await A.page.waitForFunction(() => gameState.match && gameState.match.matchWinner, { timeout: 5000 });
        await sleep(300);
        infoA = await A.page.$eval('#gameInfo', e => e.textContent);
        infoB = await B.page.$eval('#gameInfo', e => e.textContent);
        check('Écran de fin de match correct des deux côtés',
            infoA.includes('Victoire') && infoA.includes('2 à 0') && infoB.includes('Défaite') && infoB.includes('0 à 2'),
            `A="${infoA}" / B="${infoB}"`);

        // --- Revanche dans la même salle ------------------------------------
        await sleep(1000); // écran de fin cliquable après l'animation de mort
        await A.page.click('#restartBtn');
        await Promise.all([A, B].map(P => P.page.waitForFunction(
            () => gameState.match && gameState.match.round === 3 && !gameState.match.matchWinner, { timeout: 8000 })));
        const rematch = await B.page.evaluate(() => gameState.match.scores);
        check('Revanche : même salle, scores remis à 0', rematch.player1 === 0 && rematch.player2 === 0, JSON.stringify(rematch));
    } catch (e) {
        check('Déroulement du test', false, e.message);
    } finally {
        for (const P of [A, B]) {
            check(`Aucune erreur JS chez ${P.label}`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
            P.logs.forEach(l => console.log(`   [${P.label}] ${l}`));
        }
        await A.page.evaluate(room => database.ref(`games/${room}`).remove(), ROOM).catch(() => {});
        await A.browser.close();
        await B.browser.close();
    }

    await scenarioDeconnexion();
    await scenarioSolo();
    await scenarioMaree();

    server.close();
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} tests OK — salles de test supprimées`);
    process.exit(failed ? 1 : 0);
})();

// Marée montante : réglée à 0,5 s après le décompte. Le joueur reste
// immobile dans son coin, qui est inondé en premier : il doit se noyer, et
// la case doit devenir infranchissable.
async function scenarioMaree() {
    const P = await openPlayer('Marée', '?manches=1&maree=0.5');
    let room = null;
    try {
        await P.page.click('#singlePlayerBtn');
        await P.page.waitForFunction(() => gameState.gameStarted && gameState.match, { timeout: 10000 });
        room = await P.page.evaluate(() => gameState.roomId);
        await P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 });
        const before = await P.page.evaluate(() => isFlooded(7, 7));
        check('Marée : le centre de l’île n’est pas inondé', !before);
        await P.page.waitForFunction(() => !gameState.players.player1.alive, { timeout: 5000 })
            .then(() => check('Marée : le joueur resté dans son coin se noie', true))
            .catch(() => check('Marée : le joueur resté dans son coin se noie', false));
        const blocked = await P.page.evaluate(() => !isGridAccessible(0, 0) && isFlooded(0, 0));
        check('Marée : case inondée infranchissable', blocked);
        check('Marée : cause de la mort journalisée', P.logs.some(l => l.includes('noyé')), P.logs.join(' | '));
    } catch (e) {
        check('Déroulement du scénario marée', false, e.message);
    } finally {
        check('Aucune erreur JS (marée)', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        if (room) await P.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        await P.browser.close();
    }
}

// Fumée du mode solo : la partie démarre, l'IA bouge et pose des bombes,
// sans erreur JS ; la salle solo est supprimée en quittant.
async function scenarioSolo() {
    const P = await openPlayer('Solo');
    let room = null;
    try {
        await P.page.click('#singlePlayerBtn');
        await P.page.waitForFunction(() => gameState.gameStarted && gameState.players[aiPlayerId], { timeout: 10000 });
        await P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 });
        room = await P.page.evaluate(() => gameState.roomId);
        const start = await gridOf(P.page, 'playerAI');
        await P.page.evaluate(() => {
            window.__aiBombs = 0;
            database.ref(`games/${gameState.roomId}/bombs`).on('child_added', s => {
                if (s.val().playerId === aiPlayerId) window.__aiBombs++;
            });
        });
        // Cases visitées (pas seulement départ/arrivée : dans son coin, l'IA
        // pose, se met à l'abri en diagonale puis revient sur sa case)
        const visited = new Set([`${start.x},${start.y}`]);
        for (let i = 0; i < 40; i++) {
            await sleep(200);
            const g = await gridOf(P.page, 'playerAI');
            if (g) visited.add(`${g.x},${g.y}`);
        }
        const bombs = await P.page.evaluate(() => window.__aiBombs);
        check('Solo : l\'IA se déplace', visited.size >= 2,
            `${visited.size} case(s) visitée(s) en 8s : ${[...visited].join(' ')}`);
        check('Solo : l\'IA pose des bombes', bombs > 0, `${bombs} bombe(s) en 8s`);
    } catch (e) {
        check('Déroulement du scénario solo', false, e.message);
    } finally {
        check('Aucune erreur JS en solo', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        P.logs.forEach(l => console.log(`   [Solo] ${l}`));
        if (room) await P.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        await P.browser.close();
    }
}

// Un joueur quitte en cours de partie : l'autre doit garder la partie et être
// prévenu ; quand le dernier part, la partie doit disparaître de Firebase.
async function scenarioDeconnexion() {
    const room = ROOM + '_deco';
    const A = await openPlayer('A2(player1)');
    const B = await openPlayer('B2(player2)');
    let observer = null;
    try {
        await A.page.type('#roomInput', room);
        await A.page.click('#createBtn');
        await A.page.waitForFunction(() => gameState.players.player1, { timeout: 10000 });
        await B.page.type('#roomInput', room);
        await B.page.click('#joinBtn');
        await A.page.waitForFunction(() => gameState.gameStarted && gameState.players.player2, { timeout: 10000 });

        await B.browser.close(); // B ferme brutalement sa page
        await A.page.waitForFunction(() => !gameState.players.player2, { timeout: 10000 })
            .then(() => check('Départ de B détecté chez A', true))
            .catch(() => check('Départ de B détecté chez A', false, 'player2 toujours présent après 10s'));

        await sleep(300);
        const infoA = await A.page.$eval('#gameInfo', e => e.textContent);
        check('A est prévenu que l\'adversaire a quitté', infoA.includes('quitté'), `A="${infoA}"`);

        const stillThere = await A.page.evaluate(r =>
            database.ref(`games/${r}/map`).once('value').then(s => s.exists()), room);
        check('La partie existe toujours après le départ de B', stillThere);

        // A part à son tour : il était le dernier, la partie doit être supprimée
        await A.browser.close();
        observer = await openPlayer('observateur');
        let gone = false;
        for (let i = 0; i < 20 && !gone; i++) {
            gone = await observer.page.evaluate(r =>
                database.ref(`games/${r}`).once('value').then(s => !s.exists()), room);
            if (!gone) await sleep(500);
        }
        check('La partie est supprimée quand le dernier joueur part', gone);
    } catch (e) {
        check('Déroulement du scénario déconnexion', false, e.message);
    } finally {
        for (const P of [A, B]) {
            check(`Aucune erreur JS chez ${P.label}`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        }
        const cleaner = observer || await openPlayer('nettoyage');
        await cleaner.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        for (const P of [A, B, cleaner]) await P.browser.close().catch(() => {});
    }
}
