"""Construit assets/sprites.png + assets/sprites.js à partir des planches
générées (assets/src/*.png, fond magenta). Relancer après tout changement de
planche :  python tools/build_sprites.py

Chaque sprite est stocké en SPRITE px (2x la case du jeu) pour rester net
quand le canvas le réduit à TILE_SIZE.
"""
import colorsys
import json
import os
import re
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'src')
OUT_PNG = os.path.join(ROOT, 'assets', 'sprites.png')
OUT_JS = os.path.join(ROOT, 'assets', 'sprites.js')
SPRITE = 64


# ---------------------------------------------------------------- découpe
def is_bg(p, strict=False):
    """Fond magenta. strict : seulement le magenta vif (#FF00FF ± bruit
    JPEG), pour les planches contenant du violet (badge coup de pied)."""
    r, g, b = p[:3]
    if strict:
        return r > 215 and b > 215 and g < 110
    return r > 120 and b > 120 and g < 110 and abs(r - b) < 70


def components(im, min_px=1500, gap=6, strict=False):
    """Boîtes englobantes des éléments posés sur le fond magenta."""
    w, h = im.size
    px = im.load()
    mask = [[not is_bg(px[x, y], strict) for x in range(w)] for y in range(h)]
    seen = [[False] * w for _ in range(h)]
    boxes = []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if mask[y][x] and not seen[y][x]:
                st = [(x, y)]
                seen[y][x] = True
                x0 = x1 = x
                y0 = y1 = y
                n = 0
                while st:
                    cx, cy = st.pop()
                    n += 1
                    x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            st.append((nx, ny))
                if n > min_px:
                    boxes.append((x0, y0, x1 + 1, y1 + 1))
    merged = True
    while merged:  # regrouper les morceaux proches (étincelles, gouttes…)
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                if a[0] - gap < b[2] and b[0] - gap < a[2] and a[1] - gap < b[3] and b[1] - gap < a[3]:
                    boxes[i] = (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))
                    boxes.pop(j)
                    merged = True
                    break
            if merged:
                break
    return sorted(boxes, key=lambda b: (b[1] // 150, b[0]))


def cutout(im, box, strict=False):
    """Recadre et rend le fond magenta transparent (halo rose atténué)."""
    c = im.crop(box).convert('RGBA')
    px = c.load()
    for y in range(c.size[1]):
        for x in range(c.size[0]):
            r, g, b, a = px[x, y]
            if is_bg((r, g, b), strict):
                px[x, y] = (0, 0, 0, 0)
            elif strict:
                # halo : pixel de bord mélangé au magenta vif
                if r > 225 and b > 225 and g < 150:
                    px[x, y] = (r // 2, g, b // 2, 110)
            elif r > g + 60 and b > g + 60:
                px[x, y] = (r // 2, g, b // 2, 90)
    return c


def fit(c, size=SPRITE, anchor='center'):
    """Réduit dans un carré size x size en gardant les proportions.
    anchor='bottom' : pieds posés en bas (personnages)."""
    w, h = c.size
    s = size / max(w, h)
    r = c.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    out = Image.new('RGBA', (size, size))
    y = size - r.size[1] if anchor == 'bottom' else (size - r.size[1]) // 2
    out.paste(r, ((size - r.size[0]) // 2, y))
    return out


def fit_character(c, size=SPRITE, scale=None):
    """Personnage : pieds posés en bas et TÊTE centrée horizontalement.
    Centrer la boîte faisait bouger la tête d'une image à l'autre (la boîte
    s'élargit quand les jambes s'écartent). scale : même échelle pour
    toutes les images d'une planche."""
    w, h = c.size
    s = scale or size / max(w, h)
    r = c.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    px = r.load()
    rw, rh = r.size
    head_rows = range(0, int(rh * 0.35))
    xs = [x for y in head_rows for x in range(rw) if px[x, y][3] > 128]
    head_x = sum(xs) / len(xs) if xs else rw / 2
    out = Image.new('RGBA', (size, size))
    out.paste(r, (round(size / 2 - head_x), size - rh), r)
    return out


# --------------------------------------------------------- recolorations
def recolor(img, rule):
    out = img.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            res = rule(hh, s, v, y / h)
            if res:
                nr, ng, nb = colorsys.hsv_to_rgb(*res)
                px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return out


def is_swimsuit(h, s, v):
    return (h < 0.03 or h > 0.96) and s > 0.45 and v > 0.35


# Teinte (HSV) du maillot de chaque joueur : bleu, vert, jaune. Le rouge
# est la couleur d'origine de la planche.
SUIT_HUES = {'blue': 0.58, 'green': 0.33, 'yellow': 0.14}


def swimsuit_to(hue):
    def rule(h, s, v, fy):
        if is_swimsuit(h, s, v):
            # le jaune foncé tire sur le kaki : on l'éclaircit
            return (hue, s, min(1, v * 1.25)) if hue == SUIT_HUES['yellow'] else (hue, s, v)
    return rule


# ------------------------------------------------------------ objets
def fix_badge(c, r=None):
    """Efface le texte (+BOMB…) qui chevauche le bas du badge : on
    reconstruit le bas du cercle par symétrie du haut. Renvoie (image, r).
    r peut être imposé : les ailes du badge vitesse faussent la mesure."""
    w, h = c.size
    px = c.load()
    top = next(y for y in range(h) if any(px[x, y][3] for x in range(w)))
    if r is None:
        # badge sans ailes : largeur du cercle = diamètre
        r = w // 2
    cy = top + r
    out = c.copy()
    opx = out.load()
    cut = cy + int(r * 0.55)
    for y in range(cut, h):
        my = 2 * cy - y
        for x in range(w):
            opx[x, y] = px[x, my] if 0 <= my < h and y <= cy + r + 2 else (0, 0, 0, 0)
    return out.crop((0, 0, w, min(h, cy + r + 3))), r


def flame_square(c, where):
    """Carré découpé dans une flamme horizontale : 'middle' (segment
    raccordable) ou 'end' (bout arrondi, pointe vers la droite)."""
    w, h = c.size
    side = h
    x0 = (w - side) // 2 if where == 'middle' else w - side
    return c.crop((x0, 0, x0 + side, h))


# ------------------------------------------------------------ personnages
ANIMALS = ['goeland', 'poisson', 'tortue', 'crabe', 'flamant', 'dauphin']


def walk_cycle(path):
    """Découpe une planche personnage (3 lignes de 7 : face, dos, profil
    vers la droite, mise en page de personnage.png) en cycles de marche."""
    perso = Image.open(path).convert('RGB')
    boxes = components(perso)
    assert len(boxes) == 21, f'{path} : {len(boxes)} images au lieu de 21'
    # même échelle pour toutes les images (la plus haute tient dans la case)
    char_scale = SPRITE / max(max(b[2] - b[0], b[3] - b[1]) for b in boxes)
    frames = [fit_character(cutout(perso, b), scale=char_scale) for b in boxes]
    rows = [frames[0:7], frames[7:14], frames[14:21]]
    # Choix des images de marche (voir planche) : la ligne 1 mélange des
    # vues, seules les 4 premières sont de face. Cycle : debout, pas, debout, pas.
    walk = {
        'down': [rows[0][3], rows[0][0], rows[0][3], rows[0][1]],
        'up': [rows[1][3], rows[1][0], rows[1][3], rows[1][1]],
        'right': [rows[2][3], rows[2][0], rows[2][1], rows[2][2], rows[2][3], rows[2][4], rows[2][5], rows[2][6]],
    }
    walk['left'] = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in walk['right']]
    return walk


# ------------------------------------------------------------ cartes
# Planches carte_<thème>.jpg (prompts : assets/src/PROMPTS_CARTES.md) :
# 2 lignes de 4. Ligne 1 : sol, sol2, mur (fixe), casse (cassable).
# Ligne 2 : bord (liseré à droite), m1, m2, m3 (éléments de la mécanique).
# 'T' = tuile pleine (rognée puis étirée au carré), 'O' = objet (proportions
# gardées).
MAP_SLOTS = ['sol', 'sol2', 'mur', 'casse', 'bord', 'm1', 'm2', 'm3']
MAP_KINDS = {
    'lagon':   'TTTTTTTT',
    'ponton':  'TTOOTTTT',
    'tempete': 'TTTOTOTO',
    'grotte':  'TTTOTTTT',
    'jungle':  'TTOOTTOT',
    'volcan':  'TTOOTTTT',
}


def tile(img):
    """Tuile de sol : rogner le liseré clair des bords puis étirer pile au
    carré (sinon le plateau montre un quadrillage)."""
    w, h = img.size
    m = round(min(w, h) * 0.05)
    return img.crop((m, m, w - m, h - m)).resize((SPRITE, SPRITE), Image.LANCZOS)


def map_sheet(theme):
    im = Image.open(os.path.join(SRC, f'carte_{theme}.jpg')).convert('RGB')
    boxes = components(im)
    assert len(boxes) == 8, f'carte_{theme} : {len(boxes)} éléments au lieu de 8'
    # ligne = moitié de l'image où tombe le centre (un objet plus petit
    # qu'une tuile commence plus bas mais reste dans sa ligne)
    half = im.size[1] / 2
    boxes.sort(key=lambda b: ((b[1] + b[3]) / 2 > half, b[0]))
    out = {}
    for name, kind, box in zip(MAP_SLOTS, MAP_KINDS[theme], boxes):
        img = cutout(im, box)
        out[f'{theme}_{name}'] = tile(img) if kind == 'T' else fit(img)
    return out


# ------------------------------------------------------------ assemblage
def main():
    sprites = {}

    decor = Image.open(os.path.join(SRC, 'decor.png')).convert('RGB')
    d = [cutout(decor, b) for b in components(decor)]
    # ordre détecté : sable, sable foncé, palmier, tonneau, eau
    for name, img in zip(['sand', 'sand2', 'palm', 'barrel', 'water'], d):
        if name in ('sand', 'sand2', 'water'):
            # Tuiles de sol : rogner le liseré clair des bords, sinon le
            # plateau montre un quadrillage
            w, h = img.size
            m = round(min(w, h) * 0.05)
            img = img.crop((m, m, w - m, h - m))
            # Étirée pile au carré : fit() gardait les proportions (tuile
            # source 289x297) et laissait une bande transparente = grille
            sprites[name] = img.resize((SPRITE, SPRITE), Image.LANCZOS)
            continue
        sprites[name] = fit(img)

    obj = Image.open(os.path.join(SRC, 'objets.png')).convert('RGB')
    o = [cutout(obj, b) for b in components(obj)]
    # bombe, explosion, flamme longue, flamme courte, 4 badges
    sprites['bomb'] = fit(o[0])
    sprites['flame_center'] = fit(o[1])
    sprites['flame_mid'] = fit(flame_square(o[2], 'middle'))
    sprites['flame_end'] = fit(flame_square(o[3], 'end'))
    badge_bomb, r = fix_badge(o[4])
    sprites['bonus_bomb'] = fit(badge_bomb)
    sprites['bonus_power'] = fit(fix_badge(o[5])[0])
    sprites['bonus_speed'] = fit(fix_badge(o[6], r)[0])

    # Bonus du lot 2 (planche bonus2.png, 2 lignes de 4). Ligne 1 : coup de
    # pied (violet), détonateur (orange), flamme perçante (turquoise), bombe
    # télécommandée. Ligne 2 : variantes, dont la noix de coco pourrie.
    b2 = Image.open(os.path.join(SRC, 'bonus2.png')).convert('RGB')
    o2 = [cutout(b2, b, strict=True) for b in components(b2, strict=True)]
    sprites['bonus_kick'] = fit(o2[0])
    sprites['bonus_detonator'] = fit(o2[1])
    sprites['bonus_pierce'] = fit(o2[2])
    sprites['bomb_remote'] = fit(o2[3])
    sprites['bonus_malus'] = fit(o2[6])

    for theme in MAP_KINDS:
        sprites.update(map_sheet(theme))

    # Baigneuse (planche d'origine) : maillot ROUGE seulement, le jeu le
    # recolore à la volée comme pour les animaux
    walk = walk_cycle(os.path.join(SRC, 'personnage.png'))
    for direction, seq in walk.items():
        for i, f in enumerate(seq):
            sprites[f'red_{direction}_{i}'] = f

    # Animaux (planches perso_<animal>.jpg, maillot BLEU) : une seule
    # version dans l'atlas ; le jeu recolore le maillot à la volée pour
    # les autres couleurs (tintedFrame dans game.html), sinon l'atlas
    # pèserait 4 fois plus lourd.
    for animal in ANIMALS:
        for direction, seq in walk_cycle(os.path.join(SRC, f'perso_{animal}.jpg')).items():
            for i, f in enumerate(seq):
                sprites[f'{animal}_{direction}_{i}'] = f

    # Atlas en grille
    names = list(sprites)
    cols = 16
    rows_n = (len(names) + cols - 1) // cols
    atlas = Image.new('RGBA', (cols * SPRITE, rows_n * SPRITE))
    meta = {'size': SPRITE, 'width': cols * SPRITE, 'height': rows_n * SPRITE, 'frames': {}}
    for i, n in enumerate(names):
        x, y = (i % cols) * SPRITE, (i // cols) * SPRITE
        atlas.paste(sprites[n], (x, y))
        meta['frames'][n] = [x, y]
    meta['walk'] = {d: len(s) for d, s in walk.items()}
    meta['animals'] = ANIMALS
    atlas.save(OUT_PNG, optimize=True)
    # Version = empreinte de l'image : ajoutée aux URL (sprites.png?v=…,
    # sprites.js?v=…) pour qu'un navigateur ne garde jamais un ancien atlas
    # avec le nouveau jeu (sinon mauvais découpage, maillots qui ne
    # changent pas de couleur…)
    import hashlib
    with open(OUT_PNG, 'rb') as f:
        meta['version'] = hashlib.sha1(f.read()).hexdigest()[:10]
    for page in ('game.html', 'index.html'):
        path = os.path.join(ROOT, page)
        with open(path, encoding='utf-8') as f:
            html = f.read()
        html = re.sub(r'assets/sprites\.js(\?v=\w+)?"', f'assets/sprites.js?v={meta["version"]}"', html)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html)
    # .js plutôt que .json : chargé par une balise <script>, il marche aussi
    # quand le jeu est ouvert en file:// (fetch y est bloqué)
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write('// Généré par tools/build_sprites.py — ne pas modifier à la main\n')
        f.write('window.SPRITE_ATLAS = ' + json.dumps(meta) + ';\n')
    print(f'{len(names)} sprites -> {OUT_PNG} ({atlas.size[0]}x{atlas.size[1]})')


if __name__ == '__main__':
    main()
