"""Örnek veri modu: Open-Meteo'ya hiç istek atmadan, her uç noktanın yanıt biçiminde sentetik veri üretir.
Geliştirirken, internet yokken ya da istek sınırı dolduğunda uygulamanın her sayfasını denemek için.

Senaryo öğretici olsun diye kuruldu ve gerçek hava DEĞİLDİR: batıdan doğuya 5 günde geçen bir alçak basınç
merkezi. Önünde güneyli ılık hava ve yağış, merkez yakınında kuvvetli rüzgâr, arkasında soğuk kuzeyli hava, don
ve sakin sabahlarda sis. Tüm değişkenler aynı alanlardan türetildiği için birbiriyle tutarlıdır; aynı istek her
zaman aynı yanıtı verir."""
import hashlib
import re

import numpy as np
import pandas as pd

from hava.yerler import mesafe_km, nokta_konumu, yerlesimler

SEVIYELER = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200]
ANS_UYE = {"ecmwf_ifs025": 50, "ecmwf_aifs025": 50, "gfs_seamless": 30, "icon_seamless": 39}
MODEL_SURE = {"ukmo_seamless": 7, "meteofrance_seamless": 4, "icon_seamless": 7}   # gün; ötesi boş


def _rng(*anahtar):
    return np.random.default_rng(int(hashlib.sha1(repr(anahtar).encode()).hexdigest()[:12], 16))


def _liste(x):
    return [float(v) for v in str(x).split(",")]


# ----------------------------------------------------------------- senaryo alanları
def _merkez(gun):
    """Alçak basınç merkezinin konumu (boylam, enlem); gun: senaryo başlangıcından geçen gün."""
    return 18 + 7 * gun, 43.5 - 0.6 * gun


def _basinc(lat, lon, gun):
    clon, clat = _merkez(gun)
    d2 = ((lon - clon) * np.cos(np.radians(lat))) ** 2 + (lat - clat) ** 2
    derinlik = 16 + 4 * np.sin(np.pi * np.clip(gun / 5, 0, 1))         # ortada derinleşir
    return 1021 - derinlik * np.exp(-d2 / (2 * 4.5 ** 2)) + 0.35 * (lat - 40)


def _rakim(lat, lon):
    """Noktaya 30 km'den yakın bir yerleşimin rakımı; yoksa kıyı/ova varsayımıyla 100 m."""
    y = yerlesimler()
    adaylar = [v for v in y.values() if abs(v["enlem"] - lat) < 0.4 and abs(v["boylam"] - lon) < 0.5]
    if adaylar:
        en = min(adaylar, key=lambda v: mesafe_km(lat, lon, v["enlem"], v["boylam"]))
        if mesafe_km(lat, lon, en["enlem"], en["boylam"]) < 30 and en["rakim"] is not None:
            return float(en["rakim"])
    return 100.0


def _kara(lat, lon):
    from hava.harita import kara_maskesi
    return bool(kara_maskesi(np.array([lat]), np.array([lon]))[0, 0])


def nokta(lat, lon, zaman, bas, rakim=None):
    """Bir nokta için saatlik temel alanlar (sözlük: değişken → dizi)."""
    rakim = _rakim(lat, lon) if rakim is None else rakim
    gun = (zaman - bas).total_seconds().to_numpy() / 86400
    saat = zaman.hour.to_numpy() + zaman.minute.to_numpy() / 60
    r = _rng("nokta", round(lat, 2), round(lon, 2))
    gurultu = lambda s: np.convolve(r.normal(0, s, len(gun) + 6), np.ones(7) / 7, "valid")

    p = _basinc(lat, lon, gun)
    e = 0.05                                                         # gradyan için adım (derece)
    dpx = (_basinc(lat, lon + e, gun) - _basinc(lat, lon - e, gun)) / (2 * e * np.cos(np.radians(lat)))
    dpy = (_basinc(lat + e, lon, gun) - _basinc(lat - e, lon, gun)) / (2 * e)
    u, v = -dpy * 9, dpx * 9                                         # jeostrofik yaklaşım: alçak basınç solda kalır
    hiz = np.clip(np.hypot(u, v) * 1.0 + 6 + gurultu(1.5), 1, None)
    yon = (np.degrees(np.arctan2(-u, -v)) + 360) % 360               # rüzgârın geldiği yön
    hamle = hiz * (1.45 + 0.25 * np.clip(hiz / 40, 0, 1))

    clon, clat = _merkez(gun)
    arkada = np.clip((clon - 1 - lon) / 4, 0, 1)                     # cephe geçti mi (0 önünde, 1 arkasında)
    denizde = not _kara(lat, lon)
    gunluk = (3.0 if denizde else 5.5) * np.sin(2 * np.pi * (saat - 9) / 24)    # deniz gün içinde az ısınır
    taban = 21 - 0.75 * (lat - 34) - 6.5 * rakim / 1000                       # kasım ortalamasına yakın
    T = taban + gunluk + 3 * (1 - arkada) * np.exp(-((lon - clon - 3) / 5) ** 2) - 7 * arkada + gurultu(0.4)

    # yağış: merkezin güneydoğusundaki sıcak sektör ve cephe boyunca
    dc = np.hypot((lon - clon - 2.5) * np.cos(np.radians(lat)), lat - clat + 1.5)
    yagis = np.clip(4.2 * np.exp(-(dc / 2.6) ** 2) + gurultu(0.25) - 0.15, 0, None)
    yagis = np.round(np.where(yagis < 0.1, 0, yagis), 1)
    olas = np.clip(100 * (1 - np.exp(-yagis * 2.5)) + 25 * np.exp(-(dc / 4) ** 2), 0, 100).round()

    bulut = np.clip(100 * np.exp(-(dc / 4.5) ** 2) + 20 + gurultu(8), 0, 100)
    sis = (arkada > 0.9) & (hiz < 9) & (saat >= 4) & (saat <= 8) & (gun > 3)
    Td = T - np.clip(7 - 6 * np.exp(-(dc / 3) ** 2), 0.4, None) + gurultu(0.3)
    Td = np.where(sis, T - 0.3, Td)
    Td = np.minimum(Td, T)
    nem = np.clip(100 * np.exp(17.62 * Td / (243.12 + Td) - 17.62 * T / (243.12 + T)), 5, 100)
    kar = np.where(T < 1, np.round(yagis * 0.7, 1), 0)
    gunduz = ((saat >= 7) & (saat < 17.5)).astype(int)
    cape = np.clip(900 * (1 - arkada) * np.exp(-(dc / 2.2) ** 2) * np.clip(np.sin(np.pi * (saat - 9) / 10), 0, 1)
                   + gurultu(20), 0, None)
    kod = np.select(
        [cape > 600, (kar > 0.5), (kar > 0), yagis >= 2.5, yagis >= 0.5, yagis > 0, sis, bulut > 85, bulut > 50,
         bulut > 20], [95, 73, 71, 63, 61, 51, 45, 3, 2, 1], 0)
    return {
        "temperature_2m": T, "dew_point_2m": Td, "apparent_temperature": T - 0.12 * hiz + 0.03 * (nem - 50),
        "relative_humidity_2m": nem, "precipitation": yagis, "precipitation_probability": olas, "snowfall": kar,
        "rain": yagis - kar, "weather_code": kod, "is_day": gunduz, "cloud_cover": bulut,
        "cloud_cover_low": np.clip(bulut * 0.8 + 15 * sis, 0, 100), "cloud_cover_mid": np.clip(bulut * 0.6, 0, 100),
        "cloud_cover_high": np.clip(bulut * 0.5 + 25 * np.exp(-((lon - clon - 6) / 4) ** 2), 0, 100),
        "pressure_msl": p, "surface_pressure": p * np.exp(-rakim / 8400), "wind_speed_10m": hiz,
        "wind_direction_10m": yon, "wind_gusts_10m": hamle,
        "freezing_level_height": np.clip(rakim + T / 0.0065, 0, None),
        "visibility": np.where(sis, 350.0, np.where(yagis > 0, 8000.0, 30000.0)),
        "uv_index": np.clip(3.2 * np.sin(np.pi * (saat - 7) / 10.5) * (1 - bulut / 140), 0, None),
        "cape": cape, "_rakim": rakim, "_dc": dc, "_hiz": hiz, "_yon": yon,
    }


def _seviye_degiskeni(ad, a):
    """temperature_850hPa gibi basınç seviyesi değişkenleri; yüzeyden standart atmosferle türetilir."""
    m = re.fullmatch(r"(\w+?)_(\d+)hPa", ad)
    if not m:
        return None
    tur, p = m.group(1), int(m.group(2))
    h = 44330 * (1 - (p / 1013.25) ** 0.1903)
    dz = np.clip(h - a["_rakim"], 0, None)
    if tur == "temperature":
        return a["temperature_2m"] - 6.5 * dz / 1000 - 1.5 * np.exp(-dz / 300)
    if tur == "relative_humidity":
        return np.clip(35 + 55 * np.exp(-(a["_dc"] / 3) ** 2) * np.exp(-dz / 6000), 5, 100)
    if tur == "wind_speed":
        return a["_hiz"] + dz / 120
    if tur == "wind_direction":
        return (a["_yon"] + dz / 400) % 360
    if tur == "geopotential_height":
        return h + (a["pressure_msl"] - 1013) * 8.5 + 30 * (a["temperature_2m"] - 10)
    return None


def _deger(ad, a):
    if ad in a:
        return a[ad]
    return _seviye_degiskeni(ad, a)


def _temiz(x, n=2):
    x = np.asarray(x, dtype=float)
    return [None if not np.isfinite(v) else round(float(v), n) for v in x]


def _zaman(params, lat, lon):
    tz = params.get("timezone") or "GMT"
    if tz == "auto":
        tz = nokta_konumu(lat, lon)["tz"]
    if tz in ("GMT", "UTC"):
        tz = "UTC"
    simdi = pd.Timestamp.now(tz=tz).tz_localize(None)
    bugun = simdi.normalize()
    if "start_date" in params:
        zaman = pd.date_range(params["start_date"], pd.Timestamp(params["end_date"]) + pd.Timedelta(hours=23), freq="h")
    else:
        gecmis, ileri = int(params.get("past_days", 0)), int(params.get("forecast_days", 7))
        zaman = pd.date_range(bugun - pd.Timedelta(days=gecmis), periods=24 * (gecmis + ileri), freq="h")
    # senaryo dünden başlar: alçak basınç bugün Ege'de, yarın İç Anadolu'da olur
    return zaman, bugun - pd.Timedelta(days=1), simdi, tz


def _ust(lat, lon, tz, rakim):
    ofset = int(pd.Timestamp.now(tz=tz).utcoffset().total_seconds())
    return {"latitude": lat, "longitude": lon, "elevation": rakim, "timezone": tz, "utc_offset_seconds": ofset,
            "generationtime_ms": 0.0, "ornek_veri": True}


# ----------------------------------------------------------------- uç noktalar
def _tahmin(params, lat, lon):
    zaman, bas, simdi, tz = _zaman(params, lat, lon)
    a = nokta(lat, lon, zaman, bas)
    js = _ust(lat, lon, tz, a["_rakim"])
    modeller = [m for m in str(params.get("models", "")).split(",") if m]
    if params.get("hourly"):
        h = {"time": [t.strftime("%Y-%m-%dT%H:%M") for t in zaman]}
        for ad in str(params["hourly"]).split(","):
            temel = _deger(ad, a)
            if temel is None:
                continue
            if len(modeller) > 1:
                for i, m in enumerate(modeller):
                    r = _rng("model", m, ad, round(lat, 2), round(lon, 2))
                    # modeller ilk saatlerde neredeyse aynı, günler geçtikçe ayrışır (rastgele yürüyüş × büyüyen ağırlık)
                    olcek = {"temperature_2m": 1.0, "wind_speed_10m": 3.0, "pressure_msl": 1.6, "cloud_cover": 12}
                    agirlik = np.linspace(0, 1, len(zaman)) ** 0.8
                    deger = temel + np.cumsum(r.normal(0, 0.15, len(zaman))) * agirlik * olcek.get(ad, 1.0)
                    if ad == "precipitation":
                        deger = np.clip(temel * r.uniform(0.6, 1.4) + r.normal(0, 0.1, len(zaman)), 0, None)
                    gun = MODEL_SURE.get(m)
                    if gun:
                        deger = np.where(np.arange(len(zaman)) < gun * 24, deger, np.nan)
                    h[f"{ad}_{m}"] = _temiz(deger)
            else:
                h[ad] = _temiz(temel)
        js["hourly"] = h
    if params.get("current"):
        i = int(np.argmin(np.abs((zaman - simdi).total_seconds())))
        js["current"] = {"time": simdi.floor("15min").strftime("%Y-%m-%dT%H:%M"), "interval": 900}
        for ad in str(params["current"]).split(","):
            deger = _deger(ad, a)
            if deger is not None:
                js["current"][ad] = _temiz([deger[i]])[0]
    if params.get("daily"):
        df = pd.DataFrame({k: v for k, v in a.items() if not k.startswith("_")}, index=zaman)
        g = df.resample("D")
        gunler = g.size().index
        d = {"time": [t.strftime("%Y-%m-%d") for t in gunler]}
        hesap = {
            "weather_code": g.weather_code.max(), "temperature_2m_max": g.temperature_2m.max(),
            "temperature_2m_min": g.temperature_2m.min(), "precipitation_sum": g.precipitation.sum(),
            "precipitation_probability_max": g.precipitation_probability.max(), "snowfall_sum": g.snowfall.sum(),
            "wind_gusts_10m_max": g.wind_gusts_10m.max(), "uv_index_max": g.uv_index.max(),
            "temperature_2m_mean": g.temperature_2m.mean(),
            "wind_direction_10m_dominant": g.wind_direction_10m.median(),
            "sunrise": pd.Series([(t + pd.Timedelta(hours=7, minutes=10 + i)).strftime("%Y-%m-%dT%H:%M")
                                  for i, t in enumerate(gunler)], index=gunler),
            "sunset": pd.Series([(t + pd.Timedelta(hours=17, minutes=45 - i)).strftime("%Y-%m-%dT%H:%M")
                                 for i, t in enumerate(gunler)], index=gunler),
        }
        for ad in str(params["daily"]).split(","):
            if ad in hesap:
                s = hesap[ad]
                d[ad] = list(s.values) if ad in ("sunrise", "sunset") else _temiz(s.values)
        js["daily"] = d
    return js


def _ansambl(params, lat, lon):
    zaman, bas, _, tz = _zaman(params, lat, lon)
    a = nokta(lat, lon, zaman, bas)
    ad, model = str(params["hourly"]), str(params.get("models", "ecmwf_ifs025"))
    temel = np.asarray(_deger(ad, a), dtype=float)
    yayilim = np.linspace(0.2, 1, len(zaman)) ** 1.5
    h = {"time": [t.strftime("%Y-%m-%dT%H:%M") for t in zaman]}
    for k in range(ANS_UYE.get(model, 30) + 1):
        r = _rng("ans", model, ad, k, round(lat, 2), round(lon, 2))
        if ad == "precipitation":
            kayma = int(r.integers(-6, 7))
            deger = np.clip(np.roll(temel, kayma) * r.lognormal(0, 0.45) + r.normal(0, 0.05, len(zaman)), 0, None)
        else:
            olcek = 4.5 if ad == "temperature_2m" else 9
            deger = temel + np.cumsum(r.normal(0, 0.12, len(zaman))) * yayilim * olcek / 4
        h[ad if k == 0 else f"{ad}_member{k:02d}"] = _temiz(deger)
    return _ust(lat, lon, tz, a["_rakim"]) | {"hourly": h}


def _onceki(params, lat, lon):
    zaman, bas, _, tz = _zaman(params, lat, lon)
    a = nokta(lat, lon, zaman, bas)
    h = {"time": [t.strftime("%Y-%m-%dT%H:%M") for t in zaman]}
    # çok modelli istekte sütun adları "<değişken>_<model>"; her model kendi isabeti ve sapmasıyla üretilir
    modeller = str(params["models"]).split(",") if params.get("models") else [""]
    for ad in str(params["hourly"]).split(","):
        m = re.fullmatch(r"(\w+)_previous_day(\d)", ad)
        temel = np.asarray(_deger(m.group(1) if m else ad, a), dtype=float)
        for model in modeller:
            anahtar = f"{ad}_{model}" if model else ad
            if m:
                g = int(m.group(2))
                r = _rng("onceki", anahtar, round(lat, 2), round(lon, 2))
                rm = _rng("model", model)
                kalite, sapma = (rm.uniform(0.7, 1.6), rm.normal(0, 0.5)) if model else (1.0, 0.0)
                olcek = {"temperature_2m": 0.55, "wind_speed_10m": 2.2, "pressure_msl": 0.9, "precipitation": 0.4}
                s = olcek.get(m.group(1), 0.5) * (0.6 + 0.55 * g) * kalite
                deger = temel + np.convolve(r.normal(0, s, len(zaman) + 11), np.ones(12) / 12 * 2.2, "valid") \
                    + 0.1 * g + sapma
                if m.group(1) == "precipitation":
                    deger = np.clip(np.roll(temel, int(r.integers(-g * 2, g * 2 + 1))) * r.lognormal(0, 0.12 * g),
                                    0, None)
            else:
                deger = temel
            h[anahtar] = _temiz(deger)
    return _ust(lat, lon, tz, a["_rakim"]) | {"hourly": h}


def _deniz(params, lat, lon):
    zaman, bas, _, tz = _zaman(params, lat, lon)
    js = _ust(lat, lon, tz, 0)
    bos = [None] * len(zaman)
    h = {"time": [t.strftime("%Y-%m-%dT%H:%M") for t in zaman]}
    adlar = str(params["hourly"]).split(",")
    if _kara(lat, lon):                                              # karada deniz verisi yoktur (gerçekteki gibi)
        return js | {"hourly": h | {ad: bos for ad in adlar}}
    a = nokta(lat, lon, zaman, bas, rakim=0)
    hiz = a["_hiz"]
    hs = np.convolve(0.12 + 0.0011 * hiz ** 2, np.ones(4) / 4, "same")   # rüzgâra birkaç saat gecikmeli tepki
    saat = (zaman - bas).total_seconds().to_numpy() / 3600
    deger = {
        "wave_height": hs, "wave_period": 2.8 + 2.2 * np.sqrt(hs * 3), "wave_direction": a["_yon"],
        "wind_wave_height": hs * 0.82, "wind_wave_period": 2.5 + 2 * np.sqrt(hs * 2.5),
        "swell_wave_height": np.roll(hs, 8) * 0.45, "swell_wave_period": 5 + 2 * np.sqrt(hs),
        "swell_wave_direction": (np.roll(a["_yon"], 8) + 15) % 360,
        "sea_surface_temperature": 19.5 - 0.45 * (lat - 36) - 0.004 * saat,
        "ocean_current_velocity": 0.4 + 0.012 * hiz, "ocean_current_direction": (a["_yon"] + 200) % 360,
        "sea_level_height_msl": 0.04 * np.sin(2 * np.pi * saat / 12.42) + 0.25 * np.clip((1013 - a["pressure_msl"]) / 15, 0, 1),
    }
    return js | {"hourly": h | {ad: _temiz(deger[ad]) if ad in deger else bos for ad in adlar}}


def _arsiv(params, lat, lon):
    """1991'den bu yana günlük iklim: mevsim döngüsü + yıllar arası değişkenlik + ~0,4 °C/10 yıl ısınma."""
    gunler = pd.date_range(params["start_date"], params["end_date"], freq="D")
    rakim = _rakim(lat, lon)
    r = _rng("arsiv", round(lat, 1), round(lon, 1))
    yil = gunler.year.to_numpy() + gunler.dayofyear.to_numpy() / 365
    doy = gunler.dayofyear.to_numpy()
    denizel = 0.6 if any(abs(v["enlem"] - lat) < 0.3 and abs(v["boylam"] - lon) < 0.3 and v["rakim"] is not None
                         and v["rakim"] < 60 for v in yerlesimler().values()) else 1.0
    ort = 20.5 - 0.75 * (lat - 34) - 6.5 * rakim / 1000 + 9.5 * denizel * np.sin(2 * np.pi * (doy - 110) / 365)
    oynama = np.convolve(r.normal(0, 1.6, len(gunler) + 9), np.ones(10) / 10 * 2.4, "valid")    # günler arası
    yillar = {y: r.normal(0, 0.45) for y in range(1940, 2040)}                                   # yıldan yıla
    ort = ort + oynama + np.array([yillar[y] for y in gunler.year]) + 0.04 * (yil - 1991)
    yarim = (4.5 + 2 * (1 - denizel)) * (1 + 0.2 * np.sin(2 * np.pi * (doy - 110) / 365))
    kis = 0.5 + 0.5 * np.cos(2 * np.pi * (doy - 15) / 365)                                       # kışın yağışlı
    yagis = np.where(r.random(len(gunler)) < 0.18 + 0.22 * kis, r.gamma(0.9, 6 + 6 * kis), 0)
    return _ust(lat, lon, "Europe/Istanbul", rakim) | {"daily": {
        "time": [t.strftime("%Y-%m-%d") for t in gunler], "temperature_2m_max": _temiz(ort + yarim, 1),
        "temperature_2m_min": _temiz(ort - yarim, 1), "precipitation_sum": _temiz(yagis, 1)}}


def _ara(params):
    ad = str(params.get("name", "")).strip().lower()
    y = [v for v in yerlesimler().values() if ad and v["ad"].lower().startswith(ad)][: int(params.get("count", 6))]
    return {"results": [{"name": v["ad"], "latitude": v["enlem"], "longitude": v["boylam"], "elevation": v["rakim"],
                         "timezone": v["saat_dilimi"], "admin1": v["etiket"].split(", ")[1] if ", " in v["etiket"] else None,
                         "country": "Türkiye" if v["turkiye"] else None} for v in y]}


def _istasyon(params):
    """Kutunun ortasının yakınına tek bir sentetik havalimanı istasyonu koyar. Kimliği koordinatını taşır
    ("ORNK:enlem:boylam"), böylece METAR üreticisi istasyonun yerini bilir."""
    la0, lo0, la1, lo1 = _liste(params["bbox"])
    lat, lon = round((la0 + la1) / 2 + 0.08, 3), round((lo0 + lo1) / 2 - 0.12, 3)
    return [{"icaoId": f"ORNK:{lat}:{lon}", "site": "Örnek Havalimanı", "lat": lat, "lon": lon,
             "elev": int(_rakim(lat, lon)), "siteType": ["METAR", "TAF"], "country": "TR"}]


def _metar(params):
    """Son 7 günün yarım saatlik sentetik METAR raporları: model alanına küçük bir temsil farkı eklenir ve
    gerçek METAR gibi tam sayıya yuvarlanır."""
    _, lat, lon = str(params["ids"]).split(":")
    lat, lon = float(lat), float(lon)
    simdi = pd.Timestamp.now(tz="UTC").floor("30min").tz_localize(None)
    zaman = pd.date_range(simdi - pd.Timedelta(hours=int(params.get("hours", 168))), simdi, freq="30min")
    a = nokta(lat, lon, zaman, simdi.normalize() - pd.Timedelta(days=1))
    r = _rng("metar", round(lat, 2), round(lon, 2))
    T = a["temperature_2m"] - 0.8 + r.normal(0, 0.7, len(zaman))
    return [{"icaoId": params["ids"], "reportTime": t.strftime("%Y-%m-%dT%H:%M:00.000Z"), "temp": round(float(T[i])),
             "dewp": round(float(min(a["dew_point_2m"][i] - 0.5, T[i]))), "wdir": int(a["_yon"][i] // 10 * 10),
             "wspd": round(float(a["_hiz"][i] / 1.852 * 0.85)), "wgst": None,
             "altim": round(float(a["pressure_msl"][i] + r.normal(0, 0.4)))} for i, t in enumerate(zaman)][::-1]


def yanit(url, params):
    """getir() ile aynı biçimde yanıt döndürür; çok noktalı isteklerde liste."""
    if "geocoding" in url:
        return _ara(params)
    if "aviationweather" in url:
        return _istasyon(params) if "stationinfo" in url else _metar(params)
    uret = _ansambl if "ensemble" in url else _onceki if "previous-runs" in url else \
        _deniz if "marine" in url else _arsiv if "archive" in url else _tahmin
    lats, lons = _liste(params["latitude"]), _liste(params["longitude"])
    sonuc = [uret(params, a, b) for a, b in zip(lats, lons)]
    return sonuc if len(sonuc) > 1 else sonuc[0]


def metar_arsivi(istasyon, bas, son):
    """IEM arşivi biçiminde saatlik sentetik METAR (CSV, °F). Gerçekteki gibi rapor saat :50'de, sıcaklık tam sayı
    °C'ye yuvarlanmış; raporların bir kısmı eksik ("M")."""
    _, lat, lon = str(istasyon).split(":")
    lat, lon = float(lat), float(lon)
    zaman = pd.date_range(bas, son, freq="h", inclusive="left") + pd.Timedelta(minutes=50)
    a = nokta(lat, lon, zaman, pd.Timestamp.now(tz="UTC").tz_localize(None).normalize() - pd.Timedelta(days=1))
    r = _rng("metar_arsiv", round(lat, 2), round(lon, 2))
    T = np.round(a["temperature_2m"] - 0.8 + r.normal(0, 0.7, len(zaman)))
    F = [f"{t * 9 / 5 + 32:.2f}" if r.random() > 0.03 else "M" for t in T]
    satirlar = [f"{istasyon},{z:%Y-%m-%d %H:%M},{f}" for z, f in zip(zaman, F)]
    return "station,valid,tmpf\n" + "\n".join(satirlar) + "\n"
