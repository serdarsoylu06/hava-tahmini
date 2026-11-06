"""
Hava Tahmini Laboratuvarı
Çalıştırmak için:  streamlit run hava_lab.py
Veri: Open-Meteo (ücretsiz, anahtarsız) — ECMWF, GFS, ICON, ARPEGE, UKMO modelleri
"""
import os

import streamlit as st

from hava.veri import GEO, getir, tazelik
from hava import kayit, tasarim
from hava.yerler import konum_kaydi, nokta_konumu, yerlesimler

st.set_page_config(page_title="Hava tahmini laboratuvarı", page_icon=":material/partly_cloudy_day:",
                   layout="wide")

MENU = {
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
}
sayfa = st.navigation(MENU, position="top")
# Açılır menüdeki bir sayfadayken üst çubukta o menünün başlığı da seçili görünsün (Streamlit yalnızca doğrudan
# bağlantıyı, yani Genel bakış'ı işaretliyor). Gezinme çubuğunun ilk öğesi Genel bakış, sonra menüler sırayla gelir.
_bolum = next((i for i, (ad, ss) in enumerate(MENU.items()) if ad and any(x.url_path == sayfa.url_path for x in ss)), None)


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


tasarim.stil(st.context.theme.type == "dark", _bolum)
_koyu = st.context.theme.type == "dark"
st.logo(f"assets/logo_{'koyu' if _koyu else 'acik'}.svg", size="large")   # kenar çubuğu yok: başlıkta tam logo

# ---------------------------------------------------------------- üst çubuk: konum arama ve kayıtlı noktalar
# Telefonda kenar çubuğu kapalı durduğu için konum seçimi sayfanın en üstünde, her sayfada aynı yerde.
with st.container(key="ust_cubuk", horizontal=True, vertical_alignment="center", gap="small"):
    nokta = st.session_state.get("harita_nokta")
    if nokta:
        kayitli = nokta.get("kayitli")
        st.session_state.konum = nokta_konumu(nokta["lat"], nokta["lon"], nokta.get("ad"),
                                              "Kayıtlı nokta" if kayitli else "Haritadan seçilen nokta")
        st.markdown(f"{':material/bookmark:' if kayitli else ':material/pin_drop:'} "
                    f"**{st.session_state.konum['ad']}** :gray[· {nokta['lat']:.3f}° K, {nokta['lon']:.3f}° D]",
                    width="stretch")
        st.button("Aramaya dön", icon=":material/search:", on_click=haritadan_vazgec)
        s = {"latitude": nokta["lat"], "longitude": nokta["lon"], "elevation": "?",
             "timezone": st.session_state.konum["tz"]}
    else:
        yerler = yerlesimler()
        etiketler = list(yerler)
        # Seçili yer adres satırında tutulur (?yer=Giresun): sayfa yenilenince korunur, bağlantı paylaşılabilir.
        adresteki = st.query_params.get("yer")
        if adresteki and adresteki not in yerler:
            etiketler.append(adresteki)              # daha önce internette aranmış bir ad
        secim = st.selectbox(
            "Konum", etiketler, index=etiketler.index(adresteki or "Ankara"), key="yer", accept_new_options=True,
            placeholder="Şehir, ilçe ya da yer ara…", label_visibility="collapsed", width=340,
            help="Yazdıkça öneriler anında süzülür (Türkiye'deki il, ilçe ve kasabalar ile dünyanın büyük şehirleri). "
                 "Listede olmayan bir yeri yazıp Enter'a basarsan internette aranır.")
        if secim and st.query_params.get("yer") != secim:
            st.query_params["yer"] = secim
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
            i = st.selectbox("Arama sonuçları", range(len(sonuc)), key=f"sonuc_{secim}", label_visibility="collapsed",
                             format_func=lambda k: ", ".join(x for x in (sonuc[k]["name"], sonuc[k].get("admin1"),
                                                                         sonuc[k].get("country")) if x))
            s = sonuc[i]
            st.session_state.konum = {"ad": s["name"], "lat": s["latitude"], "lon": s["longitude"],
                                      "tz": s.get("timezone") or "auto", "rakim": s.get("elevation"),
                                      "bolge": ", ".join(x for x in (s.get("admin1"), s.get("country")) if x)}

    rakim = s.get("elevation")
    st.caption(f"{s['latitude']:.2f}° K, {s['longitude']:.2f}° D"
               + (f" · {rakim:.0f} m" if isinstance(rakim, (int, float)) else "")
               + f" · {s.get('timezone', '?')}", width="stretch", help="Saatler konumun yerel saatidir.")
    tazelik_yeri = st.empty()                   # veri saati rozeti: sayfa çalıştıktan sonra doldurulur
    noktalar = kayit.oku()
    with st.popover("", icon=":material/bookmarks:", key="noktalarim", help="Noktalarım: kayıtlı yerler"):
        if noktalar:
            st.pills("Kayıtlı noktalar", [n["ad"] for n in noktalar], key="kayitli_secim", on_change=kayitli_sec)
        else:
            st.caption("Henüz kayıtlı nokta yok. Sık baktığın yerleri (av noktası, yayla, kamp yeri) kaydedip tek "
                       "dokunuşla seçebilirsin.")
        anahtar = f"kayit_adi_{st.session_state.konum['lat']}_{st.session_state.konum['lon']}"
        st.text_input("Bu konumu kaydet", value=st.session_state.konum["ad"], key=anahtar,
                      help="Örn. \"Tirebolu açığı – lüfer\". Aynı adla kaydedersen eski kaydın yerini alır.")
        st.button("Kaydet", icon=":material/bookmark_add:", on_click=kaydet, args=(anahtar,), type="primary",
                  width="stretch")
        if noktalar:
            st.caption("Sil")
            for n in noktalar:
                st.button(n["ad"], icon=":material/delete:", key=f"sil_{n['ad']}", on_click=kayit.sil,
                          args=(n["ad"],), width="stretch")

# ---------------------------------------------------------------- ayarlar: üst gezinme çubuğunda, Öğren'in yanında dişli
# Kenar çubuğu yok. Açılır pencere sayfa akışında oluşturulur, küçük bir betik onu gezinme çubuğunun son menüsünün
# hemen sağına sabitler (dar ekranda menü toplanınca sağ üste). Konumlama: tasarim.py, .st-key-ayarlar.
def turu_baslat():
    st.session_state.rehber = 1
    st.session_state.tura_git = True


with st.popover("", icon=":material/settings:", key="ayarlar", help="Ayarlar"):
    st.markdown("**Ayarlar**")
    st.slider("Tahmin süresi (gün)", 2, 10, 5, key="gun",
              help="Meteogram, modeller, ansambl ve uyarılar bu aralığı kullanır. Uzadıkça belirsizlik artar.")
    st.toggle("Örnek veri (çevrimdışı)", key="ornek_veri",
              value=os.environ.get("HAVA_ORNEK", "") in ("1", "true", "evet"),
              help="Geliştirme ve deneme için: veri servislerine hiç istek atmadan sentetik bir senaryo (geçen bir "
                   "alçak basınç sistemi, yağış, kuvvetli rüzgâr, don, sis) gösterir. Değerler gerçek değildir. "
                   "Radar ve uydu görüntüsü yine gerçektir.")
    st.divider()
    st.button("Sayfa turunu başlat", icon=":material/tour:", on_click=turu_baslat, width="stretch",
              help="Genel bakış sayfasının bölümlerini dört adımda tanıtır.")
    st.caption(":material/touch_app: Canlı radar ya da Tahmin haritaları sayfasında bir noktaya tıklayarak da konum "
               "seçebilirsin.")
    st.caption("Veri: [Open-Meteo](https://open-meteo.com) (CC BY 4.0) · ECMWF, DWD, NOAA, Météo-France, "
               "UK Met Office modelleri · ölçümler: NOAA Aviation Weather Center, Iowa Environmental Mesonet · yer "
               "adları: [GeoNames](https://www.geonames.org) (CC BY 4.0)")
st.html("""<script>
(() => {
  if (window.__ayarKur) return; window.__ayarKur = true;
  const yerlestir = () => {
    const el = document.querySelector('.st-key-ayarlar');
    if (!el) return;
    const ogeler = [...document.querySelectorAll('[data-testid="stTopNav"] > div')].filter(e => e.offsetWidth > 0);
    const son = ogeler[ogeler.length - 1];
    const h = document.querySelector('header[data-testid="stHeader"]');
    if (window.matchMedia('(max-width: 640px)').matches) {   // telefonda dişli alt menünün sağ ucunda (CSS)
      el.style.left = el.style.right = el.style.top = '';
    } else if (son) {
      const r = son.getBoundingClientRect();
      el.style.left = (r.right + 6) + 'px'; el.style.right = 'auto';
      el.style.top = (r.top + r.height / 2 - el.offsetHeight / 2) + 'px';
    } else if (h) {
      const r = h.getBoundingClientRect();
      el.style.left = 'auto'; el.style.right = '56px';
      el.style.top = (r.top + r.height / 2 - el.offsetHeight / 2) + 'px';
    }
    el.classList.add('ayar-hazir');
  };
  // 24 saat destesi: telefonda sekmeye dokununca o karta kayar, kaydırınca sekme güncellenir
  const deste = () => {
    const blok = document.querySelector('.st-key-esit_satir_deste [data-testid="stHorizontalBlock"]');
    const sekme = document.querySelector('.deste-sekme');
    if (!blok || !sekme || blok.dataset.bagli) return;
    blok.dataset.bagli = '1';
    const kartlar = () => [...blok.querySelectorAll(':scope > [data-testid="stColumn"]')];
    sekme.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = kartlar()[+b.dataset.i]; if (k) blok.scrollTo({ left: k.offsetLeft - blok.offsetLeft, behavior: 'smooth' });
    });
    blok.addEventListener('scroll', () => {
      const i = Math.round(blok.scrollLeft / Math.max(1, (kartlar()[1]?.offsetLeft || 1) - (kartlar()[0]?.offsetLeft || 0)));
      sekme.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === i));
    }, { passive: true });
  };
  setInterval(() => { yerlestir(); deste(); }, 400); window.addEventListener('resize', yerlestir); yerlestir();
})();
</script>""", unsafe_allow_javascript=True)
# Telefonda alt menü (masaüstünde gizli; CSS: tasarim.py, st-key-alt_menu): bölümlerin ilk sayfaları. Dişli (Ayarlar)
# telefonda bu menünün sağ ucuna yerleşir.
with st.container(key="alt_menu", horizontal=True, horizontal_alignment="distribute", gap=None):
    for ad, (bolum, i) in {"Genel": ("", 0), "Tahmin": ("Tahmin", 0), "Deniz": ("Deniz", 0), "Atmosfer": ("Atmosfer", 0)}.items():
        hedef = MENU[bolum][i]
        st.page_link(hedef, label=ad, icon=hedef.icon)

if st.session_state.pop("tura_git", False) and sayfa.url_path != "":
    st.switch_page("app_pages/genel.py")

if st.session_state.get("ornek_veri"):
    st.badge("Örnek veri modu: gösterilen değerler sentetiktir, gerçek tahmin değildir", icon=":material/science:",
             color="orange")
st.session_state["veri_tazelik"] = {"eski": None}   # her çalıştırmada sıfırlanır; getir() eskiye düşerse doldurur
try:
    sayfa.run()
finally:
    rozet, aciklama = tazelik()
    tazelik_yeri.markdown(rozet, help=aciklama, width="content")
