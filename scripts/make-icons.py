#!/usr/bin/env python3
"""
Gera todos os ícones da PWA a partir de assets/logo-dosim.png.

Uso:   pip install pillow
       python scripts/make-icons.py

Saída em pwa/icons/:
  icon-192.png / icon-512.png                 -> purpose "any" (círculo da marca, cantos transparentes)
  icon-maskable-192.png / icon-maskable-512.png -> purpose "maskable" (cor da marca em tela cheia; logo na zona segura de 80%)
  apple-touch-icon.png (180x180)              -> iOS (sem transparência; o iOS arredonda os cantos)
  favicon-32.png, favicon-16.png, favicon.ico -> aba do navegador
A cor da marca é lida do próprio círculo da logo (nada de cor "chutada").
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "logo-dosim.png"
OUT = ROOT / "pwa" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

logo = Image.open(SRC).convert("RGBA")
bbox = logo.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()   # recorta o círculo
logo = logo.crop(bbox)
side = max(logo.size)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2))
logo = sq
brand = logo.getpixel((int(side * 0.12), side // 2))[:3]                          # cor do círculo
print("cor da marca: #%02X%02X%02X" % brand)

# Evita o "anel escuro" na borda ao redimensionar: pixels transparentes passam a ter a cor da marca
_r, _g, _b, _a = logo.split()
_rgb = Image.new("RGB", logo.size, brand)
_rgb.paste(logo.convert("RGB"), mask=_a)
logo = Image.merge("RGBA", (*_rgb.split(), _a))


def scaled(size, fraction):
    d = round(size * fraction)
    return logo.resize((d, d), Image.LANCZOS)


def transparent_icon(size, fraction):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    c = scaled(size, fraction)
    img.alpha_composite(c, ((size - c.width) // 2, (size - c.height) // 2))
    return img


def full_bleed_icon(size, fraction):
    img = Image.new("RGBA", (size, size), brand + (255,))
    c = scaled(size, fraction)
    img.alpha_composite(c, ((size - c.width) // 2, (size - c.height) // 2))
    return img


for s in (192, 512):
    transparent_icon(s, 0.92).save(OUT / f"icon-{s}.png", optimize=True)
    full_bleed_icon(s, 0.80).save(OUT / f"icon-maskable-{s}.png", optimize=True)    # zona segura = 80%
full_bleed_icon(180, 0.90).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
for s in (32, 16):
    transparent_icon(s, 1.0).save(OUT / f"favicon-{s}.png", optimize=True)
transparent_icon(64, 1.0).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("ok:", ", ".join(sorted(p.name for p in OUT.iterdir())))
