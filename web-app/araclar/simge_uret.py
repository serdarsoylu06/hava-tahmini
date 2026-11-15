"""Ana ekran simgelerini üretir: web-app/public/simge-{180,192,512}.png

Simge, uygulamanın logosudur (public/simge.svg ile aynı çizim): açık yeşil zemin üstünde koyu bulut çizgisi.
PNG'ler tam kare ve saydamsızdır; köşeleri iPhone ve Android kendisi yuvarlar. Bulut, simgenin ortadaki %80'lik
güvenli alanında kalır (Android'in "maskable" simge kuralı).

Çalıştırma (depo kökünden):   .venv/bin/python web-app/araclar/simge_uret.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ZEMIN, CIZGI = "#C6E066", "#1C2829"
KALINLIK = 2.2                 # 24 birimlik logo ızgarasında çizgi kalınlığı
OLCEK, KAYMA = 15, (55, 53)    # simge.svg'deki translate(55 53) scale(15): bulut ortada, simgenin yarısı kadar
BUYUTME = 4                    # kenar yumuşatma için 4 kat büyük çizilip küçültülür


def yay(cx, cy, r, a0, a1, adim=120):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / adim)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / adim)))
            for i in range(adim + 1)]


# SVG yolu: M17.5 19 a4.5 4.5 0 1 0 -1.4 -8.8 A6 6 0 1 0 6.5 19 z
# 1. yay: merkez (17.5, 14.5), r 4.5, alttan başlayıp saat yönünün tersine (16.1, 10.2)'ye
# 2. yay: uçlar arası 13,02 birim olduğundan yarıçap 6'dan 6,511'e büyür (SVG kuralı): merkez orta nokta, yarım çember
yol = yay(17.5, 14.5, 4.5, 90, -108) + yay(11.3, 14.6, math.hypot(4.8, 4.4), -42.51, -222.51) + [(17.5, 19)]


def ciz(boy):
    n = boy * BUYUTME
    k = n / 512
    resim = Image.new("RGB", (n, n), ZEMIN)
    cizim = ImageDraw.Draw(resim)
    nokta = [((KAYMA[0] + x * OLCEK) * k, (KAYMA[1] + y * OLCEK) * k) for x, y in yol]
    kalin = KALINLIK * OLCEK * k
    cizim.line(nokta, fill=CIZGI, width=round(kalin), joint="curve")
    for x, y in nokta:                                    # yuvarlak birleşim ve uçlar
        cizim.ellipse((x - kalin / 2, y - kalin / 2, x + kalin / 2, y + kalin / 2), fill=CIZGI)
    return resim.resize((boy, boy), Image.LANCZOS)


cikti = Path(__file__).resolve().parents[1] / "public"
for boy in (180, 192, 512):
    ciz(boy).save(cikti / f"simge-{boy}.png", optimize=True)
    print(f"simge-{boy}.png: {(cikti / f'simge-{boy}.png').stat().st_size // 1024 or 1} KB")
