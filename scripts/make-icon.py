#!/usr/bin/env python3
"""Génère l'icône de l'application (build/icon.png puis build/icon.icns, macOS uniquement pour l'icns).

    python3 scripts/make-icon.py

Motif : un tissage (« trame ») de barres blanches sur un carré arrondi violet.
"""
import os
import subprocess
import tempfile

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'build')
S = 2048  # dessin en 2× puis réduit à 1024 pour l'anticrénelage


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw() -> Image.Image:
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    # Fond : carré arrondi (gabarit macOS : 824/1024 de marge incluse) en dégradé diagonal
    size = int(S * 824 / 1024)
    off = (S - size) // 2
    grad = Image.new('RGBA', (size, size))
    px = grad.load()
    c1, c2 = (150, 120, 255), (84, 52, 224)
    for y in range(size):
        for x in range(size):
            px[x, y] = (*lerp(c1, c2, (x + y) / (2 * size)), 255)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.225), fill=255)
    img.paste(grad, (off, off), mask)

    # Tissage 3×3 : chaque barre passe alternativement dessus / dessous ; là où elle passe dessous,
    # elle est interrompue (avec une marge) pour laisser voir le fond et suggérer la profondeur.
    n, bar, gap = 3, int(size * 0.17), int(size * 0.045)
    total = n * bar + (n - 1) * gap
    x0 = y0 = off + (size - total) // 2
    pos = [x0 + i * (bar + gap) for i in range(n)]
    margin = int(gap * 0.9)
    radius = int(bar * 0.3)
    d = ImageDraw.Draw(img)

    def segments(start, cuts):
        """Intervalle [start, start+total] privé des intervalles `cuts` (triés)."""
        out, cur = [], start
        for c0, c1 in cuts:
            if c0 > cur:
                out.append((cur, c0))
            cur = max(cur, c1)
        if cur < start + total:
            out.append((cur, start + total))
        return out

    for j, y in enumerate(pos):  # barres horizontales : dessous quand (i + j) est impair
        cuts = [(pos[i] - margin, pos[i] + bar + margin) for i in range(n) if (i + j) % 2 == 1]
        for a0, a1 in segments(x0, cuts):
            d.rounded_rectangle((a0, y, a1, y + bar), radius=radius, fill=(255, 255, 255, 255))
    for i, x in enumerate(pos):  # barres verticales : dessous quand (i + j) est pair
        cuts = [(pos[j] - margin, pos[j] + bar + margin) for j in range(n) if (i + j) % 2 == 0]
        for a0, a1 in segments(y0, cuts):
            d.rounded_rectangle((x, a0, x + bar, a1), radius=radius, fill=(228, 220, 255, 255))
    return img.resize((1024, 1024), Image.LANCZOS)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    icon = draw()
    icon.save(os.path.join(OUT, 'icon.png'))
    with tempfile.TemporaryDirectory() as tmp:
        iconset = os.path.join(tmp, 'icon.iconset')
        os.mkdir(iconset)
        for base in (16, 32, 128, 256, 512):
            icon.resize((base, base), Image.LANCZOS).save(os.path.join(iconset, f'icon_{base}x{base}.png'))
            icon.resize((base * 2, base * 2), Image.LANCZOS).save(os.path.join(iconset, f'icon_{base}x{base}@2x.png'))
        subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', os.path.join(OUT, 'icon.icns')], check=True)


if __name__ == '__main__':
    main()
