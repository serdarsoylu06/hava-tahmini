import numpy as np
import pandas as pd
import streamlit as st

from hava import harita, tasarim
from hava.veri import DENIZ, FC, TZ, getir, konum
from hava.yorum import zaman as zaman_yaz

k = konum()
tasarim.baslik("Atmosfer", "Tahmin haritaları",
               "Haritayı sürükle, yakınlaştır; bir noktanın üzerine gelince değerleri görünür. **Bir noktaya tıklarsan "
               "orası uygulamanın konumu olur.** Ayrıntılı seçim için bölgeyi \"Konumun çevresi\" yap.", "atmosfer")

# Araç çubuğu: katman seçimi açılır panelde (sekiz düğme dar ekranda iki-üç satıra yayılıyordu), yanında bölge,
# "neye bakmalı?" rehberi ve oynat düğmesi.
KATMAN_IKON = {"Sıcaklık + basınç": "thermostat", "Yağış + basınç": "rainy", "Rüzgâr hamleleri": "air",
               "Bulutluluk": "cloud", "Dalga yüksekliği": "waves", "Deniz suyu sıcaklığı": "pool",
               "850 hPa sıcaklık (~1,5 km)": "landscape", "500 hPa yükseklik (~5,5 km)": "filter_hdr"}
if st.session_state.get("h_kat") not in harita.KATMANLAR:
    st.session_state.h_kat = "Sıcaklık + basınç"
kat = st.session_state.h_kat
ayar = harita.KATMANLAR[kat]
with st.container(horizontal=True, vertical_alignment="bottom", gap="small", key="harita_arac"):
    with st.popover(kat, icon=f":material/{KATMAN_IKON.get(kat, 'layers')}:", help="Haritada gösterilecek katman"):
        st.radio("Katman", list(harita.KATMANLAR), key="h_kat",
                 format_func=lambda x: f":material/{KATMAN_IKON.get(x, 'layers')}: {x}")
    bolge = st.selectbox("Bölge", list(harita.BOLGELER), index=list(harita.BOLGELER).index("Avrupa – Orta Doğu"),
                         key="h_bolge",
                         label_visibility="collapsed", width=200)
    with st.popover("Neye bakmalı?", icon=":material/visibility:"):
        for madde in ayar["bak"]:
            st.markdown(f"- {madde}")
    oynat = st.toggle("Oynat", key="h_oynat", help="Haritayı 3 saatlik adımlarla ilerletir.")

(la0, la1, dla), (lo0, lo1, dlo) = harita.bolge_izgarasi(bolge, k["lat"], k["lon"])
lats, lons = np.arange(la0, la1 + 0.01, dla), np.arange(lo0, lo1 + 0.01, dlo)
LA, LO = np.meshgrid(lats, lons, indexing="ij")
istek = [ayar["var"]] + [ayar[x] for x in ("izo", "ok", "ok_boy") if ayar.get(x)]
res = getir(DENIZ if ayar.get("kaynak") == "deniz" else FC,
            {"latitude": ",".join(f"{x:.2f}" for x in LA.ravel()),
             "longitude": ",".join(f"{x:.2f}" for x in LO.ravel()),
             "hourly": ",".join(dict.fromkeys(istek)), "forecast_days": 5, "timezone": TZ})
zaman = pd.to_datetime(res[0]["hourly"]["time"])
adimlar = list(range(0, len(zaman), 3))


def izgara(v):
    if not v:
        return None
    return np.array([r["hourly"][v] for r in res], dtype=float).reshape(*LA.shape, -1)


ALAN, IZO, OK_Y, OK_B = (izgara(ayar.get(x)) for x in ("var", "izo", "ok", "ok_boy"))
if np.isnan(ALAN).all():
    st.warning("Bu bölgede deniz yok ya da deniz verisi alınamadı. Bölgeyi Türkiye yap.", icon=":material/waves:")
    st.stop()
sev, renkler = harita.renk_skalasi(ayar, ALAN)
koyu = st.context.theme.type == "dark"

if "h_saat" not in st.session_state or st.session_state.h_saat not in adimlar:
    simdi = pd.Timestamp.now(tz=TZ).tz_localize(None)
    st.session_state.h_saat = adimlar[int(np.argmin([abs((zaman[i] - simdi).total_seconds()) for i in adimlar]))]


def tiklandi():
    secim = st.session_state.harita_sec.selection.get("objects", {}).get("izgara") or []
    if secim:
        lon, lat = secim[0]["konum"]
        st.session_state.harita_nokta = {"lat": lat, "lon": lon}
        st.session_state.konum_degisti = True


def sec(dizi, i):
    return None if dizi is None else dizi[..., i]


@st.fragment(run_every=1.6 if oynat else None)
def harita_alani():
    if st.session_state.pop("konum_degisti", False):
        st.rerun()          # konum tüm uygulamayı ilgilendirir: parça değil, sayfanın tamamı yenilensin
    if oynat:
        st.session_state.h_saat = adimlar[(adimlar.index(st.session_state.h_saat) + 1) % len(adimlar)]
    saat = st.select_slider("Tahmin zamanı (Türkiye saati)", options=adimlar, key="h_saat",
                            format_func=lambda i: zaman_yaz(zaman[i]))
    # harita tam genişlikte: yan sütundaki rehber dar ekranda haritayı ve kendini sıkıştırıyordu (artık araç çubuğunda)
    st.pydeck_chart(harita.harita(lats, lons, ALAN[..., saat], sec(IZO, saat), sec(OK_B, saat),
                                  sec(OK_Y, saat), ayar, sev, renkler, k, koyu),
                    height=600, on_select=tiklandi, selection_mode="single-object", key="harita_sec",
                    alt=f"{kat} haritası, {zaman[saat]:%d.%m %H:%M}")
    st.html(harita.cetvel_html(list(sev), renkler, ayar["birim"], kat))
    st.caption(f"Model ızgarası {dla}° aralıklı ({LA.size} nokta); yumuşatılarak çizildi. Bölge değişince veri "
               "yeniden indirilir, sonra 1 saat önbellekte kalır.")


harita_alani()
