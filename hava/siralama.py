"""Model sıralaması: geçmişte gerçekten yayımlanmış tahminleri, bir havalimanı istasyonunun ölçümleriyle karşılaştırır.

Kurallar (sıralamanın dürüst olması için):
- Gerçekleşen değer yalnızca istasyon ölçümüdür (METAR). Ölçüm olmayan saatler doldurulmaz, atlanır.
- Tahminler Open-Meteo'nun geçmiş tahmin arşivinden gelir: o gün gerçekten yayımlanmış koşular, yeniden analiz değil.
- Her tahmin ufku (+24/+48/+72 sa) ayrı sıralanır. Bütün modeller aynı saatler üzerinden karşılaştırılır.
- Fark anlamlı değilse sıra da yoktur: modeller gün blokları ile bootstrap yapılarak gruplanır.
- Yağış yoktur: Türkiye'deki METAR'larda yağış miktarı raporlanmaz (arşivdeki sıfırlar ölçüm değil, boşluktur).

METAR arşivi: Iowa State Üniversitesi, Iowa Environmental Mesonet (IEM). İstasyonun konumu IEM'den değil, NOAA'nın
istasyon listesinden alınır: IEM bazı istasyonları eski koordinatlarıyla tutuyor (ör. LTCB)."""
import io
import time

import numpy as np
import pandas as pd
import requests
import streamlit as st

from hava.veri import ONBELLEK, getir, ornek_modu

IEM = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"
ONCEKI = "https://previous-runs-api.open-meteo.com/v1/forecast"
# arşivde Türkiye ve Avrupa için eksiksiz bulunan küresel modeller (KMA ve BOM arşivde yok)
MODELLER = {"ecmwf_ifs025": "ECMWF IFS", "icon_seamless": "DWD ICON", "gfs_seamless": "NOAA GFS",
            "meteofrance_seamless": "Météo-France", "ukmo_seamless": "UK Met Office", "jma_seamless": "JMA",
            "gem_seamless": "Kanada GEM", "cma_grapes_global": "Çin CMA"}
UFUKLAR = (1, 2, 3)          # gün önce: +24, +48, +72 saat
EN_UZUN = 90                 # gün
KAPSAM = 0.8                 # gözlem saatlerinin en az %80'inde arşivi dolu olmayan model sıralamaya alınmaz
TEKRAR = 1000                # bootstrap tekrarı


def _gunler(gun_sayisi):
    """Dönemin başı ve sonu (UTC, bugün hariç: bugünün ölçümleri henüz tamamlanmadı)."""
    son = pd.Timestamp.now(tz="UTC").tz_localize(None).normalize()
    return son - pd.Timedelta(days=gun_sayisi), son


@st.cache_data(show_spinner="İstasyonun ölçüm arşivi indiriliyor…", max_entries=50)
def _metar_indir(istasyon, bas, son, ornek):
    """IEM'den saatlik METAR sıcaklıkları (CSV). Günde bir indirilir, diskte saklanır."""
    if ornek:
        from hava import ornek as ornek_veri
        return ornek_veri.metar_arsivi(istasyon, bas, son)
    yol = ONBELLEK / "metar_arsiv" / f"{istasyon}_{son:%Y-%m-%d}.csv"
    if yol.exists():
        return yol.read_text()
    r = requests.get(IEM, params={"station": istasyon, "data": "tmpf", "tz": "Etc/UTC", "format": "onlycomma",
                                  "missing": "M", "report_type": 3,          # yalnızca rutin saatlik raporlar
                                  "year1": bas.year, "month1": bas.month, "day1": bas.day,
                                  "year2": son.year, "month2": son.month, "day2": son.day}, timeout=90)
    r.raise_for_status()
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(r.text)
    for eski in yol.parent.glob("*.csv"):                                     # iki günden eskileri temizle
        if time.time() - eski.stat().st_mtime > 2 * 86400:
            eski.unlink(missing_ok=True)
    return r.text


def gozlemler(icao):
    """Son 90 günün saatlik sıcaklık ölçümleri (°C, UTC). Yalnızca tam saate 15 dakikadan yakın raporlar alınır;
    ölçüm olmayan saatler tabloda hiç yer almaz. Alınamazsa None."""
    bas, son = _gunler(EN_UZUN)
    try:
        metin = _metar_indir(icao, bas, son, ornek_modu())
    except requests.RequestException:
        return None
    d = pd.read_csv(io.StringIO(metin), na_values="M")
    if d.empty or "tmpf" not in d:
        return None
    t = pd.to_datetime(d["valid"])
    saat = t.dt.round("h")
    yakin = ((t - saat).abs() <= pd.Timedelta(minutes=15)).to_numpy()
    s = pd.Series(((d["tmpf"] - 32) * 5 / 9).to_numpy(), index=saat.to_numpy())[yakin].dropna().round(1)
    return s[~s.index.duplicated(keep="last")].sort_index()


def tahminler(istasyon):
    """Her model ve ufuk için arşivdeki tahminler (UTC). Tahmin istasyonun kendi koordinatı ve rakımı için istenir:
    rakım verilmezse model kendi arazi yüksekliğini kullanır ve sıcaklıkta yapay bir sapma doğar."""
    bas, son = _gunler(EN_UZUN)
    params = {"latitude": istasyon["lat"], "longitude": istasyon["lon"], "timezone": "GMT",
              "hourly": ",".join(f"temperature_2m_previous_day{g}" for g in UFUKLAR), "models": ",".join(MODELLER),
              "start_date": f"{bas:%Y-%m-%d}", "end_date": f"{son - pd.Timedelta(days=1):%Y-%m-%d}"}
    if istasyon.get("rakim") is not None:
        params["elevation"] = istasyon["rakim"]
    js = getir(ONCEKI, params, durdur=False, gunluk=True)
    if not js:
        return None
    df = pd.DataFrame(js["hourly"])
    df.index = pd.to_datetime(df.pop("time"))
    return df.apply(pd.to_numeric, errors="coerce")


def ufuk(df, gun):
    """Bir ufkun tahminleri: sütunlar model kodları."""
    sutun = {f"temperature_2m_previous_day{gun}_{m}": m for m in MODELLER}
    return df[[s for s in sutun if s in df]].rename(columns=sutun)


def siralama(F, O, gun_sayisi):
    """MAE, RMSE, sapma, N ve gün bloklu bootstrap ile güven aralığı ve gruplar.

    Ardışık saatlerin hataları birbirine bağlıdır (bir model bütün gün aynı yönde yanılır). Bu yüzden bootstrap
    saatleri değil günleri yeniden örnekler. Grup: en iyi modelden ayırt edilemeyen modeller (MAE farkının tek
    yönlü %95 alt sınırı sıfırın altında). Sonra kalanların en iyisiyle aynı işlem tekrarlanır."""
    bas = O.index.max().ceil("D") - pd.Timedelta(days=gun_sayisi)        # 23:50 raporu ertesi 00:00'a yuvarlanır
    O = O[O.index >= bas]
    kapsam = F.reindex(O.index).notna().mean()
    yeterli = [m for m in F if kapsam[m] >= KAPSAM]
    d = F[yeterli].join(O.rename("gozlem"), how="inner").dropna()            # ortak örneklem
    if d.empty or not yeterli:
        return None, {"N": 0, "gun": 0, "disarida": [m for m in F if m not in yeterli]}
    E = d[yeterli].sub(d.gozlem, axis=0)
    gun = E.index.normalize()
    mutlak, adet = E.abs().groupby(gun).sum().to_numpy(), E.groupby(gun).size().to_numpy()
    D = len(adet)
    idx = np.random.default_rng(0).integers(0, D, (TEKRAR, D))
    boot = mutlak[idx].sum(axis=1) / adet[idx].sum(axis=1)[:, None]          # (tekrar, model)

    t = pd.DataFrame({"MAE": E.abs().mean(), "RMSE": np.sqrt((E ** 2).mean()), "Bias": E.mean(), "N": E.count(),
                      "alt": np.quantile(boot, 0.05, axis=0), "ust": np.quantile(boot, 0.95, axis=0)})
    sira = list(t.MAE.sort_values().index)
    kol = {m: i for i, m in enumerate(yeterli)}
    grup, g = {}, 1
    while sira:
        lider = kol[sira[0]]
        ayni = [m for m in sira if np.quantile(boot[:, kol[m]] - boot[:, lider], 0.05) <= 0]
        grup |= dict.fromkeys(ayni, g)
        sira = [m for m in sira if m not in ayni]
        g += 1
    t["grup"] = pd.Series(grup)
    t["model"] = [MODELLER[m] for m in t.index]
    return t.sort_values(["grup", "MAE"]), {"N": len(d), "gun": D, "disarida": [m for m in F if m not in yeterli]}
