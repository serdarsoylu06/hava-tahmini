"""Gerçek istasyon ölçümleri: havalimanı meteoroloji istasyonlarının METAR raporları.
Kaynak: NOAA Aviation Weather Center (aviationweather.gov) veri servisi; ücretsiz, anahtarsız, yaklaşık son 7 gün.
METAR yarım saatte bir yayımlanır; sıcaklık ve çiy noktası tam sayı °C, rüzgâr knot, basınç QNH (hPa) verilir."""
import numpy as np
import pandas as pd

from hava.veri import getir
from hava.yerler import mesafe_km

AWC = "https://aviationweather.gov/api/data"
KNOT = 1.852


def _adaylar(lat, lon, en_fazla_km):
    js = getir(f"{AWC}/stationinfo", {"bbox": f"{lat - 1.5:.2f},{lon - 2:.2f},{lat + 1.5:.2f},{lon + 2:.2f}",
                                      "format": "json"}, durdur=False)
    out = [{"icao": s["icaoId"], "ad": s["site"], "lat": s["lat"], "lon": s["lon"], "rakim": s.get("elev"),
            "km": mesafe_km(lat, lon, s["lat"], s["lon"])}
           for s in (js or []) if "METAR" in (s.get("siteType") or [])]
    return sorted([s for s in out if s["km"] <= en_fazla_km], key=lambda s: s["km"])


def en_yakin_olcum(lat, lon, tz, en_fazla_km=120):
    """Son 7 günde düzenli rapor yayımlamış en yakın istasyon ve saatlik ölçümleri: (istasyon, tablo) ya da
    (None, None). Bazı istasyonlar (ör. askerî) listede görünür ama rapor yayımlamaz; bu yüzden en yakın birkaç
    aday tek istekte sorulur ve verisi olan en yakını seçilir."""
    adaylar = _adaylar(lat, lon, en_fazla_km)[:5]
    if not adaylar:
        return None, None
    # servis bir yanıtta en fazla 400 rapor verir: önce son 3 saatle kimin yayın yaptığına bak, sonra yalnızca
    # seçilen istasyonun 7 gününü iste
    js = getir(f"{AWC}/metar", {"ids": ",".join(s["icao"] for s in adaylar), "hours": 3, "format": "json"},
               durdur=False)
    yayinda = {x["icaoId"] for x in (js or [])}
    for s in adaylar:
        if s["icao"] not in yayinda:
            continue
        js = getir(f"{AWC}/metar", {"ids": s["icao"], "hours": 168, "format": "json"}, durdur=False)
        if js and len(js) >= 48:                        # en az ~1 günlük rapor
            return s, _tablo(pd.DataFrame(js), tz)
    return None, None


def _tablo(d, tz):
    """METAR satırlarını yerel saatte, saatlik ve uygulamanın değişken adlarıyla tabloya çevirir."""
    zaman = pd.to_datetime(d.reportTime, utc=True).dt.tz_convert(None if tz == "auto" else tz).dt.tz_localize(None)
    sayi = lambda s: pd.to_numeric(d[s], errors="coerce").to_numpy() if s in d else np.nan
    o = pd.DataFrame({"temperature_2m": sayi("temp"), "dew_point_2m": sayi("dewp"),
                      "wind_speed_10m": sayi("wspd") * KNOT, "wind_gusts_10m": sayi("wgst") * KNOT,
                      "pressure_msl": sayi("altim")}, index=zaman.to_numpy())
    # yarım saatlik raporları tam saate topla
    return o.sort_index().resample("h").mean().dropna(how="all")
