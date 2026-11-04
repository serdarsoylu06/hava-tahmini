"""Skew-T log-P diyagramı (MetPy)."""
import matplotlib.pyplot as plt
import metpy.calc as mpcalc
import numpy as np
from metpy.plots import SkewT
from metpy.units import units

from hava.veri import SEVIYELER


def profil(satir):
    """Bir saatlik tahmin satırından yerden başlayan dikey profil kurar:
    en altta yer seviyesi (2 m / 10 m), üstünde yerin üstünde kalan basınç seviyeleri."""
    ps = satir.surface_pressure
    sev = [x for x in SEVIYELER if x < ps - 1]
    p = np.array([ps] + sev, dtype=float) * units.hPa
    T = np.array([satir.temperature_2m] + [satir[f"temperature_{x}hPa"] for x in sev]) * units.degC
    rh = np.clip([satir[f"relative_humidity_{x}hPa"] for x in sev], 1, 100) * units.percent
    Td_ust = mpcalc.dewpoint_from_relative_humidity(T[1:], rh).m_as("degC")
    Td = np.concatenate([[satir.dew_point_2m], Td_ust]) * units.degC
    u, v = mpcalc.wind_components(
        np.array([satir.wind_speed_10m] + [satir[f"wind_speed_{x}hPa"] for x in sev]) * units("km/h"),
        np.array([satir.wind_direction_10m] + [satir[f"wind_direction_{x}hPa"] for x in sev]) * units.deg)
    return p, T, Td, u.to("knots"), v.to("knots")


def skewt_fig(p, T, Td, u, v, baslik, koyu=False):
    on, arka = ("#E6EDF6", "#0B1220") if koyu else ("#0F1B2D", "#FFFFFF")
    with plt.rc_context({"text.color": on, "axes.labelcolor": on, "xtick.color": on, "ytick.color": on,
                         "axes.edgecolor": on, "figure.facecolor": arka, "axes.facecolor": arka}):
        fig = plt.figure(figsize=(7.5, 7.5))
        sk = SkewT(fig, rotation=45)
        sk.plot(p, T, "#E03131", lw=2.5, label="Sıcaklık")
        sk.plot(p, Td, "#2F9E44", lw=2.5, label="Çiy noktası")
        sk.plot_barbs(p, u, v, color=on)
        prof = mpcalc.parcel_profile(p, T[0], Td[0]).to("degC")
        sk.plot(p, prof, on, lw=1.5, ls="--", label="Yükselen hava parseli")
        sk.shade_cape(p, T, prof, alpha=0.25)
        sk.shade_cin(p, T, prof, Td, alpha=0.25)
        lcl_p, lcl_t = mpcalc.lcl(p[0], T[0], Td[0])
        sk.plot(lcl_p, lcl_t, "o", color=on, label="Bulut tabanı (LCL)")
        sk.ax.axvline(0, color="#4C6EF5", ls=":", lw=1.2)
        sk.plot_dry_adiabats(alpha=0.18); sk.plot_moist_adiabats(alpha=0.18)
        sk.plot_mixing_lines(alpha=0.18)
        sk.ax.set_ylim(1050, 200); sk.ax.set_xlim(-40, 40)
        sk.ax.set_xlabel("Sıcaklık (°C)"); sk.ax.set_ylabel("Basınç (hPa)")
        sk.ax.legend(loc="upper left", fontsize=8, facecolor=arka, edgecolor=on, labelcolor=on)
        sk.ax.set_title(baslik, color=on)
        fig.tight_layout()
    cape, cin = mpcalc.cape_cin(p, T, Td, prof)
    pw = mpcalc.precipitable_water(p, Td).to("mm")
    donma = None
    if T[0].m > 0 and (T.m <= 0).any():
        k = int(np.argmax(T.m <= 0))
        donma = float(np.interp(0, [T[k].m, T[k - 1].m], [p[k].m, p[k - 1].m]))
    return fig, dict(cape=cape.m, cin=cin.m, lcl=lcl_p.m, pw=pw.m, donma=donma)
