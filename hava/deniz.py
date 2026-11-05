"""Balıkçılık ve deniz: en yakın deniz noktası, denize çıkış güvenliği, ay evresi ve balıkçı göstergesi.
Güvenlik eşikleri küçük tekneler (~7 m altı) için Douglas deniz ve Beaufort rüzgâr ölçeklerine göre seçildi."""
import numpy as np
import pandas as pd
import shapely
import streamlit as st

from hava.veri import DENIZ, getir, simdiden, tablo
from hava.yerler import kerteriz, mesafe_km
from hava.yorum import Uyari, aralik, zaman

DENIZ_SAATLIK = ("wave_height,wave_direction,wave_period,wind_wave_height,wind_wave_period,swell_wave_height,"
                 "swell_wave_period,swell_wave_direction,sea_surface_temperature,ocean_current_velocity,"
                 "sea_level_height_msl")
SEVIYE_AD = ["Uygun", "Dikkat", "Riskli", "Tehlikeli"]
SEVIYE_RENK = ["#8CBF5A", "#F1D24E", "#F0A060", "#E05545"]
AY_EVRE = [(1.0, "🌑", "Yeni ay"), (6.4, "🌒", "Büyüyen hilal"), (8.4, "🌓", "İlk dördün"),
           (13.8, "🌔", "Büyüyen ay"), (15.8, "🌕", "Dolunay"), (21.1, "🌖", "Küçülen ay"), (23.1, "🌗", "Son dördün"),
           (28.5, "🌘", "Küçülen hilal"), (29.6, "🌑", "Yeni ay")]
SINODIK = 29.530588853


def en_yakin_deniz(lat, lon):
    """Konumun kendisi denizde değilse çevresinde (≈110 km'ye kadar) deniz verisi olan en yakın noktayı arar.
    Dönüş: (enlem, boylam, km, açık denizin yönü°) ya da None. Açık denizin yönü, çevredeki deniz
    noktalarının ortalama yönüdür; konum her yanı denizle çevriliyse (açık deniz) None olur."""
    halka = lambda r: [(lat + r * np.cos(np.radians(a)), lon + r * np.sin(np.radians(a)) / np.cos(np.radians(lat)))
                       for a in range(0, 360, 30)]
    # istek sınırını korumak için iki aşama: önce yakın çevre, deniz çıkmazsa daha uzak halkalar
    for noktalar in ([(lat, lon)] + halka(0.3) + halka(0.6), halka(0.9) + halka(1.2)):
        js = getir(DENIZ, {"latitude": ",".join(f"{a:.3f}" for a, _ in noktalar),
                           "longitude": ",".join(f"{b:.3f}" for _, b in noktalar),
                           "hourly": "wave_height", "forecast_days": 1})
        js = js if isinstance(js, list) else [js]
        adaylar = [(mesafe_km(lat, lon, a, b), a, b) for (a, b), r in zip(noktalar, js)
                   if any(x is not None for x in r["hourly"]["wave_height"])]
        if adaylar:
            break
    else:
        return None
    km, a, b = min(adaylar)
    yonler = np.radians([kerteriz(lat, lon, x, y) for d, x, y in adaylar if d > 1])
    yon = None
    if len(yonler) and len(yonler) < len(noktalar) - 1:
        ortalama = np.hypot(np.sin(yonler).mean(), np.cos(yonler).mean())
        if ortalama > 0.3:                      # deniz belirgin biçimde bir yanda
            yon = float(np.degrees(np.arctan2(np.sin(yonler).mean(), np.cos(yonler).mean())) % 360)
    return a, b, km, yon


def deniz_verisi(lat, lon, k, gun):
    js = getir(DENIZ, {"latitude": lat, "longitude": lon, "hourly": DENIZ_SAATLIK, "forecast_days": gun,
                       "timezone": k["tz"]})
    return simdiden(tablo(js["hourly"]), k)


def ay(t):
    """Ay yaşı (gün), evre simgesi/adı ve aydınlanma yüzdesi. Bilinen bir yeni aydan (6 Ocak 2000 18:14 UT)
    sinodik ay uzunluğuyla ileri sayar; birkaç saatlik hata balıkçılık için önemsizdir."""
    yas = ((pd.Timestamp(t) - pd.Timestamp("2000-01-06 18:14")).total_seconds() / 86400) % SINODIK
    simge, ad = next((s, a) for sinir, s, a in AY_EVRE if yas < sinir)
    return yas, simge, ad, 50 * (1 - np.cos(2 * np.pi * yas / SINODIK))


def guvenlik(d, hava, deniz_yonu=None):
    """Saatlik güvenlik seviyeleri (0 uygun … 3 tehlikeli) ve nedenleri."""
    s = pd.DataFrame(index=d.index)
    h = d.wave_height
    s["dalga"] = np.select([h >= 2, h >= 1, h >= 0.5], [3, 2, 1], 0)
    g = hava.wind_gusts_10m.reindex(d.index)
    s["ruzgar"] = np.select([g >= 50, g >= 38, g >= 25], [3, 2, 1], 0)
    gor = hava.visibility.reindex(d.index)
    s["gorus"] = np.select([gor < 1000, gor < 4000], [2, 1], 0)
    s["firtina"] = np.where(hava.weather_code.reindex(d.index) >= 95, 3, 0)
    s["kara_ruzgari"] = False
    if deniz_yonu is not None:
        # rüzgâr karadan denize esiyorsa (geldiği yön ≈ kıyıdan denize bakışın tersi) tekne açığa sürüklenir
        gelis = hava.wind_direction_10m.reindex(d.index)
        fark = np.abs((gelis - (deniz_yonu + 180) + 180) % 360 - 180)
        s["kara_ruzgari"] = (fark < 60) & (g >= 20)
        s["ruzgar"] = np.where(s.kara_ruzgari, np.maximum(s.ruzgar, 1), s.ruzgar)
    s["genel"] = s[["dalga", "ruzgar", "gorus", "firtina"]].max(axis=1)
    return s


def pencereler(maske: pd.Series, en_az_saat=2):
    """True olan ardışık saat bloklarını (başlangıç, bitiş) listesi olarak döndürür."""
    blok = (maske != maske.shift()).cumsum()
    out = []
    for _, p in maske[maske].groupby(blok[maske]):
        if len(p) >= en_az_saat:
            out.append((p.index[0], p.index[-1] + pd.Timedelta(hours=1)))
    return out


def balik_gostergesi(d, hava, gunluk):
    """Balıkçıların yaygın gözlemlerine dayanan 0–100 arası gösterge ve bileşenleri.
    Bilimsel olarak kanıtlanmış bir model DEĞİLDİR; sayfada da böyle sunulur."""
    t = d.index
    g = pd.DataFrame(index=t)
    gun = gunluk.reindex(t.normalize())
    dogus, batis = gun.sunrise.to_numpy(), gun.sunset.to_numpy()
    saat = lambda a, b: (np.asarray(a, "datetime64[ns]") - np.asarray(b, "datetime64[ns]")) / np.timedelta64(1, "h")
    yakin = np.minimum(np.abs(saat(t, dogus)), np.abs(saat(t, batis)))
    g["alacakaranlik"] = np.clip(30 * (1 - yakin / 1.5), 0, 30)

    # Ay, güneşten her gün ~50 dk geç meridyenden geçer: geçiş ≈ güneş öğlesi + ay yaşı × 24/29.53 saat.
    # Ana dönemler geçiş ve 12 saat sonrası (ay "tepede" ve "ayak altında"), ara dönemler ay doğuşu/batışı (≈ ±6 sa).
    yas = np.array([ay(x)[0] for x in t])
    ogle = dogus + (batis - dogus) / 2
    fark = saat(t, ogle) - yas * 24 / SINODIK                 # şimdiki saatin ay geçişine uzaklığı
    uzak = lambda kayma: np.abs((fark - kayma + 6) % 12 - 6)
    g["ay_konumu"] = np.where(uzak(0) <= 1, 20, np.where(np.minimum(uzak(6.2), uzak(-6.2)) <= 0.5, 10, 0))
    g["ay_evresi"] = np.where((yas < 3) | (yas > SINODIK - 3) | (np.abs(yas - SINODIK / 2) < 3), 10, 0)

    p = hava.pressure_msl.reindex(t)
    dp = p - hava.pressure_msl.shift(3).reindex(t)
    g["basinc"] = np.select([dp < -2, dp < -0.7, dp.abs() <= 0.7, dp > 0.7], [0, 20, 15, 5], 0)
    w = hava.wind_speed_10m.reindex(t)
    g["ruzgar"] = np.select([w < 5, w < 20, w < 30], [8, 15, 5], 0)
    g["toplam"] = g.sum(axis=1).clip(0, 100)
    g["dp"] = dp
    return g


# ----------------------------------------------------------------- genel bakış için deniz uyarıları
@st.cache_resource(max_entries=1)
def _kiyi_cizgisi():
    import cartopy.feature as cf
    kiyi = shapely.union_all(list(cf.NaturalEarthFeature("physical", "coastline", "50m").geometries()))
    shapely.prepare(kiyi)
    return kiyi


def kiyida_mi(lat, lon, km=25):
    """Konum kıyı çizgisine `km`'den yakın mı? Yerel veriyle bakılır; deniz API'sine istek gitmez."""
    return shapely.dwithin(_kiyi_cizgisi(), shapely.Point(lon, lat), km / 111)


def uyarilar(k, gun):
    """Kıyıdaki konumlar için "Nelere dikkat etmeli?" kartlarına eklenecek deniz uyarıları."""
    if not kiyida_mi(k["lat"], k["lon"]):
        return []
    bulunan = en_yakin_deniz(k["lat"], k["lon"])
    if bulunan is None:
        return []
    dlat, dlon, _, deniz_yonu = bulunan
    kd = dict(k, lat=dlat, lon=dlon)
    d = deniz_verisi(dlat, dlon, kd, gun + 1).dropna(subset=["wave_height"])
    d = d.loc[d.index < d.index[0] + pd.Timedelta(days=gun)] if not d.empty else d
    if d.empty:
        return []
    h = d.wave_height
    out = []
    if h.max() >= 1:
        seviye = "tehlike" if h.max() >= 2.5 else "dikkat"
        out.append(Uyari(seviye, ":material/tsunami:", "Dalgalı deniz",
                         f"Belirgin dalga yüksekliği {h.max():.1f} m'ye çıkıyor ({zaman(h.idxmax())}). "
                         f"1 m üstü: {aralik(h >= 1)}.",
                         "Belirgin dalga yüksekliği en yüksek üçte bir dalganın ortalamasıdır; tek tek dalgalar bunun "
                         "iki katına ulaşabilir. Küçük tekneler için 1 m üstü riskli, 2 m üstü tehlikelidir; dalgalar "
                         "dalgakıranları, sahil yollarını ve iskeleleri de aşabilir.",
                         "app_pages/balikcilik.py",
                         "Balıkçılık ve deniz sayfasında saat saat denize çıkış çizelgesine ve dalga periyoduna bak."))
    s = d.sea_level_height_msl
    if s.notna().any() and s.max() - s.min() >= 0.4:
        out.append(Uyari("bilgi", ":material/water:", "Deniz seviyesi değişimi",
                         f"Deniz seviyesi dönem içinde {s.max() - s.min():.1f} m oynuyor; en yüksek {zaman(s.idxmax())}.",
                         "Türkiye kıyılarında gelgit birkaç santimetredir; büyük seviye değişimlerini kıyıya doğru "
                         "esen kuvvetli rüzgâr ve alçak basınç (fırtına kabarması) yaratır.",
                         "app_pages/balikcilik.py", "Balıkçılık ve deniz sayfasındaki deniz seviyesi grafiğine bak."))
    return out
