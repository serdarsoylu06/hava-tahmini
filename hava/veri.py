"""Open-Meteo'dan veri indirme ve ortak yardımcılar.
Veri: Open-Meteo (ücretsiz, anahtarsız) — ECMWF, GFS, ICON, ARPEGE, UKMO modelleri."""
import hashlib
import json
import os
import time
from pathlib import Path

import pandas as pd
import requests
import streamlit as st

FC = "https://api.open-meteo.com/v1/forecast"
ENS = "https://ensemble-api.open-meteo.com/v1/ensemble"
GEO = "https://geocoding-api.open-meteo.com/v1/search"
DENIZ = "https://marine-api.open-meteo.com/v1/marine"
RAKIM = "https://api.open-meteo.com/v1/elevation"
TZ = "Europe/Istanbul"   # yalnızca bölge haritaları için; nokta tahminleri yerin kendi saatini kullanır
SEVIYELER = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200]
GUN_EN_COK = 10          # ortak tahmin isteği hep bu kadar gün çeker; sayfalar kendi aralığını keser

SAATLIK = ("temperature_2m,dew_point_2m,apparent_temperature,precipitation,precipitation_probability,"
           "weather_code,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,"
           "cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,relative_humidity_2m,"
           "snowfall,freezing_level_height,visibility,uv_index,cape")
GUNLUK = ("weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,"
          "precipitation_probability_max,snowfall_sum,wind_gusts_10m_max,wind_direction_10m_dominant,"
          "sunrise,sunset,uv_index_max")
ANLIK = ("temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,weather_code,is_day,"
         "wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover,precipitation,"
         "visibility,uv_index")

# WMO hava kodu → (gündüz simgesi, gece simgesi, açıklama)
WMO = {
    0: ("☀️", "🌙", "Açık"), 1: ("🌤️", "🌙", "Az bulutlu"), 2: ("⛅", "☁️", "Parçalı bulutlu"),
    3: ("☁️", "☁️", "Kapalı"), 45: ("🌫️", "🌫️", "Sis"), 48: ("🌫️", "🌫️", "Kırağılı sis"),
    51: ("🌦️", "🌧️", "Hafif çisenti"), 53: ("🌦️", "🌧️", "Çisenti"), 55: ("🌧️", "🌧️", "Yoğun çisenti"),
    56: ("🌧️", "🌧️", "Donan çisenti"), 57: ("🌧️", "🌧️", "Yoğun donan çisenti"),
    61: ("🌦️", "🌧️", "Hafif yağmur"), 63: ("🌧️", "🌧️", "Yağmur"), 65: ("🌧️", "🌧️", "Kuvvetli yağmur"),
    66: ("🌧️", "🌧️", "Donan yağmur"), 67: ("🌧️", "🌧️", "Kuvvetli donan yağmur"),
    71: ("🌨️", "🌨️", "Hafif kar"), 73: ("🌨️", "🌨️", "Kar"), 75: ("❄️", "❄️", "Yoğun kar"),
    77: ("🌨️", "🌨️", "Kar taneleri"), 80: ("🌦️", "🌧️", "Hafif sağanak"), 81: ("🌧️", "🌧️", "Sağanak"),
    82: ("⛈️", "⛈️", "Şiddetli sağanak"), 85: ("🌨️", "🌨️", "Kar sağanağı"),
    86: ("❄️", "❄️", "Yoğun kar sağanağı"), 95: ("⛈️", "⛈️", "Gök gürültülü sağanak"),
    96: ("⛈️", "⛈️", "Dolu ile fırtına"), 99: ("⛈️", "⛈️", "Şiddetli dolu ile fırtına"),
}


def simge(kod, gunduz=True):
    g, c, _ = WMO.get(int(kod) if pd.notna(kod) else -1, ("❔", "❔", "Bilinmiyor"))
    return g if gunduz else c


def durum(kod):
    return WMO.get(int(kod) if pd.notna(kod) else -1, ("", "", "Bilinmiyor"))[2]


def yon_adi(derece):
    """Rüzgârın estiği yön (meteorolojik: rüzgârın GELDİĞİ yön)."""
    adlar = ["K", "KKD", "KD", "DKD", "D", "DGD", "GD", "GGD", "G", "GGB", "GB", "BGB", "B", "BKB", "KB", "KKB"]
    return adlar[int((derece % 360) / 22.5 + 0.5) % 16]


# ----------------------------------------------------------------- indirme
# Open-Meteo'nun ücretsiz kullanımında saatlik/günlük istek sınırı var ve çok noktalı harita istekleri her noktayı
# ayrı sayar. Bu yüzden veri saat dilimlerine bağlanır: 13:10–14:09 arasında açılan her sayfa, kim açarsa açsın,
# aynı yanıtı önbellekten kullanır; ana kaynağa yeni istek ancak 14:10'da gider. 10 dakikalık pay, sağlayıcının saat
# başı güncellemesinin yayılmasına zaman tanır. Yanıtlar diske de yazılır, uygulama yeniden başlasa bile korunur.
ONBELLEK = Path(__file__).resolve().parent.parent / ".onbellek"
GECIKME = pd.Timedelta(minutes=10)


def donem():
    """Şu anki veri dönemi, ör. 13:10–14:09 arası için "2026-11-04T13"."""
    return (pd.Timestamp.now() - GECIKME).floor("h").strftime("%Y-%m-%dT%H")


def _anahtar(url, params):
    return hashlib.sha1(json.dumps([url, params], sort_keys=True).encode()).hexdigest()


@st.cache_data(show_spinner="Veri indiriliyor…", max_entries=300)
def indir(url, params, donem):
    """`donem` önbellek anahtarının parçasıdır: dönem değişince bellekteki kayıt da kendiliğinden geçersizleşir."""
    yol = ONBELLEK / f"{_anahtar(url, params)}_{donem}.json"
    if yol.exists():
        return json.loads(yol.read_text())
    r = requests.get(url, params=params, timeout=90)
    r.raise_for_status()
    if not r.text.strip():                          # boş yanıt (ör. 204): önbelleğe yazma
        return None
    ONBELLEK.mkdir(exist_ok=True)
    yol.write_text(r.text)
    for eski in ONBELLEK.glob("*.json"):            # bir günden eski yanıtları temizle
        if time.time() - eski.stat().st_mtime > 86400:
            eski.unlink(missing_ok=True)
    return r.json()


def ornek_modu():
    """Örnek veri modu açık mı? Kenar çubuğundaki düğme ya da HAVA_ORNEK=1 ortam değişkeni."""
    return st.session_state.get("ornek_veri", os.environ.get("HAVA_ORNEK", "") in ("1", "true", "evet"))


@st.cache_data(show_spinner="Örnek veri üretiliyor…", max_entries=300)
def _ornek(url, params, donem):
    from hava import ornek
    return ornek.yanit(url, params)


def _son_kayit(url, params):
    """Önceki dönemlerden kalan en yeni yanıt (istek sınırı aşıldığında yedek)."""
    kayitlar = sorted(ONBELLEK.glob(f"{_anahtar(url, params)}_*.json")) if ONBELLEK.exists() else []
    for k in reversed(kayitlar):
        try:
            return json.loads(k.read_text()), k.stem.split("_")[-1]
        except ValueError:                          # bozuk kayıt: atla
            continue
    return None, None


def getir(url, params, durdur=True) -> dict | list | None:
    """Veriyi önbellekten ya da kaynaktan getirir. Alınamazsa önceki dönemin verisine düşer; o da yoksa
    `durdur` True ise hatayı gösterip sayfayı durdurur, False ise yalnızca kısa bir bildirim verip None döner."""
    if ornek_modu():
        return _ornek(url, params, donem())
    try:
        return indir(url, params, donem())
    except requests.RequestException as e:
        neden = ""
        yanit = e.response
        if yanit is not None:
            try:
                neden = yanit.json().get("reason", "")
            except ValueError:
                pass
        sinir = yanit is not None and yanit.status_code == 429
        eski, ne_zaman = _son_kayit(url, params)
        if eski is not None:
            st.toast(f"{'İstek sınırı aşıldı' if sinir else 'Veri alınamadı'}; {ne_zaman.replace('T', ' ')}:10 "
                     "dönemine ait önceki veri gösteriliyor.", icon=":material/history:")
            return eski
        if not durdur:
            st.toast("İstek sınırı aşıldı; bu katman şimdilik gösterilemiyor." if sinir else
                     "Veri alınamadı; bu katman şimdilik gösterilemiyor.", icon=":material/cloud_off:")
            return None
        if sinir:
            st.error("Open-Meteo'nun ücretsiz kullanım sınırı doldu. Haritalar her ızgara noktasını ayrı bir istek "
                     "sayar, bu yüzden sınırı en hızlı onlar tüketir. Bir süre sonra (genellikle bir saat içinde) "
                     f"tekrar dene; daha önce açtığın sayfalar önbellekten çalışmaya devam eder.\n\nAyrıntı: {neden}",
                     title="İstek sınırı aşıldı", icon=":material/hourglass_top:")
        else:
            st.error("İnternet bağlantını kontrol edip sayfayı yenile.\n\n"
                     f"Ayrıntı: {neden or e}", title="Veri alınamadı", icon=":material/cloud_off:")
        st.stop()


def tablo(hourly):
    df = pd.DataFrame(hourly)
    df["time"] = pd.to_datetime(df["time"])
    df = df.set_index("time")
    return df.apply(pd.to_numeric, errors="coerce")


def tahmin(k):
    """Seçili konum için anlık durum, saatlik ve günlük tahmin (tüm sayfalar aynı önbelleği paylaşır)."""
    js = getir(FC, {"latitude": k["lat"], "longitude": k["lon"], "current": ANLIK, "hourly": SAATLIK,
                    "daily": GUNLUK, "forecast_days": GUN_EN_COK, "timezone": k["tz"]})
    gunluk = pd.DataFrame(js["daily"])
    gunluk["time"] = pd.to_datetime(gunluk["time"])
    for c in ("sunrise", "sunset"):
        gunluk[c] = pd.to_datetime(gunluk[c])
    return js["current"], tablo(js["hourly"]), gunluk.set_index("time")


def ansambl(k, model, degisken, gun):
    js = getir(ENS, {"latitude": k["lat"], "longitude": k["lon"], "hourly": degisken, "models": model,
                     "forecast_days": gun, "timezone": k["tz"]})
    df = simdiden(tablo(js["hourly"]), k)
    return df[[c for c in df.columns if c == degisken or c.startswith(degisken + "_member")]]


def simdiden(df, k):
    """Saatlik tabloyu konumun yerel saatiyle şu anki saatten başlatır (API gece yarısından başlar)."""
    simdi = pd.Timestamp.now(tz=None if k["tz"] == "auto" else k["tz"]).tz_localize(None).floor("h")
    return df[df.index >= simdi]


def konum():
    """Kenar çubuğunda seçilen konum (hava_lab.py doldurur)."""
    return st.session_state["konum"]
