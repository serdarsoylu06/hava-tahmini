"""
Hava Tahmini Laboratuvarı
Çalıştırmak için:  streamlit run hava_lab.py
Veri: Open-Meteo (ücretsiz, anahtarsız) — ECMWF, GFS, ICON, ARPEGE, UKMO modelleri
"""
import os

import streamlit as st

from hava.veri import GEO, getir
from hava import kayit
from hava.yerler import konum_kaydi, nokta_konumu, yerlesimler

st.set_page_config(page_title="Hava tahmini laboratuvarı", page_icon=":material/partly_cloudy_day:",
                   layout="wide")

sayfa = st.navigation({
    "": [st.Page("app_pages/genel.py", title="Genel bakış", icon=":material/home:", default=True)],
    "Tahmin": [
        st.Page("app_pages/meteogram.py", title="Meteogram", icon=":material/monitoring:"),
        st.Page("app_pages/modeller.py", title="Modeller", icon=":material/compare_arrows:"),
        st.Page("app_pages/ansambl.py", title="Ansambl", icon=":material/stacked_line_chart:"),
        st.Page("app_pages/dogrulama.py", title="Tahmin doğrulaması", icon=":material/fact_check:"),
        st.Page("app_pages/iklim.py", title="İklim ve geçmiş", icon=":material/history:"),
    ],
    "Deniz": [st.Page("app_pages/balikcilik.py", title="Balıkçılık ve deniz", icon=":material/sailing:")],
    "Atmosfer": [
        st.Page("app_pages/canli.py", title="Canlı radar ve uydu", icon=":material/radar:"),
        st.Page("app_pages/haritalar.py", title="Tahmin haritaları", icon=":material/map:"),
        st.Page("app_pages/profil.py", title="Atmosfer profili", icon=":material/vertical_align_top:"),
    ],
    "Öğren": [st.Page("app_pages/ogren.py", title="Tahmin okuma rehberi", icon=":material/school:")],
}, position="top")


def haritadan_vazgec():
    st.session_state.pop("harita_nokta", None)


def kayitli_sec():
    ad = st.session_state.kayitli_secim
    n = next((x for x in kayit.oku() if x["ad"] == ad), None)
    if n:
        st.session_state.harita_nokta = {"lat": n["lat"], "lon": n["lon"], "ad": n["ad"], "kayitli": True}
    st.session_state.kayitli_secim = None          # seçim bir kez uygulanır; düğme gibi davranır


def kaydet(anahtar):
    ad = st.session_state[anahtar].strip()
    if ad:
        kayit.ekle(ad, st.session_state.konum["lat"], st.session_state.konum["lon"])
        st.session_state.harita_nokta = {"lat": st.session_state.konum["lat"], "lon": st.session_state.konum["lon"],
                                         "ad": ad, "kayitli": True}
        st.toast(f"\"{ad}\" kaydedildi.", icon=":material/bookmark_added:")


with st.sidebar:
    st.subheader("Konum", anchor=False)
    nokta = st.session_state.get("harita_nokta")
    if nokta:
        kayitli = nokta.get("kayitli")
        st.session_state.konum = nokta_konumu(nokta["lat"], nokta["lon"], nokta.get("ad"),
                                              "Kayıtlı nokta" if kayitli else "Haritadan seçilen nokta")
        st.info(f"**{st.session_state.konum['ad']}**  \n{nokta['lat']:.3f}° K, {nokta['lon']:.3f}° D",
                icon=":material/bookmark:" if kayitli else ":material/pin_drop:",
                title="Kayıtlı nokta" if kayitli else "Haritadan seçildi")
        st.button("Şehir aramasına dön", icon=":material/search:", on_click=haritadan_vazgec, width="stretch")
        s = {"latitude": nokta["lat"], "longitude": nokta["lon"], "elevation": "?",
             "timezone": st.session_state.konum["tz"]}
    else:
        yerler = yerlesimler()
        etiketler = list(yerler)
        secim = st.selectbox(
            "Şehir ya da ilçe", etiketler, index=etiketler.index("Ankara"), key="yer", accept_new_options=True,
            placeholder="Yazmaya başla…",
            help="Yazdıkça öneriler anında süzülür (Türkiye'deki il, ilçe ve kasabalar ile dünyanın büyük şehirleri). "
                 "Listede olmayan bir yeri yazıp Enter'a basarsan internette aranır.")
        if secim in yerler:
            st.session_state.konum = konum_kaydi(yerler[secim])
            s = {"latitude": yerler[secim]["enlem"], "longitude": yerler[secim]["boylam"],
                 "elevation": yerler[secim]["rakim"] if yerler[secim]["rakim"] is not None else "?",
                 "timezone": yerler[secim]["saat_dilimi"]}
        else:
            # listede olmayan ad: yalnızca bu durumda yer adı servisine tek bir istek gider
            sonuc = getir(GEO, {"name": secim, "count": 6, "language": "tr"}).get("results", [])
            if not sonuc:
                st.error(f"\"{secim}\" adında bir yer bulunamadı. Farklı yazmayı dene.",
                         icon=":material/location_off:")
                st.stop()
            i = st.selectbox("Arama sonuçları", range(len(sonuc)), key=f"sonuc_{secim}",
                             format_func=lambda k: ", ".join(x for x in (sonuc[k]["name"], sonuc[k].get("admin1"),
                                                                         sonuc[k].get("country")) if x))
            s = sonuc[i]
            st.session_state.konum = {"ad": s["name"], "lat": s["latitude"], "lon": s["longitude"],
                                      "tz": s.get("timezone") or "auto", "rakim": s.get("elevation"),
                                      "bolge": ", ".join(x for x in (s.get("admin1"), s.get("country")) if x)}
        st.caption(":material/touch_app: Canlı radar ya da Tahmin haritaları sayfasında bir noktaya tıklayarak da konum seçebilirsin.")

    # ---------------------------------------------------------------- kayıtlı noktalar
    noktalar = kayit.oku()
    if noktalar:
        st.pills("Kayıtlı noktalar", [n["ad"] for n in noktalar], key="kayitli_secim", on_change=kayitli_sec)
    with st.popover("Bu konumu kaydet", icon=":material/bookmark_add:", width="stretch"):
        anahtar = f"kayit_adi_{st.session_state.konum['lat']}_{st.session_state.konum['lon']}"
        st.text_input("Nokta adı", value=st.session_state.konum["ad"], key=anahtar,
                      help="Örn. \"Tirebolu açığı – lüfer\". Aynı adla kaydedersen eski kaydın yerini alır.")
        st.button("Kaydet", icon=":material/save:", on_click=kaydet, args=(anahtar,), type="primary", width="stretch")
        if noktalar:
            st.caption("Kayıtlı noktaları sil")
            for n in noktalar:
                st.button(n["ad"], icon=":material/delete:", key=f"sil_{n['ad']}", on_click=kayit.sil,
                          args=(n["ad"],), width="stretch")
    st.slider("Tahmin süresi (gün)", 2, 10, 5, key="gun",
              help="Meteogram, modeller, ansambl ve uyarılar bu aralığı kullanır. Uzadıkça belirsizlik artar.")
    rakim = s.get("elevation")
    st.caption(f"{s['latitude']:.2f}° K, {s['longitude']:.2f}° D"
               + (f" · rakım {rakim:.0f} m" if isinstance(rakim, (int, float)) else "") + "  \n"
               f"Saatler yerel saattir ({s.get('timezone', '?')}).")
    st.toggle("Örnek veri (çevrimdışı)", key="ornek_veri",
              value=os.environ.get("HAVA_ORNEK", "") in ("1", "true", "evet"),
              help="Geliştirme ve deneme için: veri servislerine hiç istek atmadan sentetik bir senaryo (geçen bir "
                   "alçak basınç sistemi, yağış, kuvvetli rüzgâr, don, sis) gösterir. Değerler gerçek değildir. "
                   "Radar ve uydu görüntüsü yine gerçektir.")
    st.space("medium")
    st.caption("Veri: [Open-Meteo](https://open-meteo.com) (CC BY 4.0) · ECMWF, DWD, NOAA, Météo-France, "
               "UK Met Office modelleri · yer adları: [GeoNames](https://www.geonames.org) (CC BY 4.0)")

if st.session_state.get("ornek_veri"):
    st.badge("Örnek veri modu: gösterilen değerler sentetiktir, gerçek tahmin değildir", icon=":material/science:",
             color="orange")
sayfa.run()
