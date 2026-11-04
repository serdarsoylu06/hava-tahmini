"""Sayfalarda tekrar eden arayüz parçaları."""
import streamlit as st

SAYFA_AD = {
    "app_pages/genel.py": "Genel bakış", "app_pages/meteogram.py": "Meteogram",
    "app_pages/modeller.py": "Modeller", "app_pages/ansambl.py": "Ansambl",
    "app_pages/haritalar.py": "Tahmin haritaları", "app_pages/profil.py": "Atmosfer profili",
    "app_pages/balikcilik.py": "Balıkçılık ve deniz", "app_pages/canli.py": "Canlı radar ve uydu",
    "app_pages/dogrulama.py": "Tahmin doğrulaması", "app_pages/iklim.py": "İklim ve geçmiş",
}
_KUTU = {"tehlike": st.error, "dikkat": st.warning, "bilgi": st.info, "iyi": st.success}


def uyari_kartlari(liste, sayfa=None, sutun=2):
    """Uyarıları kart olarak dizer. `sayfa` verilirse yalnızca o sayfada izlenen uyarılar gösterilir
    ve kendi sayfasına bağlantı verilmez."""
    if sayfa:
        liste = [u for u in liste if u.bak == sayfa and u.seviye != "iyi"]
        if not liste:
            return
    kol = st.columns(sutun)
    for i, u in enumerate(liste):
        with kol[i % sutun]:
            _KUTU[u.seviye](u.ozet, title=u.baslik, icon=u.ikon)
            with st.expander("Neden önemli, nereye bakmalı?", icon=":material/school:"):
                st.markdown(u.neden)
                st.markdown(f"**Nereye bak:** {u.bak_ne}")
                if u.bak != sayfa:
                    st.page_link(u.bak, label=f"{SAYFA_AD[u.bak]} sayfasına git", icon=":material/arrow_forward:")


def okuma_rehberi(adimlar, baslik="Bu grafik nasıl okunur?"):
    """Numaralı, adım adım okuma rehberi."""
    with st.expander(baslik, icon=":material/menu_book:"):
        for i, (b, metin) in enumerate(adimlar, 1):
            st.markdown(f"**{i}. {b}** — {metin}")


def gun_sayisi():
    return st.session_state.get("gun", 5)
