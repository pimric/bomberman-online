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
        res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
        res.end(data);
    });
});

async function openPlayer(label) {
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
    await page.goto(`http://localhost:${PORT}/game.html`, { waitUntil: 'networkidle2' });
    return { label, browser, page, errors, logs };
}

const gridOf = (page, id) => page.evaluate(id => {
    const p = gameState.players[id];
    return p ? { x: Math.floor(p.x / TILE_SIZE), y: Math.floor(p.y / TILE_SIZE), alive: p.alive } : null;
}, id);

(async () => {
    await new Promise(r => server.listen(PORT, r));
    const A = await openPlayer('A(player1)');
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

        const infoA = await A.page.$eval('#gameInfo', e => e.textContent);
        const infoB = await B.page.$eval('#gameInfo', e => e.textContent);
        check('Écran de fin correct des deux côtés', infoA.includes('Victoire') && infoB.includes('Game Over'),
            `A="${infoA}" / B="${infoB}"`);
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
        server.close();
        const failed = results.filter(r => !r.ok).length;
        console.log(`\n${results.length - failed}/${results.length} tests OK — salle ${ROOM} supprimée`);
        process.exit(failed ? 1 : 0);
    }
})();
