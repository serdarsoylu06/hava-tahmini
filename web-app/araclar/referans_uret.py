"""TypeScript katmanının eşdeğerlik testleri için referans çıktılar üretir.

Mevcut Streamlit uygulamasının Python fonksiyonlarını OLDUĞU GİBİ çağırır (hiçbirini değiştirmez) ve
girdileriyle birlikte sonuçlarını web-app/referans/*.json dosyalarına yazar. TypeScript testleri aynı
girdileri kendi fonksiyonlarına verip sonucu bu dosyalarla karşılaştırır.

Çalıştırma (depo kökünden):   .venv/bin/python web-app/araclar/referans_uret.py
Python tarafında bir formül değişirse bu betik yeniden çalıştırılır; TS testleri farkı gösterir.
"""
import json
import math
import sys
import warnings
from pathlib import Path

KOK = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(KOK))
warnings.filterwarnings("ignore")

import numpy as np   # noqa: E402
import pandas as pd  # noqa: E402

from hava import veri, yerler, yorum  # noqa: E402

CIKTI = Path(__file__).resolve().parents[1] / "referans"
CIKTI.mkdir(exist_ok=True)


def yaz(ad, icerik, sik=False):
    """`sik`: büyük sayı tabloları için girintisiz yazım (dosya küçük kalsın)."""
    metin = json.dumps(icerik, ensure_ascii=False, separators=(",", ":")) if sik else \
        json.dumps(icerik, ensure_ascii=False, indent=1)
    (CIKTI / f"{ad}.json").write_text(metin + "\n", encoding="utf-8")
    print(f"{ad}.json: {len(icerik) if hasattr(icerik, '__len__') else 1} kayıt, {len(metin) // 1024} KB")


def sayi(x):
    """JSON'a yazılabilir sayı: NaN/NaT → None, numpy türleri → Python türleri."""
    if x is None or (isinstance(x, float) and math.isnan(x)) or x is pd.NaT:
        return None
    if isinstance(x, (np.floating, np.integer)):
        return None if np.isnan(x) else x.item()
    if isinstance(x, np.bool_):
        return bool(x)
    return x


def saat(t):
    return None if pd.isna(t) else pd.Timestamp(t).strftime("%Y-%m-%dT%H:%M")


def tablo_json(df):
    """DataFrame → {"zaman": [...], "sutun": {...}} (TypeScript'teki Tablo biçimi)."""
    return {"zaman": [saat(t) for t in df.index], "sutun": {c: [sayi(v) for v in df[c]] for c in df.columns}}


# ---------------------------------------------------------------- yön adı (16'lı pusula)
acilar = [x / 4 for x in range(-720, 2 * 1440 + 1)]            # -180° … 720°, 0,25° adım
yaz("yon_adi", [{"derece": a, "ad": veri.yon_adi(a)} for a in acilar])

# ---------------------------------------------------------------- mesafe ve kerteriz
rng = np.random.default_rng(20261114)
ciftler = [(39.92, 32.85, 41.01, 28.95), (40.92, 38.39, 41.0, 39.72), (0.0, 0.0, 0.0, 180.0),
           (89.9, 10.0, -89.9, -170.0), (41.6, 36.2, 41.6, 36.2), (-33.87, 151.21, 51.51, -0.13)]
ciftler += [tuple(float(x) for x in (rng.uniform(-85, 85), rng.uniform(-180, 180), rng.uniform(-85, 85),
                                      rng.uniform(-180, 180))) for _ in range(200)]
yaz("mesafe_kerteriz", [{"girdi": list(c), "km": float(yerler.mesafe_km(*c)), "kerteriz": float(yerler.kerteriz(*c))}
                        for c in ciftler])

# ---------------------------------------------------------------- yerleşim listesi → konum kaydı
y = yerler.yerlesimler()
etiketler = list(y)
secili = etiketler[:40] + etiketler[len(etiketler) // 2:len(etiketler) // 2 + 40] + etiketler[-40:]
secili += [e for e in ("Ankara", "Tirebolu, Giresun", "Londra (London), Birleşik Krallık") if e in y and e not in secili]
yaz("konum_kaydi", {"toplam": len(etiketler),
                    "kayitlar": [{"etiket": e, "konum": yerler.konum_kaydi(y[e])} for e in secili]})

# ---------------------------------------------------------------- haritadan seçilen nokta → konum
noktalar = [(41.6, 36.2), (39.9199, 32.8543), (39.93, 32.86), (40.95, 38.45), (36.0, 30.0), (51.5, -0.1),
            (-40.0, -140.0), (0.0, 0.0), (64.1, -21.9), (35.7, 139.7), (42.5, 34.0), (38.42, 27.14)]
noktalar += [(float(rng.uniform(34, 44)), float(rng.uniform(24, 46))) for _ in range(60)]
noktalar += [(float(rng.uniform(-70, 75)), float(rng.uniform(-180, 180))) for _ in range(40)]
yaz("nokta_konumu", [{"lat": a, "lon": b, "konum": yerler.nokta_konumu(a, b)} for a, b in noktalar])

# ---------------------------------------------------------------- veri dönemi (saat dilimine bağlı önbellek anahtarı)
anlar = ["2026-11-04T10:09:59Z", "2026-11-04T10:10:00Z", "2026-11-04T11:09:00Z", "2026-11-04T21:05:00Z",
         "2026-11-04T21:10:00Z", "2026-12-31T20:59:00Z", "2026-12-31T21:09:59Z", "2026-12-31T21:10:00Z",
         "2027-02-28T21:15:00Z", "2028-02-29T00:00:00Z", "2026-03-29T00:30:00Z", "2026-10-25T00:30:00Z"]
donemler = []
asil = veri.simdi_tr
for an in anlar:
    veri.simdi_tr = lambda an=an: pd.Timestamp(an).tz_convert(veri.TZ).tz_localize(None)   # saati sabitle
    donemler.append({"an": an, "donem": veri.donem(), "simdi_tr": veri.simdi_tr().strftime("%Y-%m-%dT%H:%M")})
veri.simdi_tr = asil
yaz("donem", donemler)

# ---------------------------------------------------------------- şu andan başlat (yerin kendi saatine göre)
# veri.simdiden() saati sistemden okur; aynı tek satır burada sabit bir anla kurulur.
saatler = pd.date_range("2026-11-14 00:00", periods=72, freq="h")
ham = {"time": [t.strftime("%Y-%m-%dT%H:%M") for t in saatler],
       "temperature_2m": [round(10 + 5 * math.sin(i / 4), 1) for i in range(72)],
       "precipitation": [None if i % 17 == 5 else round(max(0, math.sin(i / 3)), 2) for i in range(72)],
       "metin": ["3.5" if i % 9 == 0 else "yok" if i % 9 == 4 else i for i in range(72)]}
tablo = veri.tablo(ham)
temiz = lambda s: [None if pd.isna(x) else float(x) for x in s]
simdiden = []
for an in ("2026-11-14T19:05:00Z", "2026-11-14T21:00:00Z", "2026-11-14T20:59:59Z", "2026-11-15T23:30:00Z"):
    for tz in ("Europe/Istanbul", "Europe/London", "America/New_York", "Asia/Tokyo", "Asia/Kolkata", "Australia/Adelaide"):
        simdi = pd.Timestamp(an).tz_convert(tz).tz_localize(None).floor("h")
        kalan = tablo[tablo.index >= simdi]
        simdiden.append({"an": an, "tz": tz, "simdi": simdi.strftime("%Y-%m-%dT%H:%M"), "satir": len(kalan),
                         "ilk": kalan.index[0].strftime("%Y-%m-%dT%H:%M") if len(kalan) else None})
yaz("tablo_simdiden", {"ham": ham, "tablo": {c: temiz(tablo[c]) for c in tablo.columns}, "simdiden": simdiden})

# ---------------------------------------------------------------- zaman yazımı
zamanlar = [t.strftime("%Y-%m-%dT%H:%M") for t in pd.date_range("2026-12-27 21:00", periods=40, freq="7h")]
yaz("zaman_yazimi", [{"t": t, "zaman": yorum.zaman(pd.Timestamp(t)), "gun": yorum.gun(pd.Timestamp(t))} for t in zamanlar])

# ---------------------------------------------------------------- Python sayı biçimi (f"{x:.0f}", f"{x:.2f}" …)
sayilar = [0.5, 1.5, 2.5, 3.5, -0.5, -1.5, 0.125, 0.375, 41.125, 41.135, 1.005, 2.675, 39.9199, 32.8543, 149.5, 150.0,
           2.4999999, 1e-9, -0.0, 0.045, 0.055, 1234.5, 7.25, 7.35, 99.995, 1024.95, 0.05, 0.15, 0.25, 0.35]
sayilar += [float(x) for x in rng.uniform(-200, 1100, 300)]
yaz("sayi_bicimi", [{"x": x, "b0": f"{x:.0f}", "b1": f"{x:.1f}", "b2": f"{x:.2f}", "b3": f"{x:.3f}"} for x in sayilar])

# ---------------------------------------------------------------- WMO hava kodları
yaz("wmo", [{"kod": k, "gunduz": veri.simge(k, True), "gece": veri.simge(k, False), "durum": veri.durum(k)}
            for k in list(veri.WMO) + [4, 100, -1]])

# ---------------------------------------------------------------- API istek sabitleri (TS tarafı birebir aynı olmalı)
yaz("sabitler", {"FC": veri.FC, "ENS": veri.ENS, "GEO": veri.GEO, "DENIZ": veri.DENIZ, "TZ": veri.TZ,
                 "SEVIYELER": veri.SEVIYELER, "GUN_EN_COK": veri.GUN_EN_COK, "SAATLIK": veri.SAATLIK,
                 "GUNLUK": veri.GUNLUK, "ANLIK": veri.ANLIK, "GUNLER": yorum.GUNLER, "YONLER": yerler.YONLER})


# ================================================================= 3. AŞAMA: hesaplar
from dataclasses import asdict  # noqa: E402

from hava import ornek  # noqa: E402

# Örnek veri üreticisi "şu an"ı sistemden okur; referanslar girdileriyle birlikte saklandığı için bu sorun değildir.
ORNEK_KONUMLAR = {"Ankara": (39.92, 32.85, "Europe/Istanbul", 850.0), "Tirebolu": (41.01, 38.81, "Europe/Istanbul", 20.0),
                  "Erzurum": (39.90, 41.27, "Europe/Istanbul", 1890.0), "Londra": (51.51, -0.13, "Europe/London", 25.0)}


def ornek_tahmin(lat, lon, tz, gun=10):
    js = ornek.yanit(veri.FC, {"latitude": lat, "longitude": lon, "current": veri.ANLIK, "hourly": veri.SAATLIK,
                               "daily": veri.GUNLUK, "forecast_days": gun, "timezone": tz})
    return js, veri.tablo(js["hourly"])


# ---------------------------------------------------------------- uyarılar (hava/yorum.py → uyarilar)
def sakin(n=72, bas="2026-11-14 00:00"):
    """Hiçbir eşiği aşmayan taban tablo; senaryolar bunun üstüne kurulur."""
    t = pd.date_range(bas, periods=n, freq="h")
    i = np.arange(n)
    return pd.DataFrame({
        "temperature_2m": 12 + 4 * np.sin((i - 9) / 24 * 2 * np.pi), "dew_point_2m": 4.0, "apparent_temperature": 11.0,
        "precipitation": 0.0, "precipitation_probability": 5.0, "weather_code": 1.0, "is_day": 1.0,
        "wind_speed_10m": 12.0, "wind_gusts_10m": 22.0, "wind_direction_10m": 200.0, "cloud_cover": 30.0,
        "cloud_cover_low": 10.0, "cloud_cover_mid": 10.0, "cloud_cover_high": 10.0, "pressure_msl": 1018.0,
        "relative_humidity_2m": 55.0, "snowfall": 0.0, "freezing_level_height": 2600.0, "visibility": 24000.0,
        "uv_index": 2.0, "cape": 50.0}, index=t)


def senaryo(ad, degistir, rakim=None, guven=None, n=72):
    df = sakin(n)
    degistir(df)
    return ad, df, rakim, guven


def _don(df): df.iloc[5:9, 0] = [-0.4, -2.5, -1.0, 0.0]; df.iloc[30:33, 0] = -3.0
def _sert_don(df): df.iloc[20:30, 0] = -7.6
def _ruzgar(df): df.loc[df.index[10:14], "wind_gusts_10m"] = [50.0, 62.5, 55.0, 49.9]; df.loc[df.index[40], "wind_gusts_10m"] = 51.0
def _firtina_ruzgar(df): df.loc[df.index[10:20], "wind_gusts_10m"] = 88.5
def _yagis_saatlik(df): df.loc[df.index[15], "precipitation"] = 7.65
def _yagis_gunluk(df): df.loc[df.index[24:48], "precipitation"] = 1.0; df.loc[df.index[30], "precipitation"] = 2.45
def _sel(df): df.loc[df.index[24:36], "precipitation"] = 4.5
def _donan(df): df.loc[df.index[3:5], "weather_code"] = [66.0, 67.0]; df.loc[df.index[50], "weather_code"] = 56.0
def _kar(df): df.loc[df.index[8:12], "snowfall"] = [0.1, 0.2, 0.15, 0.1]
def _yogun_kar(df): df.loc[df.index[8:20], "snowfall"] = 1.2
def _karla_karisik(df): df.loc[df.index[12:15], "precipitation"] = [0.3, 0.2, 0.5]; df.loc[df.index[12:15], "freezing_level_height"] = [1200.0, 900.0, 1249.0]
def _sis(df):
    df.loc[df.index[4:7], ["dew_point_2m", "wind_speed_10m", "visibility"]] = [df.temperature_2m.iloc[4] - 0.5, 3.0, 400.0]
    df.loc[df.index[4:7], "dew_point_2m"] = df.temperature_2m.iloc[4:7].to_numpy() - 0.5
def _sis_kodu(df): df.loc[df.index[[6, 30]], "weather_code"] = [45.0, 48.0]
def _tek_sis(df): df.loc[df.index[6], "weather_code"] = 45.0
def _gok(df): df.loc[df.index[38:41], "weather_code"] = 95.0; df.loc[df.index[39], "cape"] = 850.0
def _kararsiz(df): df.loc[df.index[14:18], "cape"] = [1000.0, 1800.0, 2600.0, 900.0]; df.loc[df.index[14:18], "precipitation_probability"] = [30.0, 60.0, 29.0, 80.0]
def _basinc(df): df.loc[df.index[24:], "pressure_msl"] = 1018 - np.minimum(np.arange(48) * 0.4, 7.4)
def _bomba(df): df.loc[df.index[10:], "pressure_msl"] = 1018 - np.minimum(np.arange(62) * 0.9, 14.6)
def _sicak(df): df.loc[df.index[12:16], "apparent_temperature"] = [31.9, 32.0, 35.4, 33.0]
def _cok_sicak(df): df.loc[df.index[36:40], "apparent_temperature"] = 38.5
def _uv(df): df.loc[df.index[11:14], "uv_index"] = [5.9, 6.5, 6.4]
def _yuksek_uv(df): df.loc[df.index[35:38], "uv_index"] = [8.0, 9.4, 8.2]
def _eksik(df):
    df.iloc[:, :] = np.nan
    df.iloc[10:20, 0] = -1.5
def _eksik_parca(df):
    df.loc[df.index[::3], ["temperature_2m", "wind_gusts_10m", "precipitation", "pressure_msl", "visibility"]] = np.nan
    df.loc[df.index[7], "temperature_2m"] = -0.6; df.loc[df.index[25], "wind_gusts_10m"] = 77.0
def _hepsi(df):
    for f in (_sert_don, _firtina_ruzgar, _sel, _donan, _yogun_kar, _sis, _kararsiz, _bomba, _cok_sicak, _yuksek_uv):
        f(df)


guven_dusuk = pd.Series([1.2, 2.5, 4.9], index=pd.date_range("2026-11-14", periods=3, freq="D"))
guven_yuksek = pd.Series([1.2, 5.0, 7.6], index=pd.date_range("2026-11-14", periods=3, freq="D"))
senaryolar = [
    senaryo("sakin", lambda df: None), senaryo("sakin, rakım ve düşük yayılım", lambda df: None, 850.0, guven_dusuk),
    senaryo("don", _don), senaryo("sert don", _sert_don), senaryo("rüzgâr", _ruzgar), senaryo("fırtına rüzgârı", _firtina_ruzgar),
    senaryo("saatlik kuvvetli yağış", _yagis_saatlik), senaryo("günlük kuvvetli yağış", _yagis_gunluk), senaryo("sel", _sel),
    senaryo("donan yağmur", _donan), senaryo("kar", _kar), senaryo("yoğun kar", _yogun_kar),
    senaryo("karla karışık (rakım 850)", _karla_karisik, 850.0), senaryo("karla karışık ama rakım yok", _karla_karisik),
    senaryo("karla karışık değil (rakım 100)", _karla_karisik, 100.0),
    senaryo("sis", _sis), senaryo("sis kodu", _sis_kodu), senaryo("tek saat sis (uyarı yok)", _tek_sis),
    senaryo("gök gürültülü", _gok), senaryo("kararsız", _kararsiz), senaryo("basınç düşüşü", _basinc), senaryo("bomba", _bomba),
    senaryo("sıcak", _sicak), senaryo("çok sıcak", _cok_sicak), senaryo("UV", _uv), senaryo("yüksek UV", _yuksek_uv),
    senaryo("belirsizlik", lambda df: None, None, guven_yuksek), senaryo("don + belirsizlik", _don, 1200.0, guven_yuksek),
    senaryo("çoğu eksik", _eksik), senaryo("parça parça eksik", _eksik_parca), senaryo("hepsi birden", _hepsi, 850.0, guven_yuksek),
    senaryo("kısa dönem (20 saat)", _don, n=20),
]
kayitlar = []
for ad, df, rakim, guven in senaryolar:
    kayitlar.append({"ad": ad, "tablo": tablo_json(df), "rakim": rakim,
                     "guven": None if guven is None else {"gun": [t.strftime("%Y-%m-%d") for t in guven.index], "deger": [sayi(v) for v in guven]},
                     "uyarilar": [asdict(u) for u in yorum.uyarilar(df, rakim, guven)]})
# örnek veri üreticisinin senaryosu: dört konum, şu andan itibaren 5 gün (genel bakış sayfasındaki gibi)
ansambl_ref = []
for ad, (lat, lon, tz, rakim) in ORNEK_KONUMLAR.items():
    js, df = ornek_tahmin(lat, lon, tz)
    donem = df.iloc[30:30 + 120]
    ens = ornek.yanit(veri.ENS, {"latitude": lat, "longitude": lon, "hourly": "temperature_2m", "models": "ecmwf_ifs025",
                                 "forecast_days": 10, "timezone": tz})
    uye = veri.tablo(ens["hourly"]).iloc[30:]
    gmax = uye.resample("D").max()
    guven = gmax.quantile(0.9, axis=1) - gmax.quantile(0.1, axis=1)          # app_pages/genel.py ile aynı
    guven_donem = guven.loc[guven.index < donem.index[-1]]
    kayitlar.append({"ad": f"örnek veri: {ad}", "tablo": tablo_json(donem), "rakim": rakim,
                     "guven": {"gun": [t.strftime("%Y-%m-%d") for t in guven_donem.index], "deger": [sayi(v) for v in guven_donem]},
                     "uyarilar": [asdict(u) for u in yorum.uyarilar(donem, rakim, guven_donem)]})
    ansambl_ref.append({"ad": ad, "uyeler": tablo_json(uye),
                        "guven": {"gun": [t.strftime("%Y-%m-%d") for t in guven.index], "deger": [sayi(v) for v in guven]}})
yaz("uyarilar", kayitlar, sik=True)
yaz("ansambl_guveni", ansambl_ref, sik=True)
basliklar = sorted({u["baslik"] for k in kayitlar for u in k["uyarilar"]})
print("  sınanan uyarı türleri:", len(basliklar), basliklar)

# aralik() tek başına
maskeler = [[False] * 10, [True] * 10, [False, True, False, True, True, False, False, True, True, True],
            [True, False] * 5, [False] * 9 + [True], [True] + [False] * 9]
zm = pd.date_range("2026-11-14 21:00", periods=10, freq="h")
yaz("aralik", [{"zaman": [saat(t) for t in zm], "maske": m, "metin": yorum.aralik(pd.Series(m, index=zm))} for m in maskeler])


# ---------------------------------------------------------------- deniz (hava/deniz.py)
from hava import deniz  # noqa: E402


def gunluk_tablo(js):
    """veri.tahmin()'deki gibi günlük tablo (gün doğumu/batımı zaman damgası)."""
    g = pd.DataFrame(js["daily"])
    g["time"] = pd.to_datetime(g["time"])
    for c in ("sunrise", "sunset"):
        g[c] = pd.to_datetime(g[c])
    return g.set_index("time")


def gunluk_json(g):
    return {"gun": [t.strftime("%Y-%m-%d") for t in g.index], "sutun": {},
            "gunDogumu": [saat(t) for t in g.sunrise], "gunBatimi": [saat(t) for t in g.sunset]}


def guvenlik_json(s):
    return {"zaman": [saat(t) for t in s.index], **{c: [sayi(v) for v in s[c]] for c in s.columns}}


def deniz_ornek(lat, lon, tz, gun=7):
    js = ornek.yanit(veri.DENIZ, {"latitude": lat, "longitude": lon, "hourly": deniz.DENIZ_SAATLIK, "forecast_days": gun, "timezone": tz})
    return veri.tablo(js["hourly"])


ay_ref = [{"t": saat(t), **dict(zip(("yas", "simge", "ad", "aydinlanma"), (sayi(x) if not isinstance(x, str) else x for x in deniz.ay(t))))}
          for t in pd.date_range("2026-11-01 03:00", periods=140, freq="11h")]

# güvenlik: eşik sınırlarını tek tek yoklayan elle kurulmuş tablo + örnek veri
zd = pd.date_range("2026-11-14 06:00", periods=16, freq="h")
d_el = pd.DataFrame({"wave_height": [0.49, 0.5, 0.99, 1.0, 1.99, 2.0, np.nan, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]}, index=zd)
zh = pd.date_range("2026-11-14 00:00", periods=20, freq="h")          # deniz tablosundan önce başlar, önce biter
hava_el = pd.DataFrame({
    "wind_gusts_10m": [10.0] * 6 + [24.9, 25.0, 37.9, 38.0, 49.9, 50.0, 20.0, 19.9, np.nan, 22.0, 30.0, 45.0, 20.0, 20.0],
    "visibility": [20000.0] * 6 + [999.0, 1000.0, 3999.0, 4000.0, np.nan, 500.0] + [20000.0] * 8,
    "weather_code": [1.0] * 6 + [95.0, 96.0, 94.0, np.nan, 99.0, 3.0] + [1.0] * 8,
    "wind_direction_10m": [0.0] * 6 + [180.0, 180.0, 180.0, 180.0, 180.0, 180.0, 180.0, 180.0, 180.0, 121.0, 239.0, 240.0, 119.9, np.nan],
    "wind_speed_10m": 10.0, "pressure_msl": 1015.0}, index=zh)
guvenlik_ref = [{"ad": f"elle, deniz yönü {y}", "d": tablo_json(d_el), "hava": tablo_json(hava_el), "deniz_yonu": y,
                 "sonuc": guvenlik_json(deniz.guvenlik(d_el, hava_el, y))} for y in (None, 0.0, 350.0, 200.0)]
balik_ref, pencere_ref, deniz_uyari_ref = [], [], []
for ad, (lat, lon, tz, yon) in {"Tirebolu açığı": (41.20, 38.80, "Europe/Istanbul", 10.0), "Ege açığı": (38.40, 26.30, "Europe/Istanbul", 270.0),
                                "Kuzey Denizi": (54.00, 3.00, "Europe/London", None)}.items():
    d = deniz_ornek(lat, lon, tz)
    js, hava = ornek_tahmin(lat, lon, tz)
    d = d.iloc[20:20 + 96]
    gunluk = gunluk_tablo(js)
    s = deniz.guvenlik(d, hava, yon)
    guvenlik_ref.append({"ad": f"örnek veri: {ad}", "d": tablo_json(d[["wave_height"]]), "deniz_yonu": yon,
                         "hava": tablo_json(hava[["wind_gusts_10m", "visibility", "weather_code", "wind_direction_10m"]]),
                         "sonuc": guvenlik_json(s)})
    for esik, en_az in ((0, 2), (1, 2), (0, 1), (1, 6)):
        m = s.genel <= esik
        pencere_ref.append({"zaman": [saat(t) for t in m.index], "maske": [bool(x) for x in m], "en_az": en_az,
                            "sonuc": [[saat(a), saat(b)] for a, b in deniz.pencereler(m, en_az)]})
    g = deniz.balik_gostergesi(d, hava, gunluk)
    balik_ref.append({"ad": ad, "d": {"zaman": [saat(t) for t in d.index], "sutun": {}},
                      "hava": tablo_json(hava[["pressure_msl", "wind_speed_10m"]]), "gunluk": gunluk_json(gunluk),
                      "sonuc": guvenlik_json(g)})
# gün doğumu bilgisi olmayan gün ve tahminin başından önceki saatler
d_kisa = d.iloc[:30]
gunluk_eksik = gunluk.copy()
gunluk_eksik.iloc[1, gunluk_eksik.columns.get_loc("sunrise")] = pd.NaT
g = deniz.balik_gostergesi(d_kisa, hava.iloc[22:], gunluk_eksik.iloc[:2])
balik_ref.append({"ad": "eksik gün doğumu, kısa hava tablosu", "d": {"zaman": [saat(t) for t in d_kisa.index], "sutun": {}},
                  "hava": tablo_json(hava.iloc[22:][["pressure_msl", "wind_speed_10m"]]), "gunluk": gunluk_json(gunluk_eksik.iloc[:2]),
                  "sonuc": guvenlik_json(g)})

# deniz uyarıları: indirme adımları sabitlenir, uyarı üreten kısım olduğu gibi çalışır
asil = (deniz.kiyida_mi, deniz.en_yakin_deniz, deniz.deniz_verisi)
deniz.kiyida_mi = lambda lat, lon, km=25: True
deniz.en_yakin_deniz = lambda lat, lon: (lat, lon, 0.0, None)


def deniz_tablosu(dalga, seviye, bas="2026-11-14 22:00"):
    t = pd.date_range(bas, periods=len(dalga), freq="h")
    return pd.DataFrame({"wave_height": dalga, "sea_level_height_msl": seviye}, index=t)


n = 96
i = np.arange(n)
deniz_senaryolar = {
    "sakin deniz": deniz_tablosu(np.full(n, 0.4), 0.05 * np.sin(i / 2)),
    "dalgalı": deniz_tablosu(0.6 + 0.9 * np.exp(-((i - 30) / 6) ** 2), np.full(n, 0.0)),
    "çok dalgalı ve seviye oynuyor": deniz_tablosu(0.8 + 2.2 * np.exp(-((i - 50) / 8) ** 2), 0.25 * np.sin(i / 9)),
    "dalga dönemin dışında (3. gün)": deniz_tablosu(np.where(i > 60, 1.4, 0.3), np.full(n, 0.0)),
    "baştaki saatler eksik": deniz_tablosu(np.where(i < 5, np.nan, 0.5 + (i % 30 == 7) * 0.6), np.where(i % 4 == 0, np.nan, 0.3 * np.cos(i / 7))),
    "hiç veri yok": deniz_tablosu(np.full(n, np.nan), np.full(n, np.nan)),
    "seviye tam eşikte": deniz_tablosu(np.full(n, 0.2), np.where(i == 10, 0.4, 0.0)),
}
for ad, dt in deniz_senaryolar.items():
    for gun in (2, 3):
        deniz.deniz_verisi = lambda dlat, dlon, kd, g, dt=dt: dt.copy()
        deniz_uyari_ref.append({"ad": f"{ad}, {gun} gün", "d": tablo_json(dt), "gun": gun,
                                "uyarilar": [asdict(u) for u in deniz.uyarilar({"lat": 41.0, "lon": 38.8, "tz": "Europe/Istanbul"}, gun)]})
deniz.kiyida_mi, deniz.en_yakin_deniz, deniz.deniz_verisi = asil

# en yakın deniz: deniz API'si yerine "41,0° enleminin kuzeyi deniz" kuralı (TS testi aynı kuralı kullanır)
istekler = []


def sahte_deniz(url, params, **kw):
    lats, lons = [float(x) for x in str(params["latitude"]).split(",")], [float(x) for x in str(params["longitude"]).split(",")]
    istekler.append(len(lats))
    r = [{"hourly": {"time": ["2026-11-14T00:00"], "wave_height": [0.5 if kural(a, b) else None]}} for a, b in zip(lats, lons)]
    return r if len(r) > 1 else r[0]


asil_getir = deniz.getir
deniz.getir = sahte_deniz
yakin_ref = []
kurallar = {"kuzey": lambda a, b: a > 41.0, "hic": lambda a, b: False, "hep": lambda a, b: True,
            "dogu": lambda a, b: b > 30.0, "ada": lambda a, b: not (abs(a - 40.0) < 0.2 and abs(b - 29.0) < 0.2)}
for kural_adi, noktalar_ in {"kuzey": [(40.92, 38.39), (40.5, 38.0), (40.0, 38.0), (41.5, 38.0), (39.0, 35.0), (40.75, 37.1)],
                             "hic": [(39.92, 32.85)], "hep": [(42.5, 34.0)], "dogu": [(40.0, 29.7), (38.0, 28.9)],
                             "ada": [(40.0, 29.0)]}.items():
    kural = kurallar[kural_adi]
    for a, b in noktalar_:
        istekler.clear()
        r = deniz.en_yakin_deniz(a, b)
        yakin_ref.append({"kural": kural_adi, "lat": a, "lon": b, "istek_nokta_sayilari": list(istekler),
                          "sonuc": None if r is None else {"lat": float(r[0]), "lon": float(r[1]), "km": float(r[2]),
                                                           "yon": None if r[3] is None else float(r[3])}})
deniz.getir = asil_getir

yaz("deniz", {"ay": ay_ref, "guvenlik": guvenlik_ref, "pencereler": pencere_ref, "balik": balik_ref,
              "uyarilar": deniz_uyari_ref, "en_yakin": yakin_ref,
              "sabitler": {"DENIZ_SAATLIK": deniz.DENIZ_SAATLIK, "SEVIYE_AD": deniz.SEVIYE_AD, "SEVIYE_RENK": deniz.SEVIYE_RENK,
                           "SINODIK": deniz.SINODIK}}, sik=True)
print("  deniz uyarı türleri:", sorted({u["baslik"] for k in deniz_uyari_ref for u in k["uyarilar"]}),
      "· güvenlik seviyeleri:", sorted({int(x) for k in guvenlik_ref for x in k["sonuc"]["genel"]}),
      "· en yakın deniz sonuçları:", [None if k["sonuc"] is None else round(k["sonuc"]["km"]) for k in yakin_ref])


# ---------------------------------------------------------------- iklim (hava/iklim.py)
from hava import iklim  # noqa: E402

bugun = pd.Timestamp.now().normalize()
gecen_ay_sonu = (bugun.replace(day=1) - pd.Timedelta(days=1)).strftime("%Y-%m-%d")


def arsiv_js(lat, lon, bas="1991-01-01", bitis=gecen_ay_sonu):
    return ornek.yanit(iklim.ARSIV, {"latitude": lat, "longitude": lon, "start_date": bas, "end_date": bitis,
                                     "daily": iklim.GUNLUK, "timezone": "auto"})


def df_json(df):
    return {c: [sayi(v) for v in df[c]] for c in df.columns}


iklim_ref = []
delik = np.random.default_rng(7)
for ad, (lat, lon, tz, bas, eksik) in {"Ankara, tam arşiv": (39.9, 32.9, "Europe/Istanbul", "1991-01-01", False),
                                        "Tirebolu, eksik ölçümlü": (41.0, 38.8, "Europe/Istanbul", "1991-01-01", True),
                                        "Erzurum, 2005'ten başlayan kısa arşiv": (39.9, 41.3, "Europe/Istanbul", "2005-01-01", False)}.items():
    js = arsiv_js(lat, lon, bas)
    g = js["daily"]
    if eksik:                                    # rastgele ‰4 eksik + 2003'ün ilk yarısı hiç yok + bir ay yağışsız kayıt
        for c in ("temperature_2m_max", "temperature_2m_min", "precipitation_sum"):
            g[c] = [None if delik.random() < 0.004 else v for v in g[c]]
        g["temperature_2m_max"] = [None if t.startswith("2003-0") and t < "2003-07" else v for t, v in zip(g["time"], g["temperature_2m_max"])]
        g["precipitation_sum"] = [None if t.startswith("2010-08") else v for t, v in zip(g["time"], g["precipitation_sum"])]
    a = iklim._tablo(js)
    son = iklim._tablo(ornek.yanit(veri.FC, {"latitude": lat, "longitude": lon, "daily": iklim.GUNLUK, "past_days": 31,
                                              "forecast_days": 10, "timezone": tz}))
    nrm = iklim.normaller(a)
    tarihler = [pd.Timestamp(x) for x in ("2026-11-14", "2028-02-29", "2027-01-01", "2026-12-31", "2026-02-28")]
    y, egim, normal = iklim.yillik(a)
    ornek_sira = list(range(0, len(a), 97))
    iklim_ref.append({
        "ad": ad, "bas": bas, "gun_sayisi": len(a),
        "girdi": {"temperature_2m_max": g["temperature_2m_max"], "temperature_2m_min": g["temperature_2m_min"],
                  "precipitation_sum": g["precipitation_sum"]},
        "son": {"time": [t.strftime("%Y-%m-%d") for t in son.index], **{c: [sayi(v) for v in son[c]] for c in
                                                                         ("temperature_2m_max", "temperature_2m_min", "precipitation_sum")}},
        "ort_ornek": {"sira": ornek_sira, "deger": [sayi(a.temperature_2m_mean.iloc[i]) for i in ornek_sira]},
        "normaller": {"anahtar": list(nrm.index), **df_json(nrm)},
        "normal_al": {"tarihler": [t.strftime("%Y-%m-%d") for t in tarihler],
                      "max_ort": [sayi(v) for v in iklim.normal_al(nrm, tarihler).max_ort]},
        "ayni_gun": [{"tarih": t.strftime("%Y-%m-%d"), "pencere": pn,
                      "satirlar": [{k: sayi(v) for k, v in r.items()} for r in iklim.ayni_gun_gecmisi(a, t, pn).to_dict("records")]}
                     for t in tarihler for pn in (3, 0, 10)],
        "yillik": {"yil": [int(x) for x in y.index], "ort": [sayi(v) for v in y.ort], "sapma": [sayi(v) for v in y.sapma],
                   "egim": float(egim), "normal": float(normal)},
        "aylik_yagis": [{"yil": yl, "son_var": sv, **(lambda t: {"ay": [int(x) for x in t.index], **df_json(t)})(
                            iklim.aylik_yagis(a, son if sv else None, yl))}
                        # arşivde hiç günü olmayan bir yıl Python'da hata verir (boş serinin ay bilgisi yok); referansa alınmaz
                        for yl, sv in ((bugun.year, True), (bugun.year, False), (bugun.year - 1, True), (bugun.year - 1, False),
                                       (2010, True))],
    })
yaz("iklim", {"bugun": bugun.strftime("%Y-%m-%d"), "senaryolar": iklim_ref,
              "sabitler": {"ARSIV": iklim.ARSIV, "BASLANGIC": iklim.BASLANGIC, "NORMAL": list(iklim.NORMAL), "GUNLUK": iklim.GUNLUK}}, sik=True)


# ---------------------------------------------------------------- model sıralaması (hava/siralama.py)
from hava import siralama  # noqa: E402

ISTASYON = {"icao": "ORNK:40.128:32.995", "lat": 40.128, "lon": 32.995, "rakim": 953}
asil = (siralama._metar_indir, siralama.ornek_modu, siralama.getir, siralama.EN_UZUN)
siralama.EN_UZUN = 30                                   # referans dosyası küçük kalsın; hesap gün sayısından bağımsız
siralama.ornek_modu = lambda: True
siralama._metar_indir = lambda icao, bas, son, orn: ornek.metar_arsivi(icao, bas, son)
siralama.getir = lambda url, params, **kw: ornek.yanit(url, params)
sir_bas, sir_son = siralama._gunler(siralama.EN_UZUN)
csv = ornek.metar_arsivi(ISTASYON["icao"], sir_bas, sir_son)
# gerçek arşivdeki durumlar: ara rapor (:20), aynı saate iki rapor (:50 ve :00), saatten 15 dk uzak rapor, bozuk satır
ek = ["{0},{1:%Y-%m-%d} 05:20,50.00", "{0},{1:%Y-%m-%d} 06:00,41.00", "{0},{1:%Y-%m-%d} 07:15,39.20", "{0},{1:%Y-%m-%d} 07:16,10.00",
      "{0},{1:%Y-%m-%d} 08:44,10.00", "{0},{1:%Y-%m-%d} 08:45,33.35", "{0},{1:%Y-%m-%d} 23:50,35.15"]
csv += "\n".join(e.format(ISTASYON["icao"], sir_bas + pd.Timedelta(days=3)) for e in ek) + "\n"
siralama._metar_indir = lambda icao, bas, son, orn: csv
O = siralama.gozlemler(ISTASYON["icao"])
F_tum = siralama.tahminler(ISTASYON)
# arşiv kapsamı: bir model saatlerin %35'inde boş (sıralama dışı kalmalı), biri %8'inde boş (ortak örneklemi daraltır)
bosluk = np.random.default_rng(11)
for c in F_tum.columns:
    if c.endswith("_cma_grapes_global"):
        F_tum.loc[bosluk.random(len(F_tum)) < 0.35, c] = np.nan
    if c.endswith("_jma_seamless"):
        F_tum.loc[bosluk.random(len(F_tum)) < 0.08, c] = np.nan
siralama_ref = []
for ufuk_gun in siralama.UFUKLAR:
    F = siralama.ufuk(F_tum, ufuk_gun)
    for gun_sayisi in (7, 30):
        t, bilgi = siralama.siralama(F, O, gun_sayisi)
        D = bilgi["gun"]
        idx = np.random.default_rng(0).integers(0, D, (siralama.TEKRAR, D))     # siralama() içindeki çekilişin aynısı
        siralama_ref.append({"ufuk": ufuk_gun, "gun_sayisi": gun_sayisi, "bilgi": {k: sayi(v) if not isinstance(v, list) else v for k, v in bilgi.items()},
                             "ornekler": idx.tolist(),
                             "tablo": [{"kod": kod, **{k: sayi(v) for k, v in r.items()}} for kod, r in t.to_dict("index").items()]})
# ölçümle hiç örtüşmeyen tahmin: sıralama yapılamaz
F_bos = siralama.ufuk(F_tum, 1).copy()
F_bos.index = F_bos.index + pd.Timedelta(days=400)
t, bilgi = siralama.siralama(F_bos, O, 30)
bos_ref = {"tablo_yok": t is None, "bilgi": bilgi}
yaz("siralama", {"csv": csv, "gozlem": {"zaman": [saat(x) for x in O.index], "deger": [float(v) for v in O]},
                 "tahmin": tablo_json(F_tum), "sonuclar": siralama_ref, "bos": bos_ref,
                 "sabitler": {"IEM": siralama.IEM, "ONCEKI": siralama.ONCEKI, "MODELLER": siralama.MODELLER, "UFUKLAR": list(siralama.UFUKLAR),
                              "EN_UZUN": asil[3], "KAPSAM": siralama.KAPSAM, "TEKRAR": siralama.TEKRAR}}, sik=True)
print("  sıralama:", [(k["ufuk"], k["gun_sayisi"], k["bilgi"]["N"], k["bilgi"]["gun"], k["bilgi"]["disarida"], [r["grup"] for r in k["tablo"]]) for k in siralama_ref])
siralama._metar_indir, siralama.ornek_modu, siralama.getir, siralama.EN_UZUN = asil


# ================================================================= 5. AŞAMA: Uzman modun analiz paneli
# Bu hesaplar Streamlit'te sayfa betiklerinin içindedir (içe aktarılabilir işlev değil); aynı pandas ifadeleri
# buraya sayfa kodundan kopyalanmıştır: app_pages/meteogram.py, modeller.py, ansambl.py.
KARSILASTIRMA = {"ECMWF IFS (Avrupa, 9 km)": "ecmwf_ifs", "ECMWF AIFS (yapay zekâ)": "ecmwf_aifs025_single",
                 "GFS (ABD)": "gfs_seamless", "ICON (Almanya)": "icon_seamless",
                 "ARPEGE (Fransa)": "meteofrance_seamless", "UKMO (İngiltere)": "ukmo_seamless"}
KARS_DEG = {"Sıcaklık": ("temperature_2m", "°C", (2, 4)), "Birikimli yağış": ("precipitation", "mm", (5, 15)),
            "Rüzgâr": ("wind_speed_10m", "km/s", (8, 15)), "Basınç": ("pressure_msl", "hPa", (3, 6)),
            "Bulutluluk": ("cloud_cover", "%", (30, 60))}
analiz_ref = {"modeller": [], "ansambl": [], "yagis": [], "meteogram": [], "ara_deger": []}

# pandas interpolate(limit=6)
for dizi in ([1.0, None, None, 4.0], [None, None, 2.0, None, 5.0, None, None, None, None, None, None, None, None, 14.0, None, None],
             [3.0] + [None] * 9, [None] * 5, [1.0, 2.0, 3.0], [None, 7.0] + [None] * 3 + [11.0] + [None] * 8):
    analiz_ref["ara_deger"].append({"girdi": dizi, "sonuc": [sayi(v) for v in pd.Series(dizi, dtype=float).interpolate(limit=6)]})

for ad, (lat, lon, tz, rakim) in list(ORNEK_KONUMLAR.items())[:3]:
    # --- modeller.py
    for deg_ad, (var, birim, esik) in KARS_DEG.items():
        js = ornek.yanit(veri.FC, {"latitude": lat, "longitude": lon, "hourly": var, "models": ",".join(KARSILASTIRMA.values()),
                                   "forecast_days": 10, "timezone": tz})
        df = veri.tablo(js["hourly"]).iloc[30:]
        if ad == "Erzurum":                         # bir model hiç veri vermiyor, biri yarıda bitiyor, birinde boşluklar var
            df[f"{var}_ukmo_seamless"] = np.nan
            df.iloc[60:, df.columns.get_loc(f"{var}_meteofrance_seamless")] = np.nan
            df.iloc[10:30:2, df.columns.get_loc(f"{var}_gfs_seamless")] = np.nan
        seriler = {}
        for etiket, kod in KARSILASTIRMA.items():
            col = f"{var}_{kod}"
            if col not in df or df[col].isna().all():
                continue
            if var == "precipitation":
                seriler[etiket] = df[col].fillna(0).cumsum().where(df.index <= df[col].last_valid_index())
            else:
                seriler[etiket] = df[col].interpolate(limit=6)
        S = pd.DataFrame(seriler)
        fark = (S.max(axis=1) - S.min(axis=1)).where(S.notna().sum(axis=1) >= 3).dropna()
        asim = fark[fark > esik[0]]
        if asim.empty:
            durum, metin = "uyumlu", (f"Tüm dönem boyunca modeller arasındaki fark {esik[0]} {birim}'in altında. "
                                      "Bu tahmine güvenebilirsin.")
        else:
            saat_ = (asim.index[0] - fark.index[0]).total_seconds() / 3600
            en_buyuk = f"en büyük fark {fark.max():.1f} {birim} ({yorum.zaman(fark.idxmax())})"
            if saat_ < 1:
                metin = f"Modeller en baştan ayrışıyor: farklar şimdiden {esik[0]} {birim}'i aşıyor; {en_buyuk}."
            else:
                metin = (f"İlk **{saat_:.0f} saat** modeller uyumlu. {yorum.zaman(asim.index[0])} itibarıyla farklar "
                         f"{esik[0]} {birim}'i aşıyor; {en_buyuk}.")
            durum = "bozuluyor"
        analiz_ref["modeller"].append({"ad": f"{ad} · {deg_ad}", "degisken": var, "birim": birim, "esik": list(esik), "tablo": tablo_json(df),
                                       "seriler": {e: [sayi(v) for v in S[e]] for e in S.columns},
                                       "fark": {"zaman": [saat(t) for t in fark.index], "deger": [sayi(v) for v in fark]},
                                       "durum": durum, "metin": metin})
    # --- ansambl.py
    for var, birim in (("temperature_2m", "°C"), ("wind_speed_10m", "km/s")):
        ens = ornek.yanit(veri.ENS, {"latitude": lat, "longitude": lon, "hourly": var, "models": "ecmwf_ifs025", "forecast_days": 5, "timezone": tz})
        U = veri.tablo(ens["hourly"]).iloc[9:]
        U = U[[c for c in U.columns if c == var or c.startswith(var + "_member")]]
        bant = (U.quantile(0.9, axis=1) - U.quantile(0.1, axis=1)).resample("D").mean()
        ortanca = U.median(axis=1)
        analiz_ref["ansambl"].append({"ad": f"{ad} · {var}", "birim": birim, "uyeler": tablo_json(U),
                                      "p10": [sayi(v) for v in U.quantile(0.1, axis=1)], "p90": [sayi(v) for v in U.quantile(0.9, axis=1)],
                                      "ortanca": [sayi(v) for v in ortanca], "uye_sayisi": U.shape[1],
                                      "ortanca_araligi": f"{ortanca.min():.0f} – {ortanca.max():.0f} {birim}",
                                      "ilk_gun": f"± {bant.iloc[0] / 2:.1f} {birim}", "son_gun": f"± {bant.iloc[-1] / 2:.1f} {birim}",
                                      "kat": f"{bant.iloc[-1] / max(bant.iloc[0], 0.1):.1f} kat"})
    ens = ornek.yanit(veri.ENS, {"latitude": lat, "longitude": lon, "hourly": "precipitation", "models": "ecmwf_ifs025", "forecast_days": 5, "timezone": tz})
    U = veri.tablo(ens["hourly"]).iloc[9:]
    U = U[[c for c in U.columns if c == "precipitation" or c.startswith("precipitation_member")]].copy()
    if ad == "Tirebolu":                            # iki üyenin son günü hiç yok, birinin tamamı yok
        U.iloc[-30:, 3:5] = np.nan
        U.iloc[:, 7] = np.nan
    for esik in (1, 5, 10, 20):
        gunluk = U.resample("D").sum(min_count=1).dropna(how="all")
        olas = (gunluk >= esik).where(gunluk.notna()).mean(axis=1) * 100
        en = olas.idxmax()
        analiz_ref["yagis"].append({"ad": f"{ad} · {esik} mm", "esik": esik, "uyeler": tablo_json(U) if esik == 1 else None, "konum": ad,
                                    "gun": [t.strftime("%Y-%m-%d") for t in olas.index], "olasilik": [sayi(v) for v in olas],
                                    "ortanca": [sayi(v) for v in gunluk.median(axis=1)], "en_cok": [sayi(v) for v in gunluk.max(axis=1)],
                                    "metin": (f"En olası yağışlı gün **{yorum.gun(en)}**: üyelerin %{olas.max():.0f}'i {esik} mm üstü yağış veriyor. "
                                              f"O gün ortanca tahmin {gunluk.loc[en].median():.1f} mm, en ıslak senaryo "
                                              f"{gunluk.loc[en].max():.0f} mm.")})
    # --- meteogram.py: model seçimi ve özet kartları
    js, saatlik = ornek_tahmin(lat, lon, tz)
    df = saatlik.iloc[30:30 + 120]
    kod = "icon_seamless"
    mjs = ornek.yanit(veri.FC, {"latitude": lat, "longitude": lon, "hourly": veri.SAATLIK, "models": kod, "forecast_days": 10, "timezone": tz})
    mham = veri.tablo(mjs["hourly"]).iloc[28:100]                         # ortak tahminden önce başlar, erken biter
    mham = mham.drop(columns=[c for c in mham.columns if c.startswith("precipitation_probability")])   # model bunu vermiyor
    mham[[c for c in mham.columns if c.startswith("uv_index")]] = np.nan                               # bu da tümüyle boş
    mdf = mham.rename(columns=lambda c: c.removesuffix(f"_{kod}")).reindex(df.index)
    eksik = [c for c in df.columns if c not in mdf or mdf[c].isna().all()]
    mdf[eksik] = df[eksik]
    mdf = mdf[df.columns]
    dp = mdf.pressure_msl.iloc[-1] - mdf.pressure_msl.iloc[0]
    analiz_ref["meteogram"].append({"ad": ad, "kod": kod, "ortak": tablo_json(df), "model": tablo_json(mham), "birlesik": tablo_json(mdf),
                                    "ozet": {"enYuksek": f"{mdf.temperature_2m.max():.0f}°", "enDusuk": f"{mdf.temperature_2m.min():.0f}°",
                                             "toplamYagis": f"{mdf.precipitation.sum():.1f} mm", "toplamKar": f"{mdf.snowfall.sum():.1f} cm",
                                             "enKuvvetliHamle": f"{mdf.wind_gusts_10m.max():.0f} km/s", "basincDegisimi": f"{dp:+.0f} hPa"}})
yaz("analiz", analiz_ref, sik=True)
print("  model uyumu:", sorted({k["durum"] for k in analiz_ref["modeller"]}), "· model sayıları:", sorted({len(k["seriler"]) for k in analiz_ref["modeller"]}))

# ---------------------------------------------------------------- harita katmanları (hava/harita.py → KATMANLAR)
from hava import harita  # noqa: E402

HARITA_KODLARI = {"Sıcaklık + basınç": "sicaklik", "Yağış + basınç": "yagis", "Rüzgâr hamleleri": "hamle", "Bulutluluk": "bulut",
                  "850 hPa sıcaklık (~1,5 km)": "t850", "500 hPa yükseklik (~5,5 km)": "z500"}
yaz("harita_katmanlari", [{"kod": kod, "ad": ad, "degisken": harita.KATMANLAR[ad]["var"], "birim": harita.KATMANLAR[ad]["birim"],
                           "izo": harita.KATMANLAR[ad].get("izo"), "aralik": harita.KATMANLAR[ad].get("aralik"),
                           "izo_ad": harita.KATMANLAR[ad].get("izo_ad"), "ruzgar": bool(harita.KATMANLAR[ad].get("ruzgar")),
                           "bak": harita.KATMANLAR[ad]["bak"]} for ad, kod in HARITA_KODLARI.items()])

# ---------------------------------------------------------------- atmosfer profili (hava/skewt.py → profil, skewt_fig; MetPy)
import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import metpy.calc as mpcalc  # noqa: E402
from metpy.units import units  # noqa: E402

from hava import skewt  # noqa: E402


def profil_satiri(ps, t2, td2, sicaklik, nem, hiz10=10.0, yon10=200.0, hiz=None, yon=None):
    """Bir saatlik tahmin satırı: yer değerleri ve 10 basınç seviyesinin sıcaklık (°C), bağıl nem (%), rüzgârı."""
    d = {"surface_pressure": ps, "temperature_2m": t2, "dew_point_2m": td2, "wind_speed_10m": hiz10, "wind_direction_10m": yon10}
    for i, p in enumerate(veri.SEVIYELER):
        d[f"temperature_{p}hPa"] = float(sicaklik[i])
        d[f"relative_humidity_{p}hPa"] = float(nem[i])
        d[f"wind_speed_{p}hPa"] = float(hiz[i]) if hiz is not None else 15.0 + 9.0 * i
        d[f"wind_direction_{p}hPa"] = float(yon[i]) if yon is not None else (210.0 + 12.0 * i) % 360
    return pd.Series(d)


# seviyeler: 1000, 925, 850, 700, 600, 500, 400, 300, 250, 200 hPa
PROFILLER = {
    "kararli_kis": profil_satiri(1016.4, 4.2, 1.1, [5.0, 3.5, 1.0, -6.0, -13.0, -22.0, -34.0, -49.0, -56.0, -58.0], [80, 75, 60, 40, 35, 30, 30, 25, 20, 10]),
    "zayif_kararsiz": profil_satiri(1009.8, 22.0, 13.5, [21.0, 15.5, 10.0, 0.5, -7.5, -17.5, -30.0, -46.0, -55.0, -60.0], [60, 65, 70, 55, 45, 35, 30, 30, 25, 15]),
    "guclu_kararsiz": profil_satiri(1004.2, 31.5, 22.5, [30.0, 24.0, 18.5, 7.0, -2.5, -13.5, -27.5, -44.0, -53.5, -62.0], [62, 60, 55, 40, 35, 30, 30, 35, 30, 20]),
    "kapakli": profil_satiri(1007.0, 29.0, 20.5, [27.5, 23.0, 21.5, 9.0, -1.0, -12.5, -26.5, -43.0, -53.0, -61.5], [65, 70, 30, 25, 30, 30, 30, 30, 25, 15]),
    "dag": profil_satiri(842.3, 12.0, 4.5, [20.0, 16.0, 13.0, 3.0, -5.0, -15.5, -28.5, -45.0, -54.0, -60.0], [50, 50, 55, 60, 50, 40, 35, 30, 25, 15]),
    "doymus": profil_satiri(1001.3, 14.0, 14.0, [13.6, 10.2, 6.5, -1.5, -8.5, -17.0, -29.0, -45.0, -54.5, -60.0], [100, 100, 100, 100, 98, 95, 90, 70, 50, 30]),
    "soguk": profil_satiri(1024.9, -8.5, -11.0, [-7.0, -9.5, -12.0, -18.0, -25.0, -33.0, -44.0, -57.0, -62.0, -60.0], [85, 80, 70, 50, 40, 35, 30, 25, 15, 5]),
    "seviyeye_yakin": profil_satiri(925.6, 16.0, 9.0, [22.0, 15.8, 11.0, 1.0, -7.0, -17.0, -30.0, -46.0, -55.0, -61.0], [50, 62, 65, 55, 45, 35, 30, 30, 25, 15]),
    "kuru_sicak": profil_satiri(1002.0, 40.5, -4.0, [39.0, 32.5, 26.0, 11.0, 1.0, -10.5, -24.5, -41.0, -51.0, -60.0], [6, 7, 8, 12, 15, 20, 25, 25, 20, 10]),
    "sicak_burun": profil_satiri(1012.0, -1.5, -2.5, [-1.0, 2.5, 1.0, -5.0, -12.0, -21.0, -33.0, -48.0, -56.0, -59.0], [95, 90, 85, 70, 55, 40, 30, 25, 20, 10]),
    "nem_sinir_disi": profil_satiri(1010.0, 18.0, 12.0, [17.0, 12.0, 7.0, -2.0, -10.0, -20.0, -32.0, -47.0, -56.0, -61.0], [105, 0.2, 0, 50, 45, 35, 30, 30, 25, 15]),
}
_rs = np.random.default_rng(20261115)
_z = np.array([110, 760, 1460, 3010, 4200, 5570, 7180, 9160, 10360, 11780.0])     # seviyelerin yaklaşık yüksekliği (m)
for _i in range(9):
    _ps = float(_rs.uniform(880, 1030))
    _t2 = float(_rs.uniform(-5, 36))
    _oran = _rs.uniform(5.2, 8.6)                                                  # K/km
    _yer = 44330.8 * (1 - (_ps / 1013.25) ** 0.190263)
    _T = _t2 - _oran * (_z - _yer) / 1000 + _rs.normal(0, 0.8, 10)
    _T[-2:] = np.maximum(_T[-2:], -64) + [0.0, 3.0]                                # tropopoz üstü hafif ısınma
    PROFILLER[f"rastgele_{_i + 1}"] = profil_satiri(round(_ps, 1), round(_t2, 1), round(_t2 - float(_rs.uniform(0.5, 18)), 1), np.round(_T, 1),
                                                    np.round(_rs.uniform(8, 100, 10), 0), round(float(_rs.uniform(0, 45)), 1), round(float(_rs.uniform(0, 360)), 0),
                                                    np.round(_rs.uniform(5, 160, 10), 1), np.round(_rs.uniform(0, 360, 10), 0))

profil_ref = []
for ad, satir in PROFILLER.items():
    p, T, Td, u, v = skewt.profil(satir)
    prof = mpcalc.parcel_profile(p, T[0], Td[0]).to("degC")
    lcl_p, lcl_t = mpcalc.lcl(p[0], T[0], Td[0])
    fig, s = skewt.skewt_fig(p, T, Td, u, v, ad)                                  # sayfadaki özet sayılar buradan gelir
    plt.close(fig)
    yukseklik = lambda hpa: float(mpcalc.pressure_to_height_std(hpa * units.hPa).m_as("m"))
    profil_ref.append({
        "ad": ad, "satir": {k: sayi(float(x)) for k, x in satir.items()},
        "p": [sayi(x) for x in p.m], "T": [sayi(x) for x in T.m], "Td": [sayi(x) for x in Td.m],
        "u": [sayi(x) for x in u.m], "v": [sayi(x) for x in v.m],
        "parsel": [sayi(x) for x in prof.m], "lcl_p": sayi(float(lcl_p.m)), "lcl_t": sayi(float(lcl_t.m_as("degC"))),
        "cape": sayi(float(s["cape"])), "cin": sayi(float(s["cin"])), "pw": sayi(float(s["pw"])), "donma": sayi(s["donma"]),
        # app_pages/profil.py: bulut tabanının yerden yüksekliği ve donma seviyesinin deniz seviyesinden yüksekliği
        "lcl_m": sayi(yukseklik(s["lcl"]) - yukseklik(float(p[0].m))), "donma_m": sayi(yukseklik(s["donma"])) if s["donma"] is not None else None,
    })
yaz("profil", profil_ref)
print("  CAPE:", [round(k["cape"]) for k in profil_ref], "\n  CIN:", [round(k["cin"]) for k in profil_ref],
      "\n  seviye sayıları:", sorted({len(k["p"]) for k in profil_ref}), "· donma yok:", sum(k["donma"] is None for k in profil_ref))
