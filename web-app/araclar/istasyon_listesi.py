"""Doğrulama sayfasının kullandığı METAR istasyon listesini üretir: web-app/src/hesap/istasyonlar.json

Kaynak: NOAA Aviation Weather Center istasyon bilgisi (Streamlit sürümünün de kullandığı servis). Bu servis
tarayıcıdan çağrılamadığı (CORS yok) için liste depoya yazılır; istasyonlar nadiren değiştiğinden yılda bir kez
yenilemek yeter. Ölçümlerin kendisi Iowa Environmental Mesonet'ten gelir, ama IEM'in Türkiye istasyon listesindeki
bazı koordinatlar yanlıştır (ör. Ordu-Giresun ile Hakkari yer değiştirmiş); o liste bu yüzden kullanılmaz.

Çalıştırma (depo kökünden):   .venv/bin/python web-app/araclar/istasyon_listesi.py
"""
import json
from pathlib import Path

import requests

# Türkiye ve yakın çevresi: sınıra yakın konumlar komşu ülkedeki bir meydanı kullanabilsin
KUTU = "34,24,44,46"          # güney, batı, kuzey, doğu
ADRES = f"https://aviationweather.gov/api/data/stationinfo?bbox={KUTU}&format=json"
CIKTI = Path(__file__).resolve().parents[1] / "src" / "hesap" / "istasyonlar.json"

yanit = requests.get(ADRES, timeout=60)
yanit.raise_for_status()
ham = yanit.json()

liste = sorted(
    ({"icao": s["icaoId"], "ad": s["site"].strip(), "lat": s["lat"], "lon": s["lon"], "rakim": s.get("elev")}
     for s in ham if s.get("icaoId") and "METAR" in (s.get("siteType") or [])),
    key=lambda s: s["icao"])
CIKTI.write_text("[\n" + ",\n".join(json.dumps(s, ensure_ascii=False) for s in liste) + "\n]\n", encoding="utf-8")
print(f"{CIKTI.name}: {len(liste)} istasyon ({sum(s['icao'].startswith('LT') for s in liste)} Türkiye), {CIKTI.stat().st_size // 1024} KB")
