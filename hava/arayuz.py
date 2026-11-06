"""Sayfalarda tekrar eden arayüz parçaları."""
import streamlit as st

SAYFA_AD = {
    "app_pages/genel.py": "Genel bakış", "app_pages/meteogram.py": "Meteogram",
    "app_pages/modeller.py": "Modeller", "app_pages/ansambl.py": "Ansambl",
    "app_pages/haritalar.py": "Tahmin haritaları", "app_pages/profil.py": "Atmosfer profili",
    "app_pages/balikcilik.py": "Balıkçılık ve deniz", "app_pages/canli.py": "Canlı radar ve uydu",
    "app_pages/dogrulama.py": "Tahmin doğrulaması", "app_pages/iklim.py": "İklim ve geçmiş",
}


def uyari_kartlari(liste, sayfa=None, sutun=2):
    """Uyarıları kart olarak dizer. `sayfa` verilirse yalnızca o sayfada izlenen uyarılar gösterilir
    ve kendi sayfasına bağlantı verilmez."""
    if sayfa:
        liste = [u for u in liste if u.bak == sayfa and u.seviye != "iyi"]
        if not liste:
            return
    # Satır satır dizilir ki aynı satırdaki kutular eşit yükseklikte olsun (CSS: tasarim.py, st-key-uyari_satir).
    # İki uyarı varken üç sütun açılıp sağda boşluk kalmasın diye sütun sayısı uyarı sayısını geçmez.
    sutun = max(1, min(sutun, len(liste)))
    # Kompakt kart: başlık + tek satır özet; "neden önemli, nereye bakmalı?" ayrı bir kutu yerine kartın sağındaki
    # küçük düğmenin açılır penceresinde. Renk seviyeyi söyler (CSS: tasarim.py, st-key-uk_<seviye>).
    for r in range(0, len(liste), sutun):
        kol = st.container(key=f"uyari_satir_{sayfa or 'genel'}_{r}").columns(sutun)
        for j, (k, u) in enumerate(zip(kol, liste[r:r + sutun])):
            with k, st.container(key=f"uk_{u.seviye}_{sayfa or 'genel'}_{r + j}".replace("/", "_").replace(".", "_"),
                                 horizontal=True, vertical_alignment="top", gap="small"):
                st.markdown(f"**{u.ikon} {u.baslik}**  \n{u.ozet}", width="stretch")
                with st.popover("", icon=":material/school:", help="Neden önemli, nereye bakmalı?"):
                    st.markdown(f"**{u.baslik}**")
                    st.markdown(u.neden)
                    st.markdown(f"**Nereye bak:** {u.bak_ne}")
                    if u.bak != sayfa:
                        st.page_link(u.bak, label=f"{SAYFA_AD[u.bak]} sayfasına git",
                                     icon=":material/arrow_forward:")


def okuma_rehberi(adimlar, baslik="Bu grafik nasıl okunur?"):
    """Numaralı, adım adım okuma rehberi."""
    with st.expander(baslik, icon=":material/menu_book:"):
        for i, (b, metin) in enumerate(adimlar, 1):
            st.markdown(f"**{i}. {b}** — {metin}")


def gun_sayisi():
    return st.session_state.get("gun", 5)
