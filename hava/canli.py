"""Canlı harita: RainViewer radarı, EUMETSAT Meteosat uydu görüntüsü ve rüzgâr parçacıkları (MapLibre bileşeni).
Kare listeleri kısa süreli önbelleğe alınır; animasyon tarayıcıda döner, oynatırken sunucuya istek gitmez."""
import re
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import streamlit as st

from hava.veri import FC, getir

RAINVIEWER = "https://api.rainviewer.com/public/weather-maps.json"
EUMETSAT = "https://view.eumetsat.int/geoserver/ows"
UYDU_KATMAN = {"Doğal renk (gündüz) / kızılötesi (gece)": "mtg_fd:rgb_geocolour",
               "Kızılötesi (bulut tepesi sıcaklığı)": "mtg_fd:ir105_hrfi"}
STILLER = {False: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
           True: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"}

_HTML = """
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
<div class="kap">
  <div class="harita"></div>
  <canvas class="parcacik"></canvas>
  <div class="cubuk">
    <button class="oynat" type="button" title="Oynat / duraklat">❚❚</button>
    <input class="kaydir" type="range" min="0" max="0" value="0" aria-label="Zaman" />
    <span class="zaman"></span>
  </div>
  <div class="lejant"><span>Hafif</span><i></i><span>Şiddetli yağış</span></div>
  <div class="durum"></div>
</div>
"""

_CSS = """
.kap { position: relative; width: 100%; height: 640px; border-radius: var(--st-base-radius, 10px);
       overflow: hidden; border: 1px solid var(--st-border-color, #ddd); font-family: var(--st-font, sans-serif); }
.harita { position: absolute; inset: 0; }
.parcacik { position: absolute; inset: 0; pointer-events: none; }
.cubuk { position: absolute; left: 12px; right: 12px; bottom: 34px; display: flex; gap: 10px; align-items: center;
         padding: 8px 12px; border-radius: 10px; background: var(--st-background-color, #fff);
         color: var(--st-text-color, #111); box-shadow: 0 2px 10px rgba(0,0,0,.18); font-size: 13px; }
.oynat { border: none; border-radius: 50%; width: 32px; height: 32px; flex: none; cursor: pointer;
         background: var(--st-primary-color, #0b6bcb); color: #fff; font-size: 13px; }
.kaydir { flex: 1; accent-color: var(--st-primary-color, #0b6bcb); }
.zaman { min-width: 150px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.lejant { position: absolute; left: 12px; top: 12px; display: none; align-items: center; gap: 6px;
          padding: 5px 9px; border-radius: 8px; font-size: 11px; background: var(--st-background-color, #fff);
          color: var(--st-text-color, #111); box-shadow: 0 1px 6px rgba(0,0,0,.15); }
.lejant i { width: 110px; height: 8px; border-radius: 4px;
            background: linear-gradient(90deg, #88ddee, #0099cc, #0077aa, #ffee00, #ffaa00, #ff4400, #c10000, #ff00ff); }
.durum { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); font-size: 12px;
         color: var(--st-text-color, #111); }
.durum:empty { display: none; }
.durum:not(:empty) { padding: 5px 9px; border-radius: 8px; background: var(--st-background-color, #fff); }
"""

_BILESEN = st.components.v2.component(
    "canli_harita", html=_HTML, css=_CSS,
    js=Path(__file__).with_name("canli_harita.js").read_text(encoding="utf-8"),
)


@st.cache_data(ttl=300, show_spinner=False)
def radar_kareleri():
    """Son ~2 saatin radar kareleri (RainViewer, 10 dakikada bir)."""
    try:
        js = requests.get(RAINVIEWER, timeout=20).json()
    except (requests.RequestException, ValueError):
        return [], None
    host = js["host"]
    kareler = [{"zaman": k["time"], "karo": f"{host}{k['path']}/256/{{z}}/{{x}}/{{y}}/2/1_1.png"}
               for k in js["radar"]["past"]]
    return kareler, f"{host}/v2/coverage/0/256/{{z}}/{{x}}/{{y}}/0/0_0.png"


@st.cache_data(ttl=600, show_spinner=False)
def _son_uydu_zamani(katman):
    """EUMETView'un bu katman için yayımladığı son görüntü zamanı (WMS yetenek belgesinden)."""
    try:
        xml = requests.get(EUMETSAT, params={"service": "WMS", "request": "GetCapabilities", "version": "1.3.0"},
                           timeout=30).text
    except requests.RequestException:
        return None
    i = xml.find(f"<Name>{katman}</Name>")
    m = re.search(r'name="time" default="([^"]+)"', xml[i:]) if i >= 0 else None
    return pd.Timestamp(m.group(1)) if m else None


def uydu_kareleri(katman, adet=8):
    """Son ~2 saatin uydu kareleri (Meteosat, 15 dakikada bir)."""
    son = _son_uydu_zamani(katman)
    if son is None:
        return []
    temel = (f"{EUMETSAT}?service=WMS&request=GetMap&version=1.3.0&layers={katman}&styles=&format=image/png"
             "&transparent=true&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512")
    zamanlar = [son - pd.Timedelta(minutes=15 * i) for i in range(adet)][::-1]
    return [{"zaman": int(t.timestamp()), "karo": f"{temel}&time={t:%Y-%m-%dT%H:%M:%SZ}"} for t in zamanlar]


def ruzgar_izgarasi(lat, lon):
    """Parçacıklar için şimdiki saatin 10 m rüzgârı (u, v; km/s). Türkiye'deyse Türkiye ve çevresi,
    değilse konumun çevresi. Izgara 2,5° aralıklı (≈66 nokta): çok noktalı istekler her noktayı ayrı saydığı için
    istek sınırını korumak üzere seyrek tutulur; aradaki değerleri tarayıcı hesaplar."""
    adim = 2.5
    if 33 <= lat <= 44 and 24 <= lon <= 47:
        (la0, la1), (lo0, lo1) = (32.5, 45.0), (22.5, 47.5)
    else:
        la0, lo0 = round(lat) - 7.5, round(lon) - 12.5
        la1, lo1 = la0 + 15, lo0 + 25
    lats, lons = np.arange(la0, la1 + 0.01, adim), np.arange(lo0, lo1 + 0.01, adim)
    LA, LO = np.meshgrid(lats, lons, indexing="ij")
    res = getir(FC, {"latitude": ",".join(f"{x:.2f}" for x in LA.ravel()),
                     "longitude": ",".join(f"{x:.2f}" for x in LO.ravel()),
                     "hourly": "wind_speed_10m,wind_direction_10m", "forecast_days": 1, "timezone": "UTC"},
                durdur=False)
    if res is None:
        return None
    res = res if isinstance(res, list) else [res]
    simdi = pd.Timestamp.now(tz="UTC").tz_localize(None).floor("h")
    zaman = pd.to_datetime(res[0]["hourly"]["time"])
    i = int(np.argmin(np.abs((zaman - simdi).total_seconds())))
    hiz = np.array([r["hourly"]["wind_speed_10m"][i] for r in res], dtype=float)
    yon = np.radians(np.array([r["hourly"]["wind_direction_10m"][i] for r in res], dtype=float))
    temiz = lambda a: [None if not np.isfinite(x) else round(float(x), 2) for x in a]
    # meteorolojik yön rüzgârın GELDİĞİ yöndür; hareket vektörü bunun tersidir
    return {"lat0": float(lats[0]), "lon0": float(lons[0]), "dlat": adim, "dlon": adim,
            "ny": len(lats), "nx": len(lons), "u": temiz(-hiz * np.sin(yon)), "v": temiz(-hiz * np.cos(yon))}


def canli_harita(konum, katmanlar, uydu_katman, koyu, yakinlik=5.2, key="canli"):
    """Haritayı çizer; kullanıcı bir noktaya tıklarsa {"lat", "lon"} döner, yoksa None."""
    radar, kapsama = radar_kareleri() if katmanlar.get("radar") else ([], None)
    uydu = uydu_kareleri(uydu_katman) if katmanlar.get("uydu") else []
    ruzgar = ruzgar_izgarasi(konum["lat"], konum["lon"]) if katmanlar.get("ruzgar") else None
    sonuc = _BILESEN(
        key=f"{key}_{'koyu' if koyu else 'acik'}",
        data={"stil": STILLER[koyu], "koyu": koyu, "konum": {"lat": konum["lat"], "lon": konum["lon"]},
              "merkez": {"lat": konum["lat"], "lon": konum["lon"]}, "merkez_anahtari": f"{konum['lat']},{konum['lon']}",
              "yakinlik": yakinlik, "saat_dilimi": konum["tz"] if konum["tz"] != "auto" else "Europe/Istanbul",
              "katmanlar": katmanlar, "radar": radar, "kapsama": kapsama, "uydu": uydu, "ruzgar": ruzgar},
        on_tiklama_change=lambda: None,
    )
    return sonuc.tiklama
