"""Saat saat zaman şeridi (Genel bakış): sıcaklık/hissedilen/çiy noktası, yağış, rüzgâr/hamle, basınç ve uyarılar aynı
saat ekseninde. Etkileşim (saate tıklayınca bütün şeritlerin o saatte hizalanması, telefonda satırın açılması) tamamen
tarayıcıda döner: Python yalnızca saatlik veriyi ve özet cümlesini gönderir (Streamlit Custom Components v2)."""
from pathlib import Path

import pandas as pd
import streamlit as st

from hava.veri import durum, yon_adi
from hava.yorum import GUNLER

SAAT = 36          # şeritte gösterilen saat sayısı

_CSS = Path(__file__).with_name("zaman_seridi.css").read_text(encoding="utf-8")
_BILESEN = st.components.v2.component(
    "zaman_seridi", html='<div class="zs"></div>', css=_CSS,
    js=Path(__file__).with_name("zaman_seridi.js").read_text(encoding="utf-8"),
)


def _tur(kod, gunduz):
    """WMO kodu → şeritteki çizgi simgesinin türü."""
    if kod in (45, 48):
        return "sis"
    if kod >= 95:
        return "simsek"
    if kod in (71, 73, 75, 77, 85, 86):
        return "kar"
    if kod >= 51:
        return "yagmur"
    if kod >= 3:
        return "bulut"
    if kod == 2:
        return "parcali" if gunduz else "ay"
    return "gunes" if gunduz else "ay"


def saatler(df: pd.DataFrame):
    """Şeridin saatlik kayıtları (JSON'a dönüşebilir sözlükler)."""
    sonuc = []
    for i, (t, r) in enumerate(df.iterrows()):
        gunduz = bool(r.is_day)
        sonuc.append({
            "saat": "Şimdi" if i == 0 else f"{t:%H}", "gun": GUNLER[t.weekday()] if t.hour == 0 else "",
            "uzun": f"{GUNLER[t.weekday()]} {t:%H}:00",
            "t": round(float(r.temperature_2m)), "a": round(float(r.apparent_temperature)),
            "d": round(float(r.dew_point_2m)), "p": int(r.precipitation_probability or 0),
            "mm": round(float(r.precipitation or 0), 1),
            "w": round(float(r.wind_speed_10m)), "g": round(float(r.wind_gusts_10m)),
            "yon": float(r.wind_direction_10m), "yon_ad": yon_adi(r.wind_direction_10m),
            "pr": round(float(r.pressure_msl), 1), "gece": not gunduz,
            "tur": _tur(int(r.weather_code), gunduz), "durum": durum(r.weather_code),
        })
    return sonuc


def ozet(df: pd.DataFrame):
    """Önümüzdeki saatleri tek-üç kısa cümleyle anlatır (şeridin başlığı)."""
    cumle = []
    gun = df.iloc[:12]
    # yalnızca ilk gece (ardışık gece saatleri); iloc[:14] ertesi akşama taşıp "Per 19:00" gibi yanlış saat veriyordu
    gece_mi = (df.is_day == 0).to_numpy()
    bas = int(gece_mi.argmax()) if gece_mi.any() else len(df)
    son = bas
    while son < len(df) and gece_mi[son]:
        son += 1
    gece = df.iloc[bas:son]
    yagis = df[df.precipitation_probability >= 50]
    if yagis.empty:
        kuru = "kuru" if gun.precipitation_probability.max() < 20 else "yer yer yağış olasılıklı"
        cumle.append(f"Önümüzdeki saatler {kuru}; en yüksek {gun.temperature_2m.max():.0f}°.")
    else:
        t0 = yagis.index[0]
        cumle.append(f"{GUNLER[t0.weekday()]} {t0:%H}:00 civarında yağış olasılığı %{yagis.precipitation_probability.max():.0f}’e çıkıyor.")
    if not gece.empty:
        tmin = gece.temperature_2m.idxmin()
        cumle.append(f"Gece sıcaklık {gece.temperature_2m.min():.0f}°’ye iniyor ({GUNLER[tmin.weekday()]} {tmin:%H}:00).")
    sis = df[(df.temperature_2m - df.dew_point_2m <= 1) & (df.wind_speed_10m < 10)]
    if not sis.empty:
        cumle.append(f"{GUNLER[sis.index[0].weekday()]} {sis.index[0]:%H}:00’ten itibaren sis olabilir.")
    sert = df[(df.wind_gusts_10m >= 40) | (df.wind_speed_10m >= 25)]
    if not sert.empty and len(cumle) < 3:
        cumle.append(f"{GUNLER[sert.index[0].weekday()]} {sert.index[0]:%H}:00’ten sonra rüzgâr sertleşiyor "
                     f"(hamle {sert.wind_gusts_10m.max():.0f} km/s).")
    return " ".join(cumle[:3])


def zaman_seridi(df: pd.DataFrame, konum_ad: str, koyu: bool, key="zaman_seridi", ozet_goster=True):
    """ozet_goster=False: özet cümlesi sayfada başka yerde (Genel bakış'taki manzarada) gösteriliyorsa tekrarlanmaz."""
    d = df.iloc[:SAAT]
    _BILESEN(key=f"{key}_{'koyu' if koyu else 'acik'}",
             data={"saatler": saatler(d), "ozet": ozet(d) if ozet_goster else "", "konum": konum_ad, "koyu": koyu})
