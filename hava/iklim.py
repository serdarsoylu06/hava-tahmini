"""Mevsim normalleri ve geçmiş: Open-Meteo arşivindeki ERA5 yeniden analizinden (1991'den bugüne, günlük).
Normal dönemi WMO'nun güncel standardı olan 1991–2020'dir. Arşiv konum başına ayda bir indirilir ve diskte
saklanır; normaller her gün değişmez, kotayı da gereksiz harcamamak gerekir."""
import json
import time

import numpy as np
import pandas as pd
import requests
import streamlit as st

from hava.veri import FC, ONBELLEK, getir, ornek_modu

ARSIV = "https://archive-api.open-meteo.com/v1/archive"
BASLANGIC, NORMAL = 1991, (1991, 2020)
# Open-Meteo uzun ve çok değişkenli istekleri birden çok istek sayar: değişken sayısı en azda tutulur,
# günlük ortalama en yüksek ile en düşükten hesaplanır.
GUNLUK = "temperature_2m_max,temperature_2m_min,precipitation_sum"


@st.cache_data(show_spinner="Geçmiş 35 yılın verisi hazırlanıyor…", max_entries=50)
def _arsiv_indir(lat, lon, ay, ornek):
    """`ay` (ör. "2026-11") önbellek anahtarıdır: arşiv konum başına ayda bir yenilenir."""
    bitis = (pd.Timestamp(ay + "-01") - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    params = {"latitude": lat, "longitude": lon, "start_date": f"{BASLANGIC}-01-01", "end_date": bitis,
              "daily": GUNLUK, "timezone": "auto"}
    if ornek:
        from hava import ornek as ornek_veri
        return ornek_veri.yanit(ARSIV, params)
    yol = ONBELLEK / "arsiv" / f"{lat}_{lon}_{ay}.json"
    if yol.exists():
        return json.loads(yol.read_text())
    r = requests.get(ARSIV, params=params, timeout=120)
    r.raise_for_status()
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(r.text)
    for eski in yol.parent.glob("*.json"):           # iki aydan eski arşivleri temizle
        if time.time() - eski.stat().st_mtime > 62 * 86400:
            eski.unlink(missing_ok=True)
    return r.json()


def arsiv(k):
    """Günlük ERA5 tablosu (1991'den geçen aya kadar). Alınamazsa None."""
    # 0,1° yuvarlama: yakın konumlar (ör. aynı ilçe) aynı arşivi paylaşır; ERA5 ızgarası zaten ~25 km
    lat, lon = round(k["lat"], 1), round(k["lon"], 1)
    try:
        js = _arsiv_indir(lat, lon, pd.Timestamp.now().strftime("%Y-%m"), ornek_modu())
    except requests.RequestException:
        return None
    return _tablo(js)


def _tablo(js):
    d = pd.DataFrame(js["daily"])
    d["time"] = pd.to_datetime(d["time"])
    d = d.set_index("time").apply(pd.to_numeric, errors="coerce")
    d["temperature_2m_mean"] = (d.temperature_2m_max + d.temperature_2m_min) / 2
    return d


def normaller(a: pd.DataFrame):
    """Yılın her günü için 1991–2020 normali: ortalama, %10 ve %90 değerleri (±7 günlük pencereyle yumuşatılmış,
    çünkü tek bir takvim gününün 30 değeri gürültülüdür). İndeks: ay-gün (ör. "11-04")."""
    n = a[(a.index.year >= NORMAL[0]) & (a.index.year <= NORMAL[1])].copy()
    n = n[~((n.index.month == 2) & (n.index.day == 29))]
    n["gun"] = n.index.dayofyear - ((n.index.year % 4 == 0) & (n.index.month > 2))   # artık yılı hizala: 1..365
    sonuc = {}
    for gun in range(1, 366):
        pencere = ((n.gun - gun + 182) % 365 - 182).abs() <= 7
        p = n[pencere]
        sonuc[gun] = {"max_ort": p.temperature_2m_max.mean(), "max_p10": p.temperature_2m_max.quantile(0.1),
                      "max_p90": p.temperature_2m_max.quantile(0.9), "min_ort": p.temperature_2m_min.mean(),
                      "min_p10": p.temperature_2m_min.quantile(0.1), "min_p90": p.temperature_2m_min.quantile(0.9),
                      "ort": p.temperature_2m_mean.mean(), "yagis": p.precipitation_sum.mean()}
    df = pd.DataFrame.from_dict(sonuc, orient="index")
    tarih = pd.Timestamp("2001-01-01") + pd.to_timedelta(df.index - 1, unit="D")   # artık olmayan bir yıl
    df.index = tarih.strftime("%m-%d")
    return df


def normal_al(nrm, tarihler):
    """Verilen tarihlerin normal satırları (29 Şubat, 28 Şubat'ınkini kullanır)."""
    anahtar = [("02-28" if (t.month, t.day) == (2, 29) else t.strftime("%m-%d")) for t in tarihler]
    return nrm.loc[anahtar].set_axis(tarihler)


def son_gunler(k):
    """Arşivin bittiği yerden bugüne ve önümüzdeki 10 güne günlük değerler (tahmin servisi; 1 istek)."""
    js = getir(FC, {"latitude": k["lat"], "longitude": k["lon"], "daily": GUNLUK, "past_days": 31,
                    "forecast_days": 10, "timezone": k["tz"]}, durdur=False)
    return None if js is None else _tablo(js)


def ayni_gun_gecmisi(a: pd.DataFrame, tarih, pencere=3):
    """Her yıl için verilen takvim gününün (±pencere gün) ortalama en yüksek/en düşük sıcaklığı."""
    satir = []
    for yil in sorted(set(a.index.year)):
        try:
            merkez = pd.Timestamp(year=yil, month=tarih.month, day=min(tarih.day, 28 if tarih.month == 2 else 31))
        except ValueError:
            continue
        p = a.loc[merkez - pd.Timedelta(days=pencere): merkez + pd.Timedelta(days=pencere)]
        if len(p) >= pencere:
            satir.append({"yil": yil, "max": p.temperature_2m_max.mean(), "min": p.temperature_2m_min.mean()})
    return pd.DataFrame(satir)


def yillik(a: pd.DataFrame):
    """Tam yılların ortalama sıcaklığı ve 1991–2020 normaline göre sapması (ısınma şeritleri için)."""
    y = a.temperature_2m_mean.groupby(a.index.year).agg(["mean", "count"])
    y = y[y["count"] >= 360]["mean"].rename("ort").to_frame()
    normal = y.loc[NORMAL[0]:NORMAL[1], "ort"].mean()
    y["sapma"] = y.ort - normal
    egim = np.polyfit(y.index, y.ort, 1)[0] * 10                     # °C / 10 yıl
    return y, egim, normal


def aylik_yagis(a: pd.DataFrame, son: pd.DataFrame | None, yil):
    """Bu yılın aylık yağış toplamı (arşiv + son günler) ile 1991–2020 aylık normali."""
    normal = a.loc[f"{NORMAL[0]}":f"{NORMAL[1]}", "precipitation_sum"]
    normal = normal.groupby([normal.index.year, normal.index.month]).sum().groupby(level=1).mean()
    bu = a.loc[str(yil), "precipitation_sum"] if str(yil) in a.index.strftime("%Y") else pd.Series(dtype=float)
    if son is not None:
        ek = son.precipitation_sum[(son.index.year == yil) & (son.index > (bu.index.max() if len(bu) else pd.Timestamp(0)))
                                   & (son.index <= pd.Timestamp.now().normalize())]
        bu = pd.concat([bu, ek])
    bu_ay = bu.groupby(bu.index.month).sum()
    return pd.DataFrame({"normal": normal, "bu_yil": bu_ay}).rename_axis("ay")
